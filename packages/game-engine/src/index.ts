import type { GameSpec, HiddenRolesGameSpec, QuizVoteGameSpec } from "@boardforge/game-spec";
export * from "./composed-engine";
export * from "./playtest";
export * from "./replay";
import type {
  GameAction,
  HiddenRolesView,
  PublicPlayer,
  QuizVoteView,
  RoomView,
} from "@boardforge/shared";

type RoleAssignment = {
  id: string;
  name: string;
  team: "crew" | "saboteur";
  objective: string;
};

export type HiddenRolesState = {
  template: "hidden_roles";
  status: "playing" | "completed";
  revision: number;
  round: number;
  phase: "mission" | "vote" | "reveal" | "completed";
  playerOrder: string[];
  rolesByPlayer: Record<string, RoleAssignment>;
  missionChoices: Record<string, "success" | "sabotage">;
  votes: Record<string, string>;
  scores: { crew: number; saboteur: number };
  lastReveal: { sabotages: number; suspectedPlayerId: string | null } | null;
  winner: "crew" | "saboteur" | null;
};

export type QuizVoteState = {
  template: "quiz_vote";
  status: "playing" | "completed";
  revision: number;
  round: number;
  phase: "answer" | "reveal" | "completed";
  playerOrder: string[];
  answers: Record<string, string>;
  votes: Record<string, string>;
  scores: Record<string, number>;
  reveal: {
    correctOptionId: string | null;
    mostVotedPlayerId: string | null;
    explanation: string;
  } | null;
  winnerPlayerIds: string[];
};

export type GameState = HiddenRolesState | QuizVoteState;

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

function assertPlayer(state: GameState, actorId: string): void {
  if (!state.playerOrder.includes(actorId)) {
    throw new GameRuleError("Unknown player for this room.");
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const output = [...values];
  let state = hashSeed(seed) || 1;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = output[index];
    output[index] = output[swapIndex] as T;
    output[swapIndex] = current as T;
  }

  return output;
}

function initializeHiddenRoles(
  spec: HiddenRolesGameSpec,
  players: PublicPlayer[],
  seed: string,
): HiddenRolesState {
  const crewRole = spec.roles.find((role) => role.team === "crew");
  const saboteurRole = spec.roles.find((role) => role.team === "saboteur");
  if (!crewRole || !saboteurRole) {
    throw new GameRuleError("The GameSpec is missing a required role team.");
  }

  const shuffled = seededShuffle(players.map((player) => player.id), seed);
  const saboteurCount = players.length >= 7 ? 2 : 1;
  const saboteurIds = new Set(shuffled.slice(0, saboteurCount));
  const rolesByPlayer = Object.fromEntries(
    players.map((player) => [player.id, saboteurIds.has(player.id) ? saboteurRole : crewRole]),
  );

  return {
    template: "hidden_roles",
    status: "playing",
    revision: 1,
    round: 1,
    phase: "mission",
    playerOrder: players.map((player) => player.id),
    rolesByPlayer,
    missionChoices: {},
    votes: {},
    scores: { crew: 0, saboteur: 0 },
    lastReveal: null,
    winner: null,
  };
}

function initializeQuizVote(spec: QuizVoteGameSpec, players: PublicPlayer[]): QuizVoteState {
  return {
    template: "quiz_vote",
    status: "playing",
    revision: 1,
    round: 1,
    phase: "answer",
    playerOrder: players.map((player) => player.id),
    answers: {},
    votes: {},
    scores: Object.fromEntries(players.map((player) => [player.id, 0])),
    reveal: null,
    winnerPlayerIds: [],
  };
}

export function initializeGame(spec: GameSpec, players: PublicPlayer[], seed: string): GameState {
  if (players.length < spec.minPlayers || players.length > spec.maxPlayers) {
    throw new GameRuleError(`This game requires ${spec.minPlayers}–${spec.maxPlayers} players.`);
  }
  return spec.template === "hidden_roles"
    ? initializeHiddenRoles(spec, players, seed)
    : initializeQuizVote(spec, players);
}

function mostVoted(votes: Record<string, string>, playerOrder: string[]): string | null {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  let winner: string | null = null;
  let winnerCount = -1;
  for (const playerId of playerOrder) {
    const count = counts.get(playerId) ?? 0;
    if (count > winnerCount) {
      winner = playerId;
      winnerCount = count;
    }
  }
  return winner;
}

