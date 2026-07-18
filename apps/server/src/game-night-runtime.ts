import type { BoardGameSpec } from "@boardforge/game-spec";
import {
  completeGameNight,
  GameNightRuleError,
  recordGameNightResult,
  validateComposedTeamSelection,
  type ComposedGameState,
} from "@boardforge/game-engine";
import type { GameNightSessionRecord, GameNightTeamPresentation } from "./persistence";
import type { Room } from "./room-runtime";

type CreateGameNightChildRoomInput = {
  session: GameNightSessionRecord;
  blueprintId: string;
  spec: BoardGameSpec;
  roomCode: string;
  gameInstanceId: string;
};

function teamAssignmentsForSpec(
  session: GameNightSessionRecord,
  spec: BoardGameSpec,
): {
  teamByPlayer: Map<string, string>;
  captainByTeam: Map<string, string>;
  gameNightTeamByGameTeam: Map<string, string>;
  gameNightTeamPresentationByGameTeam: Map<string, GameNightTeamPresentation>;
} {
  if (spec.template !== "composed" || spec.setup.mode !== "teams" || !spec.setup.teamPolicy) {
    return {
      teamByPlayer: new Map(),
      captainByTeam: new Map(),
      gameNightTeamByGameTeam: new Map(),
      gameNightTeamPresentationByGameTeam: new Map(),
    };
  }
  const specTeams = spec.setup.teamPolicy.teams;
  if (specTeams.length !== session.state.teams.length) {
    throw new GameNightRuleError(
      `This game supports ${specTeams.length} teams, but the game night has ${session.state.teams.length}.`,
    );
  }

  const teamByPlayer = new Map<string, string>();
  const captainByTeam = new Map<string, string>();
  const gameNightTeamByGameTeam = new Map<string, string>();
  const gameNightTeamPresentationByGameTeam = new Map<string, GameNightTeamPresentation>();
  const requiresCaptains = spec.actions.some((action) => action.actor === "team_captain");
  session.state.teams.forEach((nightTeam, index) => {
    const specTeam = specTeams[index];
    if (!specTeam) throw new GameNightRuleError("The game team layout is incomplete.");
    gameNightTeamByGameTeam.set(specTeam.id, nightTeam.id);
    gameNightTeamPresentationByGameTeam.set(specTeam.id, {
      name: nightTeam.name,
      color: nightTeam.color ?? specTeam.color,
    });
    for (const playerId of nightTeam.playerIds) teamByPlayer.set(playerId, specTeam.id);
    if (requiresCaptains) {
      if (!nightTeam.captainPlayerId)
        throw new GameNightRuleError(`Choose a captain for ${nightTeam.name} before starting this game.`);
      captainByTeam.set(specTeam.id, nightTeam.captainPlayerId);
    }
  });

  const playerIds = session.players.map((player) => player.id);
  const assignment = validateComposedTeamSelection(spec, playerIds, Object.fromEntries(teamByPlayer));
  if (!assignment.ok) throw new GameNightRuleError(assignment.reason);
  return { teamByPlayer, captainByTeam, gameNightTeamByGameTeam, gameNightTeamPresentationByGameTeam };
}

export function createGameNightChildRoom({
  session,
  blueprintId,
  spec,
  roomCode,
  gameInstanceId,
}: CreateGameNightChildRoomInput): Room {
  if (session.currentRoomCode) throw new GameNightRuleError("Finish the current game before starting another one.");
  if (session.state.status === "completed") throw new GameNightRuleError("This game night is already complete.");
  if (session.players.length < spec.minPlayers || session.players.length > spec.maxPlayers) {
    throw new GameNightRuleError(`This game needs between ${spec.minPlayers} and ${spec.maxPlayers} players.`);
  }
  const { teamByPlayer, captainByTeam, gameNightTeamByGameTeam, gameNightTeamPresentationByGameTeam } =
    teamAssignmentsForSpec(session, spec);

  return {
    code: roomCode,
    blueprintId,
    gameNightId: session.id,
    gameInstanceId,
    gameNightTeamByGameTeam,
    gameNightTeamPresentationByGameTeam,
    spec,
    players: new Map(session.players.map((player) => [player.id, { ...player, connected: false }])),
    socketByPlayer: new Map(),
    reconnectTokenHashes: new Map(Object.entries(session.reconnectTokenHashes)),
    lobbyTeamByPlayer: teamByPlayer,
    lobbyCaptainByTeam: captainByTeam,
    seed: null,
    eventSequence: 0,
    operationQueue: Promise.resolve(),
    timingStartedAtByPlayer: new Map(),
    countdown: null,
    state: null,
  };
}

export function linkGameNightToChildRoom(
  session: GameNightSessionRecord,
  room: Pick<Room, "code" | "gameNightId">,
): GameNightSessionRecord {
  if (room.gameNightId !== session.id) throw new GameNightRuleError("The room belongs to a different game night.");
  return {
    ...session,
    currentRoomCode: room.code,
    state: { ...session.state, status: "playing" },
  };
}

