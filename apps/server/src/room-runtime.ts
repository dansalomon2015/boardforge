import type { Server as SocketServer } from "socket.io";
import type { BoardGameSpec } from "@boardforge/game-spec";
import {
  GameRuleError,
  projectComposedGameState,
  projectGameState,
  stateChecksum,
  validateComposedTeamSelection,
  type ComposedGameState,
  type GameState,
} from "@boardforge/game-engine";
import type { GameAction, LobbyView, PublicPlayer, RoomView } from "@boardforge/shared";
import type { RoomEventRecord, RoomSessionRecord } from "./persistence";
import { gameSummary } from "./game-catalog";

export type Room = {
  code: string;
  blueprintId: string;
  spec: BoardGameSpec;
  players: Map<string, PublicPlayer>;
  socketByPlayer: Map<string, string>;
  reconnectTokenHashes: Map<string, string>;
  lobbyTeamByPlayer: Map<string, string>;
  lobbyCaptainByTeam: Map<string, string>;
  seed: string | null;
  eventSequence: number;
  operationQueue: Promise<void>;
  timingStartedAtByPlayer: Map<string, number>;
  state: GameState | ComposedGameState | null;
};

export type TimingActionKind = "timing_start" | "timing_stop" | "timing_advance";

export function timingActionKind(spec: BoardGameSpec, action: GameAction): TimingActionKind | null {
  if (spec.template !== "composed" || action.type !== "COMPOSED_ACTION") return null;
  const kind = spec.actions.find((candidate) => candidate.id === action.actionId)?.kind;
  return kind === "timing_start" || kind === "timing_stop" || kind === "timing_advance" ? kind : null;
}

function actionWithoutServerTiming(spec: BoardGameSpec, action: GameAction): GameAction {
  if (timingActionKind(spec, action) !== "timing_stop" || action.type !== "COMPOSED_ACTION") return action;
  const { elapsedMs: _elapsedMs, ...clientPayload } = action.payload ?? {};
  return {
    ...action,
    ...(Object.keys(clientPayload).length > 0 ? { payload: clientPayload } : { payload: undefined }),
  };
}

export function sameRequestedAction(spec: BoardGameSpec, received: GameAction, persisted: GameAction): boolean {
  return (
    JSON.stringify(actionWithoutServerTiming(spec, received)) ===
    JSON.stringify(actionWithoutServerTiming(spec, persisted))
  );
}

export function restoreTimingStarts(spec: BoardGameSpec, events: RoomEventRecord[]): Map<string, number> {
  const starts = new Map<string, number>();
  for (const event of events) {
    const kind = timingActionKind(spec, event.action);
    if (kind === "timing_start") starts.set(event.actorId, Date.parse(event.createdAt));
    if (kind === "timing_stop") starts.delete(event.actorId);
    if (kind === "timing_advance") starts.clear();
  }
  return starts;
}

export function checkpointChecksumMatches(
  state: GameState | ComposedGameState,
  storedCheckpoint: unknown,
  storedChecksum: string,
): boolean {
  if (stateChecksum(state) === storedChecksum) return true;
  if (typeof storedCheckpoint !== "object" || storedCheckpoint === null || Array.isArray(storedCheckpoint))
    return false;
  const current = state as unknown as Record<string, unknown>;
  const legacyProjection: Record<string, unknown> = {};
  for (const key of Object.keys(storedCheckpoint)) {
    if (!(key in current)) return false;
    legacyProjection[key] = current[key];
  }
  return stateChecksum(legacyProjection as unknown as GameState) === storedChecksum;
}

export function allocateRoomCode(rooms: ReadonlyMap<string, Room>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Could not allocate a unique room code.");
}

export function publicPlayers(room: Room): PublicPlayer[] {
  return [...room.players.values()];
}