function reduceHiddenRoles(
  state: HiddenRolesState,
  action: GameAction,
  actorId: string,
  isHost: boolean,
  spec: HiddenRolesGameSpec,
): HiddenRolesState {
  assertPlayer(state, actorId);
  if (state.status === "completed") {
    throw new GameRuleError("This game is already completed.");
  }

  const next = structuredClone(state);

  if (action.type === "SUBMIT_MISSION") {
    if (next.phase !== "mission") {
      throw new GameRuleError("Mission choices are closed.");
    }
    if (next.missionChoices[actorId]) {
      throw new GameRuleError("You already submitted a mission choice.");
    }
    const role = next.rolesByPlayer[actorId];
    if (!role) {
      throw new GameRuleError("Missing role assignment.");
    }
    if (action.choice === "sabotage" && role.team !== "saboteur") {
      throw new GameRuleError("Only a saboteur can sabotage a mission.");
    }
    next.missionChoices[actorId] = action.choice;

    if (Object.keys(next.missionChoices).length === next.playerOrder.length) {
      const sabotages = Object.values(next.missionChoices).filter((choice) => choice === "sabotage").length;
      if (sabotages > 0) {
        next.scores.saboteur += spec.scoring.saboteurMissionPoints;
      } else {
        next.scores.crew += spec.scoring.crewMissionPoints;
      }
      next.lastReveal = { sabotages, suspectedPlayerId: null };
      next.phase = "vote";
    }
  } else if (action.type === "CAST_VOTE") {
    if (next.phase !== "vote") {
      throw new GameRuleError("Voting is not open.");
    }
    if (!next.playerOrder.includes(action.targetPlayerId)) {
      throw new GameRuleError("Vote target is not in this room.");
    }
    if (next.votes[actorId]) {
      throw new GameRuleError("You already voted this round.");
    }
    next.votes[actorId] = action.targetPlayerId;

    if (Object.keys(next.votes).length === next.playerOrder.length) {
      const suspectedPlayerId = mostVoted(next.votes, next.playerOrder);
      if (suspectedPlayerId && next.rolesByPlayer[suspectedPlayerId]?.team === "saboteur") {
        next.scores.crew += spec.scoring.correctVoteBonus;
      }
      next.lastReveal = {
        sabotages: next.lastReveal?.sabotages ?? 0,
        suspectedPlayerId,
      };
      if (next.round >= spec.rounds) {
        next.status = "completed";
        next.phase = "completed";
        next.winner = next.scores.crew >= next.scores.saboteur ? "crew" : "saboteur";
      } else {
        next.phase = "reveal";
      }
    }
  } else if (action.type === "ADVANCE") {
    if (!isHost) {
      throw new GameRuleError("Only the host can advance the game.");
    }
    if (next.phase !== "reveal") {
      throw new GameRuleError("The current phase cannot be advanced yet.");
    }
    next.round += 1;
    next.phase = "mission";
    next.missionChoices = {};
    next.votes = {};
    next.lastReveal = null;
  } else {
    throw new GameRuleError("This action is not supported by the hidden-role engine.");
  }

  next.revision += 1;
  return next;
}

function reduceQuizVote(
  state: QuizVoteState,
  action: GameAction,
  actorId: string,
  isHost: boolean,
  spec: QuizVoteGameSpec,
): QuizVoteState {
  assertPlayer(state, actorId);
  if (state.status === "completed") {
    throw new GameRuleError("This game is already completed.");
  }

  const next = structuredClone(state);
  const question = spec.questions[next.round - 1];
  if (!question) {
    throw new GameRuleError("The current question is missing from the GameSpec.");
  }

  if (action.type === "SUBMIT_ANSWER") {
    if (next.phase !== "answer" || question.type !== "trivia") {
      throw new GameRuleError("This round does not accept trivia answers.");
    }
    if (!question.options.some((option) => option.id === action.optionId)) {
      throw new GameRuleError("Unknown answer option.");
    }
    if (next.answers[actorId]) {
      throw new GameRuleError("You already answered this round.");
    }
    next.answers[actorId] = action.optionId;
  } else if (action.type === "CAST_PLAYER_VOTE") {
    if (next.phase !== "answer" || question.type !== "player_vote") {
      throw new GameRuleError("This round does not accept player votes.");
    }
    if (!next.playerOrder.includes(action.targetPlayerId)) {
      throw new GameRuleError("Vote target is not in this room.");
    }
    if (next.votes[actorId]) {
      throw new GameRuleError("You already voted this round.");
    }
    next.votes[actorId] = action.targetPlayerId;
  } else if (action.type === "ADVANCE") {
    if (!isHost) {
      throw new GameRuleError("Only the host can advance the game.");
    }
    if (next.phase !== "reveal") {
      throw new GameRuleError("The current phase cannot be advanced yet.");
    }
    if (next.round >= spec.questions.length) {
      next.status = "completed";
      next.phase = "completed";
      const highScore = Math.max(...Object.values(next.scores));
      next.winnerPlayerIds = next.playerOrder.filter((playerId) => next.scores[playerId] === highScore);
    } else {
      next.round += 1;
      next.phase = "answer";
      next.answers = {};
      next.votes = {};
      next.reveal = null;
    }
    next.revision += 1;
    return next;
  } else {
    throw new GameRuleError("This action is not supported by the quiz/vote engine.");
  }

  const submissionCount = question.type === "trivia" ? Object.keys(next.answers).length : Object.keys(next.votes).length;
  if (submissionCount === next.playerOrder.length) {
    if (question.type === "trivia") {
      for (const [playerId, optionId] of Object.entries(next.answers)) {
        if (optionId === question.correctOptionId) {
          next.scores[playerId] = (next.scores[playerId] ?? 0) + spec.scoring.correctAnswerPoints;
        }
      }
      next.reveal = {
        correctOptionId: question.correctOptionId,
        mostVotedPlayerId: null,
        explanation: question.explanation,
      };
    } else {
      const selectedPlayerId = mostVoted(next.votes, next.playerOrder);
      if (selectedPlayerId) {
        next.scores[selectedPlayerId] = (next.scores[selectedPlayerId] ?? 0) + spec.scoring.popularVotePoints;
      }
      next.reveal = {
        correctOptionId: null,
        mostVotedPlayerId: selectedPlayerId,
        explanation: question.explanation,
      };
    }
    next.phase = "reveal";
  }

  next.revision += 1;
  return next;
}

