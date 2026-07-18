import type { BoardGameSpec } from "@boardforge/game-spec";
import { GameNightRuleError, validateComposedTeamSelection } from "@boardforge/game-engine";
import type { GameNightSessionRecord } from "./persistence";
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
): { teamByPlayer: Map<string, string>; captainByTeam: Map<string, string> } {
  if (spec.template !== "composed" || spec.setup.mode !== "teams" || !spec.setup.teamPolicy) {
    return { teamByPlayer: new Map(), captainByTeam: new Map() };
  }
  const specTeams = spec.setup.teamPolicy.teams;
  if (specTeams.length !== session.state.teams.length) {
    throw new GameNightRuleError(
      `This game supports ${specTeams.length} teams, but the game night has ${session.state.teams.length}.`,
    );
  }

  const teamByPlayer = new Map<string, string>();
  const captainByTeam = new Map<string, string>();
  const requiresCaptains = spec.actions.some((action) => action.actor === "team_captain");
  session.state.teams.forEach((nightTeam, index) => {
    const specTeam = specTeams[index];
    if (!specTeam) throw new GameNightRuleError("The game team layout is incomplete.");
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
  return { teamByPlayer, captainByTeam };
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
  const { teamByPlayer, captainByTeam } = teamAssignmentsForSpec(session, spec);

  return {
    code: roomCode,
    blueprintId,
    gameNightId: session.id,
    gameInstanceId,
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