export function persistedRoom(room: Room, state: Room["state"] = room.state): Omit<RoomSessionRecord, "events"> {
  return {
    code: room.code,
    blueprintId: room.blueprintId,
    players: publicPlayers(room),
    reconnectTokenHashes: Object.fromEntries(room.reconnectTokenHashes),
    lobbyTeamByPlayer: Object.fromEntries(room.lobbyTeamByPlayer),
    lobbyCaptainByTeam: Object.fromEntries(room.lobbyCaptainByTeam),
    seed: room.seed,
    checkpoint: state,
    checkpointChecksum: state ? stateChecksum(state) : null,
    checkpointRevision: state?.revision ?? null,
  };
}

export function enqueueRoom<T>(room: Room, operation: () => Promise<T>): Promise<T> {
  const result = room.operationQueue.then(operation, operation);
  room.operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function viewFor(room: Room, playerId: string): RoomView {
  const players = publicPlayers(room);
  if (!room.state) {
    const playerIds = players.map((player) => player.id);
    const selectedTeams = Object.fromEntries(
      [...room.lobbyTeamByPlayer.entries()].filter(([id]) => room.players.has(id)),
    );
    const composedStart =
      room.spec.template === "composed" ? validateComposedTeamSelection(room.spec, playerIds, selectedTeams) : null;
    const teamPolicy =
      room.spec.template === "composed" && room.spec.setup.mode === "teams" ? room.spec.setup.teamPolicy : undefined;
    const requiresCaptains =
      room.spec.template === "composed" && room.spec.actions.some((action) => action.actor === "team_captain");
    const missingCaptainTeam = requiresCaptains
      ? teamPolicy?.teams.find((team) => {
          const captainId = room.lobbyCaptainByTeam.get(team.id);
          return !captainId || selectedTeams[captainId] !== team.id;
        })
      : undefined;
    const teamSelectionReady = composedStart
      ? composedStart.ok
      : players.length >= room.spec.minPlayers && players.length <= room.spec.maxPlayers;
    const canStart = teamSelectionReady && !missingCaptainTeam;
    const view: LobbyView = {
      kind: "lobby",
      code: room.code,
      game: gameSummary(room.spec),
      players,
      selfPlayerId: playerId,
      canStart,
      ...(!canStart
        ? {
            startBlockReason:
              composedStart && !composedStart.ok
                ? composedStart.reason
                : missingCaptainTeam
                  ? `Choose a captain for ${missingCaptainTeam.name}.`
                  : `${Math.max(0, room.spec.minPlayers - players.length)} more player(s) required.`,
          }
        : {}),
      ...(teamPolicy
        ? {
            teamSetup: {
              teams: teamPolicy.teams.map((team) => ({
                ...team,
                playerIds: players.filter((player) => selectedTeams[player.id] === team.id).map((player) => player.id),
                ...(room.lobbyCaptainByTeam.get(team.id)
                  ? { captainPlayerId: room.lobbyCaptainByTeam.get(team.id) }
                  : {}),
                ...(teamPolicy.maxMembersPerTeam ? { maxMembers: teamPolicy.maxMembersPerTeam } : {}),
              })),
              ...(selectedTeams[playerId] ? { selfTeamId: selectedTeams[playerId] } : {}),
              allowUnevenTeams: teamPolicy.allowUnevenTeams,
            },
          }
        : {}),
    };
    return view;
  }
  if (room.state.template === "composed" && room.spec.template === "composed") {
    return projectComposedGameState(room.state, room.spec, players, room.code, playerId);
  }
  if (room.state.template !== "composed" && room.spec.template !== "composed") {
    return projectGameState(room.state, room.spec, players, room.code, playerId);
  }
  throw new GameRuleError("State and GameSpec templates do not match.");
}

export function emitRoom(io: SocketServer, room: Room): void {
  for (const [playerId, socketId] of room.socketByPlayer.entries()) {
    if (!room.players.get(playerId)?.connected) continue;
    io.to(socketId).emit("room:state", viewFor(room, playerId));
  }
}
