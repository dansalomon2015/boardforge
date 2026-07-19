export type GameNightTeam = {
  id: string;
  name: string;
  color?: string | undefined;
  playerIds: string[];
  captainPlayerId?: string | undefined;
};

export type GameNightAssignments = {
  teamByPlayer: Record<string, string>;
  captainByTeam: Record<string, string>;
};

export type GameNightScorePolicy = {
  winPoints: number;
  tiePoints: number;
};

export type GameNightGameConfiguration = {
  rounds: number;
  turnSeconds: number;
};

export type GameNightScoreEvent = {
  id: string;
  gameInstanceId: string;
  teamId: string;
  points: number;
  reason: "win" | "tie";
};

export type GameNightCompletedGame = {
  gameInstanceId: string;
  blueprintId: string;
  resultIdempotencyKey: string;
  winner: { kind: "players" | "teams" | "none"; ids: string[] };
  awardedTeamIds: string[];
  scoreEventIds: string[];
};

export type GameNightState = {
  id: string;
  status: "lobby" | "playing" | "completed";
  selectedBlueprintId: string | null;
  selectedGameConfiguration: GameNightGameConfiguration | null;
  teams: GameNightTeam[];
  scores: Record<string, number>;
  completedGames: GameNightCompletedGame[];
  scoreEvents: GameNightScoreEvent[];
};

export type RecordGameNightResultInput = {
  gameInstanceId: string;
  blueprintId: string;
  winner: GameNightCompletedGame["winner"];
  idempotencyKey: string;
};

export const defaultGameNightScorePolicy: GameNightScorePolicy = {
  winPoints: 3,
  tiePoints: 1,
};

export class GameNightRuleError extends Error {}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sameResult(completed: GameNightCompletedGame, input: RecordGameNightResultInput): boolean {
  return (
    completed.blueprintId === input.blueprintId &&
    completed.winner.kind === input.winner.kind &&
    JSON.stringify(completed.winner.ids) === JSON.stringify(input.winner.ids)
  );
}

function winningTeamIds(state: GameNightState, winner: GameNightCompletedGame["winner"]): string[] {
  if (winner.kind === "none") return [];
  if (winner.kind === "teams") return unique(winner.ids);

  const teamByPlayerId = new Map(
    state.teams.flatMap((team) => team.playerIds.map((playerId) => [playerId, team.id] as const)),
  );
  return unique(
    winner.ids.map((playerId) => {
      const teamId = teamByPlayerId.get(playerId);
      if (!teamId) throw new GameNightRuleError(`Winner ${playerId} does not belong to a game-night team.`);
      return teamId;
    }),
  );
}

export function createGameNightState(id: string, teams: GameNightTeam[]): GameNightState {
  if (teams.length < 2) throw new GameNightRuleError("A game night requires at least two teams.");
  const teamIds = teams.map((team) => team.id);
  if (new Set(teamIds).size !== teamIds.length) throw new GameNightRuleError("Game-night team ids must be unique.");
  const playerIds = teams.flatMap((team) => team.playerIds);
  if (new Set(playerIds).size !== playerIds.length)
    throw new GameNightRuleError("A player cannot belong to more than one game-night team.");
  for (const team of teams) {
    if (team.color && !/^#[0-9a-fA-F]{6}$/.test(team.color))
      throw new GameNightRuleError(`Team ${team.id} must use a valid hexadecimal color.`);
    if (team.captainPlayerId && !team.playerIds.includes(team.captainPlayerId)) {
      throw new GameNightRuleError(`Captain for team ${team.id} must belong to that team.`);
    }
  }

  return {
    id,
    status: "lobby",
    selectedBlueprintId: null,
    selectedGameConfiguration: null,
    teams: structuredClone(teams),
    scores: Object.fromEntries(teamIds.map((teamId) => [teamId, 0])),
    completedGames: [],
    scoreEvents: [],
  };
}

export function gameNightAssignments(state: GameNightState, requiresCaptains: boolean): GameNightAssignments {
  const teamByPlayer = Object.fromEntries(
    state.teams.flatMap((team) => team.playerIds.map((playerId) => [playerId, team.id] as const)),
  );
  const captainByTeam: Record<string, string> = {};
  if (requiresCaptains) {
    for (const team of state.teams) {
      if (!team.captainPlayerId) throw new GameNightRuleError(`Choose a captain for ${team.name} before starting.`);
      captainByTeam[team.id] = team.captainPlayerId;
    }
  }
  return { teamByPlayer, captainByTeam };
}

export function completeGameNight(state: GameNightState): GameNightState {
  if (state.status === "completed") return state;
  if (state.completedGames.length === 0) {
    throw new GameNightRuleError("Play at least one game before ending the Game Night.");
  }

  return {
    ...state,
    status: "completed",
    selectedBlueprintId: null,
    selectedGameConfiguration: null,
  };
}

export function recordGameNightResult(
  state: GameNightState,
  input: RecordGameNightResultInput,
  policy: GameNightScorePolicy = defaultGameNightScorePolicy,
): GameNightState {
  if (policy.winPoints < 0 || policy.tiePoints < 0)
    throw new GameNightRuleError("Game-night score awards cannot be negative.");
  if (state.status === "completed") throw new GameNightRuleError("A completed game night cannot accept new results.");

  const existingResult = state.completedGames.find((game) => game.resultIdempotencyKey === input.idempotencyKey);
  const existingGame = state.completedGames.find((game) => game.gameInstanceId === input.gameInstanceId);
  if (existingResult || existingGame) {
    if (existingGame && existingGame.resultIdempotencyKey === input.idempotencyKey && sameResult(existingGame, input))
      return state;
    throw new GameNightRuleError("This game result conflicts with an outcome that was already recorded.");
  }

  const knownTeamIds = new Set(state.teams.map((team) => team.id));
  const awardedTeamIds = winningTeamIds(state, input.winner);
  for (const teamId of awardedTeamIds) {
    if (!knownTeamIds.has(teamId)) throw new GameNightRuleError(`Unknown winning team: ${teamId}.`);
  }

  const isTie = awardedTeamIds.length > 1;
  const points = isTie ? policy.tiePoints : policy.winPoints;
  const reason = isTie ? "tie" : "win";
  const scoreEvents = awardedTeamIds.map<GameNightScoreEvent>((teamId, index) => ({
    id: index === 0 ? input.idempotencyKey : `${input.idempotencyKey}:${teamId}`,
    gameInstanceId: input.gameInstanceId,
    teamId,
    points,
    reason,
  }));
  const scores = { ...state.scores };
  for (const event of scoreEvents) scores[event.teamId] = (scores[event.teamId] ?? 0) + event.points;

  return {
    ...state,
    status: "playing",
    scores,
    scoreEvents: [...state.scoreEvents, ...scoreEvents],
    completedGames: [
      ...state.completedGames,
      {
        gameInstanceId: input.gameInstanceId,
        blueprintId: input.blueprintId,
        resultIdempotencyKey: input.idempotencyKey,
        winner: structuredClone(input.winner),
        awardedTeamIds,
        scoreEventIds: scoreEvents.map((event) => event.id),
      },
    ],
  };
}