export function reduceGame(
  state: GameState,
  action: GameAction,
  actorId: string,
  isHost: boolean,
  spec: GameSpec,
): GameState {
  if (state.template !== spec.template) {
    throw new GameRuleError("State and GameSpec templates do not match.");
  }
  return state.template === "hidden_roles" && spec.template === "hidden_roles"
    ? reduceHiddenRoles(state, action, actorId, isHost, spec)
    : state.template === "quiz_vote" && spec.template === "quiz_vote"
      ? reduceQuizVote(state, action, actorId, isHost, spec)
      : (() => {
          throw new GameRuleError("Unsupported engine template.");
        })();
}

function hiddenRolesView(
  state: HiddenRolesState,
  spec: HiddenRolesGameSpec,
  players: PublicPlayer[],
  code: string,
  playerId: string,
): HiddenRolesView {
  const ownRole = state.rolesByPlayer[playerId];
  if (!ownRole) {
    throw new GameRuleError("Missing private role for player projection.");
  }
  const suspected = players.find((player) => player.id === state.lastReveal?.suspectedPlayerId);

  return {
    kind: "hidden_roles",
    code,
    title: spec.title,
    status: state.status,
    revision: state.revision,
    round: state.round,
    totalRounds: spec.rounds,
    phase: state.phase,
    players,
    selfPlayerId: playerId,
    ownRole,
    submitted:
      state.phase === "mission"
        ? Boolean(state.missionChoices[playerId])
        : state.phase === "vote"
          ? Boolean(state.votes[playerId])
          : false,
    scores: state.scores,
    ...(state.lastReveal
      ? {
          lastReveal: {
            sabotages: state.lastReveal.sabotages,
            ...(suspected ? { suspectedPlayerName: suspected.name } : {}),
          },
        }
      : {}),
    ...(state.winner ? { winner: state.winner } : {}),
  };
}

function quizVoteView(
  state: QuizVoteState,
  spec: QuizVoteGameSpec,
  players: PublicPlayer[],
  code: string,
  playerId: string,
): QuizVoteView {
  const question = spec.questions[state.round - 1] ?? spec.questions.at(-1);
  if (!question) {
    throw new GameRuleError("Missing question for player projection.");
  }
  const questionView =
    question.type === "trivia"
      ? { id: question.id, type: question.type, prompt: question.prompt, options: question.options }
      : { id: question.id, type: question.type, prompt: question.prompt };

  return {
    kind: "quiz_vote",
    code,
    title: spec.title,
    status: state.status,
    revision: state.revision,
    round: state.round,
    totalRounds: spec.questions.length,
    phase: state.phase,
    players,
    selfPlayerId: playerId,
    question: questionView,
    submitted: Boolean(state.answers[playerId] || state.votes[playerId]),
    scores: state.scores,
    ...(state.reveal
      ? {
          reveal: {
            ...(state.reveal.correctOptionId ? { correctOptionId: state.reveal.correctOptionId } : {}),
            ...(state.reveal.mostVotedPlayerId ? { mostVotedPlayerId: state.reveal.mostVotedPlayerId } : {}),
            explanation: state.reveal.explanation,
          },
        }
      : {}),
    ...(state.status === "completed" ? { winnerPlayerIds: state.winnerPlayerIds } : {}),
  };
}

export function projectGameState(
  state: GameState,
  spec: GameSpec,
  players: PublicPlayer[],
  code: string,
  playerId: string,
): Exclude<RoomView, { kind: "lobby" }> {
  if (!state.playerOrder.includes(playerId)) {
    throw new GameRuleError("Cannot project state for an unknown player.");
  }
  if (state.template === "hidden_roles" && spec.template === "hidden_roles") {
    return hiddenRolesView(state, spec, players, code, playerId);
  }
  if (state.template === "quiz_vote" && spec.template === "quiz_vote") {
    return quizVoteView(state, spec, players, code, playerId);
  }
  throw new GameRuleError("State and GameSpec templates do not match.");
}