export function selectGameNightTeam(
  session: GameNightSessionRecord,
  playerId: string,
  teamId: string,
): GameNightSessionRecord {
  if (session.currentRoomCode) throw new GameNightRuleError("Teams are locked during a game.");
  if (!session.players.some((player) => player.id === playerId)) throw new GameNightRuleError("Unknown player.");
  const target = session.state.teams.find((team) => team.id === teamId);
  if (!target) throw new GameNightRuleError("Unknown team.");
  if (!target.playerIds.includes(playerId) && target.playerIds.length >= 6)
    throw new GameNightRuleError("This team is full.");

  return {
    ...session,
    state: {
      ...session.state,
      teams: session.state.teams.map((team) => ({
        ...team,
        playerIds:
          team.id === target.id
            ? [...team.playerIds.filter((id) => id !== playerId), playerId]
            : team.playerIds.filter((id) => id !== playerId),
        ...(team.captainPlayerId === playerId && team.id !== target.id ? { captainPlayerId: undefined } : {}),
      })),
    },
  };
}

export function openGameNightBoard(session: GameNightSessionRecord, playerId: string): GameNightSessionRecord {
  if (playerId !== session.hostPlayerId) throw new GameNightRuleError("Only the host can open the Game Night board.");
  if (session.state.status === "completed") throw new GameNightRuleError("This Game Night is already complete.");
  if (session.currentRoomCode)
    throw new GameNightRuleError("The Game Night board is already open with an active game.");
  if (session.state.status === "playing") return session;

  const assignedPlayerIds = new Set(session.state.teams.flatMap((team) => team.playerIds));
  if (session.players.some((player) => !assignedPlayerIds.has(player.id))) {
    throw new GameNightRuleError("Every player must choose a team before opening the board.");
  }
  if (session.state.teams.some((team) => team.playerIds.length === 0)) {
    throw new GameNightRuleError("Every team needs at least one player before opening the board.");
  }

  return {
    ...session,
    state: { ...session.state, status: "playing" },
  };
}

export function endGameNight(session: GameNightSessionRecord, playerId: string): GameNightSessionRecord {
  if (playerId !== session.hostPlayerId) throw new GameNightRuleError("Only the host can end the Game Night.");
  if (session.currentRoomCode) throw new GameNightRuleError("Finish the current game before ending the Game Night.");

  return {
    ...session,
    state: completeGameNight(session.state),
  };
}

export function selectGameNightGame(
  session: GameNightSessionRecord,
  playerId: string,
  blueprintId: string,
): GameNightSessionRecord {
  if (playerId !== session.hostPlayerId) throw new GameNightRuleError("Only the host can choose the next game.");
  if (session.state.status === "lobby")
    throw new GameNightRuleError("Open the Game Night board before choosing a game.");
  if (session.state.status === "completed") throw new GameNightRuleError("This Game Night is already complete.");
  if (session.currentRoomCode) throw new GameNightRuleError("Finish the current game before choosing another one.");
  if (session.state.selectedBlueprintId === blueprintId) return session;

  return {
    ...session,
    state: { ...session.state, selectedBlueprintId: blueprintId },
  };
}

export function selectGameNightCaptain(
  session: GameNightSessionRecord,
  playerId: string,
  teamId: string,
  captainPlayerId: string,
): GameNightSessionRecord {
  if (playerId !== session.hostPlayerId) throw new GameNightRuleError("Only the host can choose captains.");
  if (session.state.status === "completed") throw new GameNightRuleError("This Game Night is already complete.");
  if (session.currentRoomCode) throw new GameNightRuleError("Captains are locked during a game.");
  const target = session.state.teams.find((team) => team.id === teamId);
  if (!target) throw new GameNightRuleError("Unknown team.");
  if (!target.playerIds.includes(captainPlayerId)) {
    throw new GameNightRuleError("The captain must belong to the selected team.");
  }
  if (target.captainPlayerId === captainPlayerId) return session;

  return {
    ...session,
    state: {
      ...session.state,
      teams: session.state.teams.map((team) => (team.id === teamId ? { ...team, captainPlayerId } : { ...team })),
    },
  };
}

export function recordCompletedChildGame(
  session: GameNightSessionRecord,
  room: Pick<Room, "blueprintId" | "code" | "gameInstanceId" | "gameNightId" | "gameNightTeamByGameTeam">,
  state: Pick<ComposedGameState, "status" | "winner">,
): GameNightSessionRecord {
  if (!room.gameNightId || room.gameNightId !== session.id)
    throw new GameNightRuleError("The room belongs to a different game night.");
  if (!room.gameInstanceId) throw new GameNightRuleError("The child game has no game instance id.");
  if (state.status !== "completed" || !state.winner)
    throw new GameNightRuleError("The child game has not produced a final result.");

  const winner =
    state.winner.kind === "teams"
      ? {
          kind: "teams" as const,
          ids: state.winner.ids.map((gameTeamId) => {
            const gameNightTeamId = room.gameNightTeamByGameTeam.get(gameTeamId);
            if (!gameNightTeamId)
              throw new GameNightRuleError(`Game team ${gameTeamId} is not mapped to the parent game night.`);
            return gameNightTeamId;
          }),
        }
      : structuredClone(state.winner);
  const nextState = recordGameNightResult(session.state, {
    gameInstanceId: room.gameInstanceId,
    blueprintId: room.blueprintId,
    winner,
    idempotencyKey: `result:${room.gameInstanceId}`,
  });

  return {
    ...session,
    state: { ...nextState, selectedBlueprintId: null },
    currentRoomCode: null,
  };
}
