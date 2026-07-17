import {
  validateComposedGameSpec,
  type ActionDefinition,
  type AtomicCondition,
  type ComposedComponent,
  type ComposedGameSpec,
  type Effect,
  type PhaseDefinition,
} from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";

export type ComposedActionPayload = {
  choiceId?: string | undefined;
  text?: string | undefined;
  cardId?: string | undefined;
  tokenId?: string | undefined;
  spaceId?: string | undefined;
  orderedIds?: string[] | undefined;
  pairs?: Array<{ leftId: string; rightId: string }> | undefined;
  targetPlayerId?: string | undefined;
  stroke?: { id: string; points: Array<{ x: number; y: number }> } | undefined;
  clear?: boolean | undefined;
  elapsedMs?: number | undefined;
};

export type ComposedGameAction = {
  type: "COMPOSED_ACTION";
  actionId: string;
  idempotencyKey: string;
  payload?: ComposedActionPayload | undefined;
};

export type ComposedTeamState = { id: string; name: string; color: string; playerIds: string[] };
export type ComposedDeckState = {
  drawPile: string[];
  discardPile: string[];
  table: string[];
  handsByPlayer: Record<string, string[]>;
};
export type ComposedTokenState = {
  id: string;
  definitionId: string;
  ownerType: "global" | "player" | "team";
  ownerId: string | null;
  spaceId: string;
};
export type ComposedActionRecord = {
  sequence: number;
  phaseId: string;
  phaseVisit: number;
  round: number;
  actionId: string;
  actorId: string;
  payload: ComposedActionPayload;
  correct: boolean | null;
};

export type WordDuelState = {
  secretWordsByPlayer: Record<string, string>;
  guessedLettersByPlayer: Record<string, string[]>;
  incorrectWordsByPlayer: Record<string, string[]>;
  lastGuess: {
    actorId: string;
    kind: "letter" | "word";
    value: string;
    correct: boolean;
    revealedCount: number;
  } | null;
};

export type SecondSenseState = {
  stage: number;
  stageStatus: "open" | "reveal";
  targetMs: number;
  targetHistory: number[];
  activePlayerIds: string[];
  startedPlayerIds: string[];
  attemptsByPlayer: Record<string, number>;
  lastRound: {
    stage: number;
    targetMs: number;
    entries: Array<{ playerId: string; elapsedMs: number; errorMs: number; rank: number }>;
    qualifiedPlayerIds: string[];
    finalTie: boolean;
  } | null;
};

export type ComposedGameState = {
  template: "composed";
  status: "playing" | "completed";
  revision: number;
  seed: string;
  randomCounter: number;
  round: number;
  phaseId: string;
  phaseVisit: number;
  playerOrder: string[];
  activePlayerId: string;
  teams: ComposedTeamState[];
  teamByPlayer: Record<string, string>;
  captainByTeam?: Record<string, string> | undefined;
  scores: { global: number; players: Record<string, number>; teams: Record<string, number> };
  resources: {
    global: Record<string, number>;
    players: Record<string, Record<string, number>>;
    teams: Record<string, Record<string, number>>;
  };
  variables: Record<string, string | number | boolean>;
  decks: Record<string, ComposedDeckState>;
  activeCards: Record<string, Record<string, string>>;
  boardTokens: Record<string, Record<string, ComposedTokenState>>;
  revealedIds: string[];
  randomResults: Record<string, string | number>;
  buzzes: Record<string, string>;
  itemOrders: Record<string, string[]>;
  sketches: Record<string, Array<{ id: string; points: Array<{ x: number; y: number }> }>>;
  wordDuels: Record<string, WordDuelState>;
  secondSenses: Record<string, SecondSenseState>;
  actions: ComposedActionRecord[];
  acceptedIdempotencyKeys: string[];
  winner: { kind: "players" | "teams" | "none"; ids: string[] } | null;
};

export type ResolvedComponentView = {
  id: string;
  kind: ComposedComponent["kind"];
  data: Record<string, unknown>;
};

export type ComposedGameView = {
  kind: "composed";
  code: string;
  title: string;
  description: string;
  theme: ComposedGameSpec["theme"];
  status: "playing" | "completed";
  revision: number;
  round: number;
  totalRounds: number;
  phase: { id: string; title: string };
  players: PublicPlayer[];
  selfPlayerId: string;
  activePlayerId: string;
  teams: ComposedTeamState[];
  captainByTeam: Record<string, string>;
  scores: ComposedGameState["scores"];
  components: ResolvedComponentView[];
  availableActions: Array<{
    id: string;
    label: string;
    kind: ActionDefinition["kind"];
    options?:
      | Array<{ id: string; label: string; description?: string | undefined; icon?: string | undefined }>
      | undefined;
    deckId?: string | undefined;
    boardId?: string | undefined;
    randomizerId?: string | undefined;
    itemIds?: string[] | undefined;
  }>;
  winner: ComposedGameState["winner"];
};

export class ComposedGameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposedGameRuleError";
  }
}

export function canStartComposedGame(spec: ComposedGameSpec, playerCount: number): boolean {
  if (playerCount < spec.minPlayers || playerCount > spec.maxPlayers) return false;
  if (spec.setup.mode !== "teams") return true;
  const policy = spec.setup.teamPolicy;
  const teamCount = policy?.teams.length ?? 0;
  if (!policy || playerCount < teamCount * policy.minMembersPerTeam) return false;
  if (policy.maxMembersPerTeam && playerCount > teamCount * policy.maxMembersPerTeam) return false;
  return policy.allowUnevenTeams || playerCount % teamCount === 0;
}

export type ComposedTeamSelectionValidation = { ok: true } | { ok: false; reason: string };

export function validateComposedTeamSelection(
  spec: ComposedGameSpec,
  playerIds: string[],
  teamByPlayer: Record<string, string>,
): ComposedTeamSelectionValidation {
  if (!canStartComposedGame(spec, playerIds.length)) {
    return { ok: false, reason: `The game cannot start with ${playerIds.length} player(s).` };
  }
  if (spec.setup.mode !== "teams") return { ok: true };
  const policy = spec.setup.teamPolicy;
  if (!policy) return { ok: false, reason: "The team configuration is missing." };
  const knownTeamIds = new Set(policy.teams.map((team) => team.id));
  for (const playerId of playerIds) {
    const teamId = teamByPlayer[playerId];
    if (!teamId) return { ok: false, reason: "Every player must choose a team." };
    if (!knownTeamIds.has(teamId)) return { ok: false, reason: "A selected team does not exist in this game." };
  }
  const sizes = policy.teams.map((team) => playerIds.filter((playerId) => teamByPlayer[playerId] === team.id).length);
  if (sizes.some((size) => size < policy.minMembersPerTeam)) {
    return { ok: false, reason: `Every team needs at least ${policy.minMembersPerTeam} player(s).` };
  }
  if (policy.maxMembersPerTeam && sizes.some((size) => size > policy.maxMembersPerTeam!)) {
    return { ok: false, reason: `A team cannot exceed ${policy.maxMembersPerTeam} player(s).` };
  }
  if (!policy.allowUnevenTeams && Math.max(...sizes) !== Math.min(...sizes)) {
    return { ok: false, reason: "This game requires equally sized teams." };
  }
  return { ok: true };
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const output = [...values];
  let state = hashSeed(seed) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = output[index];
    output[index] = output[swapIndex] as T;
    output[swapIndex] = current as T;
  }
  return output;
}

function nextRandom(state: ComposedGameState, scope: string): number {
  const value = hashSeed(`${state.seed}:${scope}:${state.randomCounter}`) / 4_294_967_296;
  state.randomCounter += 1;
  return value;
}

function secondSenseTarget(
  seed: string,
  component: Extract<ComposedComponent, { kind: "second_sense" }>,
  stage: number,
  previousTarget?: number,
): number {
  const slots = Math.floor((component.maxTargetMs - component.minTargetMs) / component.precisionMs) + 1;
  let slot = hashSeed(`${seed}:second-sense:${component.id}:${stage}`) % slots;
  let target = component.minTargetMs + slot * component.precisionMs;
  if (target === previousTarget && slots > 1) {
    slot = (slot + 1) % slots;
    target = component.minTargetMs + slot * component.precisionMs;
  }
  return target;
}

function createTeams(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  seed: string,
  selectedTeamByPlayer?: Record<string, string>,
): { teams: ComposedTeamState[]; teamByPlayer: Record<string, string> } {
  if (spec.setup.mode !== "teams") return { teams: [], teamByPlayer: {} };
  const policy = spec.setup.teamPolicy;
  if (!policy) throw new ComposedGameRuleError("Team games require a team policy.");
  const count = policy.teams.length;
  if (players.length < count * policy.minMembersPerTeam)
    throw new ComposedGameRuleError("There are not enough players to populate every team.");
  if (policy.maxMembersPerTeam && players.length > count * policy.maxMembersPerTeam)
    throw new ComposedGameRuleError("The room exceeds the configured team capacity.");
  if (!policy.allowUnevenTeams && players.length % count !== 0)
    throw new ComposedGameRuleError("This game requires equally sized teams.");
  const teams = policy.teams.map((team) => ({ ...team, playerIds: [] as string[] }));
  const teamByPlayer: Record<string, string> = {};
  if (selectedTeamByPlayer) {
    const validation = validateComposedTeamSelection(
      spec,
      players.map((player) => player.id),
      selectedTeamByPlayer,
    );
    if (!validation.ok) throw new ComposedGameRuleError(validation.reason);
    for (const player of players) {
      const teamId = selectedTeamByPlayer[player.id]!;
      teams.find((team) => team.id === teamId)!.playerIds.push(player.id);
      teamByPlayer[player.id] = teamId;
    }
    return { teams, teamByPlayer };
  }
  const allocatedPlayers = policy.allocation === "random" ? seededShuffle(players, `${seed}:teams`) : players;
  allocatedPlayers.forEach((player, index) => {
    const team = teams[index % teams.length];
    if (!team) return;
    team.playerIds.push(player.id);
    teamByPlayer[player.id] = team.id;
  });
  return { teams, teamByPlayer };
}

function initializeDecks(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  seed: string,
): Record<string, ComposedDeckState> {
  return Object.fromEntries(
    spec.decks.map((deck) => {
      const drawPile = deck.shuffle
        ? seededShuffle(
            deck.cards.map((card) => card.id),
            `${seed}:deck:${deck.id}`,
          )
        : deck.cards.map((card) => card.id);
      const handsByPlayer = Object.fromEntries(players.map((player) => [player.id, [] as string[]]));
      for (let cardIndex = 0; cardIndex < deck.initialHandSize; cardIndex += 1) {
        for (const player of players) {
          const cardId = drawPile.shift();
          if (cardId) handsByPlayer[player.id]?.push(cardId);
        }
      }
      return [deck.id, { drawPile, discardPile: [], table: [], handsByPlayer }];
    }),
  );
}

function initializeBoardTokens(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  teams: ComposedTeamState[],
): Record<string, Record<string, ComposedTokenState>> {
  return Object.fromEntries(
    spec.boards.map((board) => {
      const tokens: Record<string, ComposedTokenState> = {};
      for (const token of board.tokens) {
        const owners =
          token.owner === "global"
            ? [null]
            : token.owner === "player"
              ? players.map((player) => player.id)
              : teams.map((team) => team.id);
        for (const ownerId of owners) {
          const id = ownerId ? `${token.id}_${ownerId}` : token.id;
          tokens[id] = { id, definitionId: token.id, ownerType: token.owner, ownerId, spaceId: token.startSpaceId };
        }
      }
      return [board.id, tokens];
    }),
  );
}

function initializeResources(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  teams: ComposedTeamState[],
): ComposedGameState["resources"] {
  const global: Record<string, number> = {};
  const playerResources = Object.fromEntries(players.map((player) => [player.id, {} as Record<string, number>]));
  const teamResources = Object.fromEntries(teams.map((team) => [team.id, {} as Record<string, number>]));
  for (const resource of spec.resources) {
    if (resource.scope === "global") global[resource.id] = resource.initialValue;
    if (resource.scope === "player")
      for (const player of players) playerResources[player.id]![resource.id] = resource.initialValue;
    if (resource.scope === "team")
      for (const team of teams) teamResources[team.id]![resource.id] = resource.initialValue;
  }
  return { global, players: playerResources, teams: teamResources };
}

export function initializeComposedGame(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  seed: string,
  selectedTeamByPlayer?: Record<string, string>,
  selectedCaptainByTeam?: Record<string, string>,
): ComposedGameState {
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new ComposedGameRuleError(
      `Invalid ComposedGameSpec: ${validation.issues[0]?.message ?? "unknown validation error"}`,
    );
  if (!canStartComposedGame(spec, players.length))
    throw new ComposedGameRuleError(`This game cannot start with ${players.length} players under its team policy.`);
  const { teams, teamByPlayer } = createTeams(spec, players, seed, selectedTeamByPlayer);
  const randomizedOrder = seededShuffle(
    players.map((player) => player.id),
    `${seed}:starting-player`,
  );
  const initialPlayerId = spec.setup.startingPlayer === "random" ? randomizedOrder[0] : players[0]?.id;
  if (!initialPlayerId) throw new ComposedGameRuleError("At least one player is required.");
  const usesCaptains = spec.actions.some((action) => action.actor === "team_captain");
  const captainByTeam = usesCaptains
    ? Object.fromEntries(
        teams.map((team) => {
          const captainId = selectedCaptainByTeam?.[team.id] ?? team.playerIds[0];
          if (!captainId || !team.playerIds.includes(captainId)) {
            throw new ComposedGameRuleError(`Captain for team ${team.id} must belong to that team.`);
          }
          return [team.id, captainId];
        }),
      )
    : {};
  const initialTeamId = teamByPlayer[initialPlayerId];
  const startingPhase = spec.phases.find((phase) => phase.id === spec.setup.startingPhaseId);
  const startsWithCaptain =
    startingPhase?.actionIds.some(
      (actionId) => spec.actions.find((action) => action.id === actionId)?.actor === "team_captain",
    ) ?? false;
  const activePlayerId = startsWithCaptain && initialTeamId ? captainByTeam[initialTeamId]! : initialPlayerId;
  const itemOrders = Object.fromEntries(
    spec.components.flatMap((component) =>
      component.kind === "ordering" || component.kind === "matching"
        ? [[component.id, seededShuffle(component.itemIds, `${seed}:items:${component.id}`)] as const]
        : [],
    ),
  );
  return {
    template: "composed",
    status: "playing",
    revision: 1,
    seed,
    randomCounter: 0,
    round: 1,
    phaseId: spec.setup.startingPhaseId,
    phaseVisit: 1,
    playerOrder: players.map((player) => player.id),
    activePlayerId,
    teams,
    teamByPlayer,
    ...(usesCaptains ? { captainByTeam } : {}),
    scores: {
      global: 0,
      players: Object.fromEntries(players.map((player) => [player.id, 0])),
      teams: Object.fromEntries(teams.map((team) => [team.id, 0])),
    },
    resources: initializeResources(spec, players, teams),
    variables: Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.initialValue])),
    decks: initializeDecks(spec, players, seed),
    activeCards: Object.fromEntries(players.map((player) => [player.id, {}])),
    boardTokens: initializeBoardTokens(spec, players, teams),
    revealedIds: [],
    randomResults: {},
    buzzes: {},
    itemOrders,
    sketches: {},
    wordDuels: Object.fromEntries(
      spec.components
        .filter((component) => component.kind === "word_duel")
        .map((component) => [
          component.id,
          {
            secretWordsByPlayer: {},
            guessedLettersByPlayer: Object.fromEntries(players.map((player) => [player.id, [] as string[]])),
            incorrectWordsByPlayer: Object.fromEntries(players.map((player) => [player.id, [] as string[]])),
            lastGuess: null,
          } satisfies WordDuelState,
        ]),
    ),
    secondSenses: Object.fromEntries(
      spec.components
        .filter((component) => component.kind === "second_sense")
        .map((component) => {
          const targetMs = secondSenseTarget(seed, component, 1);
          return [
            component.id,
            {
              stage: 1,
              stageStatus: "open",
              targetMs,
              targetHistory: [targetMs],
              activePlayerIds: players.map((player) => player.id),
              startedPlayerIds: [],
              attemptsByPlayer: {},
              lastRound: null,
            } satisfies SecondSenseState,
          ];
        }),
    ),
    actions: [],
    acceptedIdempotencyKeys: [],
    winner: null,
  };
}

function phaseFor(spec: ComposedGameSpec, phaseId: string): PhaseDefinition {
  const phase = spec.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new ComposedGameRuleError(`Unknown phase: ${phaseId}.`);
  return phase;
}

function actionFor(spec: ComposedGameSpec, actionId: string): ActionDefinition {
  const action = spec.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new ComposedGameRuleError(`Unknown action: ${actionId}.`);
  return action;
}

function isActorAllowed(state: ComposedGameState, action: ActionDefinition, actorId: string, isHost: boolean): boolean {
  if (action.actor === "host") return isHost;
  if (action.actor === "active_player") return actorId === state.activePlayerId;
  if (action.actor === "team_captain") {
    const activeTeamId = state.teamByPlayer[state.activePlayerId];
    return Boolean(activeTeamId && state.captainByTeam?.[activeTeamId] === actorId);
  }
  if (action.actor === "opponents") {
    const actorTeamId = state.teamByPlayer[actorId];
    const activeTeamId = state.teamByPlayer[state.activePlayerId];
    return Boolean(actorTeamId && activeTeamId && actorTeamId !== activeTeamId);
  }
  if (action.actor === "guessers") return actorId !== state.activePlayerId && Boolean(state.teamByPlayer[actorId]);
  if (action.actor === "team")
    return (
      Boolean(state.teamByPlayer[actorId]) && state.teamByPlayer[actorId] === state.teamByPlayer[state.activePlayerId]
    );
  return state.playerOrder.includes(actorId);
}

function normalizeDuelWord(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function wordDuelComponent(
  spec: ComposedGameSpec,
  wordDuelId: string | undefined,
): Extract<ComposedComponent, { kind: "word_duel" }> {
  const component = spec.components.find(
    (candidate): candidate is Extract<ComposedComponent, { kind: "word_duel" }> =>
      candidate.kind === "word_duel" && candidate.id === wordDuelId,
  );
  if (!component) throw new ComposedGameRuleError("This word duel is not configured.");
  return component;
}

function secondSenseComponent(
  spec: ComposedGameSpec,
  secondSenseId: string | undefined,
): Extract<ComposedComponent, { kind: "second_sense" }> {
  const component = spec.components.find(
    (candidate): candidate is Extract<ComposedComponent, { kind: "second_sense" }> =>
      candidate.kind === "second_sense" && candidate.id === secondSenseId,
  );
  if (!component) throw new ComposedGameRuleError("This Second Sense board is not configured.");
  return component;
}

function opponentId(state: ComposedGameState, actorId: string): string {
  const opponent = state.playerOrder.find((playerId) => playerId !== actorId);
  if (!opponent || state.playerOrder.length !== 2)
    throw new ComposedGameRuleError("WordDuel requires exactly two players.");
  return opponent;
}

function validatePayload(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  action: ActionDefinition,
  actorId: string,
  payload: ComposedActionPayload,
): boolean | null {
  if (action.kind === "timing_start" || action.kind === "timing_stop" || action.kind === "timing_advance") {
    const component = secondSenseComponent(spec, action.secondSenseId);
    const sense = state.secondSenses[component.id];
    if (!sense) throw new ComposedGameRuleError("This timing round is not ready.");
    if (action.kind === "timing_advance") {
      if (sense.stageStatus !== "reveal")
        throw new ComposedGameRuleError("The current timing round is not ready to advance.");
      return null;
    }
    if (sense.stageStatus !== "open") throw new ComposedGameRuleError("Wait for the next target.");
    if (!sense.activePlayerIds.includes(actorId)) throw new ComposedGameRuleError("This player has been eliminated.");
    const started = sense.startedPlayerIds.includes(actorId);
    const stopped = sense.attemptsByPlayer[actorId] !== undefined;
    if (action.kind === "timing_start") {
      if (started || stopped) throw new ComposedGameRuleError("Your clock has already started.");
      return null;
    }
    if (!started) throw new ComposedGameRuleError("Touch once to start your clock before stopping it.");
    if (stopped) throw new ComposedGameRuleError("Your time is already locked.");
    if (!Number.isInteger(payload.elapsedMs) || payload.elapsedMs! < 100 || payload.elapsedMs! > 30_000) {
      throw new ComposedGameRuleError("Submit one measured duration between 0.10 and 30.00 seconds.");
    }
    return null;
  }
  if (action.kind === "secret_word") {
    const component = wordDuelComponent(spec, action.wordDuelId);
    const word = normalizeDuelWord(payload.text ?? "");
    if (!/^[A-Z]+$/.test(word) || word.length < component.minLength || word.length > component.maxLength) {
      throw new ComposedGameRuleError(
        `Choose one English word containing ${component.minLength} to ${component.maxLength} letters.`,
      );
    }
    const duel = state.wordDuels[component.id];
    if (!duel) throw new ComposedGameRuleError("This word duel is not ready.");
    if (duel.secretWordsByPlayer[actorId]) throw new ComposedGameRuleError("Your secret word is already locked.");
    return null;
  }
  if (action.kind === "letter_guess") {
    const component = wordDuelComponent(spec, action.wordDuelId);
    const letter = normalizeDuelWord(payload.text ?? "");
    if (!/^[A-Z]$/.test(letter)) throw new ComposedGameRuleError("Choose exactly one letter.");
    const duel = state.wordDuels[component.id];
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord) throw new ComposedGameRuleError("Both secret words must be locked before guessing.");
    if (duel.guessedLettersByPlayer[actorId]?.includes(letter))
      throw new ComposedGameRuleError("That letter has already been played.");
    return secretWord.includes(letter);
  }
  if (action.kind === "word_guess") {
    const component = wordDuelComponent(spec, action.wordDuelId);
    const guess = normalizeDuelWord(payload.text ?? "");
    if (!/^[A-Z]+$/.test(guess) || guess.length < component.minLength || guess.length > component.maxLength)
      throw new ComposedGameRuleError("Enter one complete word within the allowed length.");
    const duel = state.wordDuels[component.id];
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord) throw new ComposedGameRuleError("Both secret words must be locked before guessing.");
    if (duel.incorrectWordsByPlayer[actorId]?.includes(guess))
      throw new ComposedGameRuleError("That word has already been attempted.");
    return guess === secretWord;
  }
  if (action.kind === "choose") {
    if (!payload.choiceId || !action.optionIds?.includes(payload.choiceId))
      throw new ComposedGameRuleError("Choose actions require a known choiceId.");
    return spec.choices.find((choice) => choice.id === payload.choiceId)?.correct ?? null;
  }
  if (action.kind === "text") {
    if (!payload.text?.trim() || payload.text.length > 600)
      throw new ComposedGameRuleError("Text actions require a non-empty response of at most 600 characters.");
    const normalize = (value: string) =>
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    if (action.requiredWordDeckId) {
      const cardId = state.activeCards[state.activePlayerId]?.[action.requiredWordDeckId];
      const requiredWord = cardDefinition(spec, action.requiredWordDeckId, cardId)?.title;
      if (!requiredWord)
        throw new ComposedGameRuleError("No secret writing constraint is available for this text action.");
      const normalizedText = ` ${normalize(payload.text)} `;
      const normalizedWord = normalize(requiredWord);
      if (!normalizedWord || !normalizedText.includes(` ${normalizedWord} `)) {
        throw new ComposedGameRuleError(`Your contribution must include the word “${requiredWord}”.`);
      }
      return true;
    }
    if (!action.answerDeckId) return null;
    const cardId = state.activeCards[state.activePlayerId]?.[action.answerDeckId];
    const answer = cardDefinition(spec, action.answerDeckId, cardId)?.title;
    if (!answer) throw new ComposedGameRuleError("No secret answer is available for this text action.");
    return normalize(payload.text) === normalize(answer);
  }
  if (action.kind === "play_card") {
    if (
      !action.deckId ||
      !payload.cardId ||
      !state.decks[action.deckId]?.handsByPlayer[actorId]?.includes(payload.cardId)
    )
      throw new ComposedGameRuleError("The selected card is not in the actor's hand.");
    return null;
  }
  if (action.kind === "move") {
    if (!action.boardId || !payload.tokenId || !payload.spaceId)
      throw new ComposedGameRuleError("Move actions require tokenId and spaceId.");
    const token = state.boardTokens[action.boardId]?.[payload.tokenId];
    const board = spec.boards.find((candidate) => candidate.id === action.boardId);
    if (!token || !board?.spaces.some((space) => space.id === payload.spaceId))
      throw new ComposedGameRuleError("Unknown token or destination space.");
    const actorTeam = state.teamByPlayer[actorId];
    if (token.ownerType === "player" && token.ownerId !== actorId)
      throw new ComposedGameRuleError("A player can only move their own token.");
    if (token.ownerType === "team" && token.ownerId !== actorTeam)
      throw new ComposedGameRuleError("A player can only move their team's token.");
    return null;
  }
  if (action.kind === "order") {
    if (
      !payload.orderedIds ||
      !action.itemIds ||
      payload.orderedIds.length !== action.itemIds.length ||
      new Set(payload.orderedIds).size !== action.itemIds.length ||
      payload.orderedIds.some((id) => !action.itemIds?.includes(id))
    )
      throw new ComposedGameRuleError("Ordering actions must submit every configured item exactly once.");
    const correctOrder = [...action.itemIds].sort(
      (left, right) =>
        (spec.orderingItems.find((item) => item.id === left)?.rank ?? 0) -
        (spec.orderingItems.find((item) => item.id === right)?.rank ?? 0),
    );
    return payload.orderedIds.every((id, index) => id === correctOrder[index]);
  }
  if (action.kind === "match") {
    if (!payload.pairs || !action.itemIds) throw new ComposedGameRuleError("Matching actions require pairs.");
    const submittedIds = payload.pairs.flatMap((pair) => [pair.leftId, pair.rightId]);
    if (
      submittedIds.length !== action.itemIds.length ||
      new Set(submittedIds).size !== action.itemIds.length ||
      submittedIds.some((id) => !action.itemIds?.includes(id))
    )
      throw new ComposedGameRuleError("Matching actions must use every configured item exactly once.");
    return payload.pairs.every((pair) => {
      const left = spec.matchingItems.find((item) => item.id === pair.leftId);
      const right = spec.matchingItems.find((item) => item.id === pair.rightId);
      return Boolean(left && right && left.pairId === right.pairId);
    });
  }
  if (action.kind === "select_player") {
    const actorTeamId = state.teamByPlayer[actorId];
    if (!payload.targetPlayerId || !actorTeamId || state.teamByPlayer[payload.targetPlayerId] !== actorTeamId) {
      throw new ComposedGameRuleError("Captains must select an active player from their own team.");
    }
    return null;
  }
  if (action.kind === "buzz" && state.buzzes[state.phaseId])
    throw new ComposedGameRuleError("The buzzer has already been claimed in this phase.");
  if (action.kind === "sketch") {
    if (payload.clear === true && !payload.stroke) return null;
    const stroke = payload.stroke;
    if (!stroke || !/^[A-Za-z0-9_-]{1,80}$/.test(stroke.id) || stroke.points.length < 2 || stroke.points.length > 160) {
      throw new ComposedGameRuleError("Sketch actions require one bounded stroke or a clear command.");
    }
    if (
      stroke.points.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.x > 600 ||
          point.y < 0 ||
          point.y > 340,
      )
    ) {
      throw new ComposedGameRuleError("Sketch points must stay inside the drawing canvas.");
    }
    return null;
  }
  return action.kind === "complete_challenge" ? true : null;
}

function clampResource(spec: ComposedGameSpec, resourceId: string, value: number): number {
  const definition = spec.resources.find((resource) => resource.id === resourceId);
  if (!definition) throw new ComposedGameRuleError(`Unknown resource: ${resourceId}.`);
  return Math.min(definition.max, Math.max(definition.min, value));
}

function targetOwner(
  state: ComposedGameState,
  target: "global" | "actor" | "active_player" | "actor_team",
  actorId: string,
): { kind: "global" | "player" | "team"; id?: string } {
  if (target === "global") return { kind: "global" };
  if (target === "actor") return { kind: "player", id: actorId };
  if (target === "active_player") return { kind: "player", id: state.activePlayerId };
  const teamId = state.teamByPlayer[actorId];
  if (!teamId) throw new ComposedGameRuleError("This effect requires the actor to belong to a team.");
  return { kind: "team", id: teamId };
}

function reshuffleDiscard(state: ComposedGameState, deckId: string) {
  const deck = state.decks[deckId];
  if (!deck || deck.drawPile.length || !deck.discardPile.length) return;
  deck.drawPile = seededShuffle(deck.discardPile, `${state.seed}:reshuffle:${deckId}:${state.randomCounter}`);
  deck.discardPile = [];
  state.randomCounter += 1;
}

function drawCards(state: ComposedGameState, deckId: string, playerId: string, count: number) {
  const deck = state.decks[deckId];
  if (!deck) throw new ComposedGameRuleError(`Unknown deck: ${deckId}.`);
  for (let index = 0; index < count; index += 1) {
    reshuffleDiscard(state, deckId);
    const cardId = deck.drawPile.shift();
    if (!cardId) break;
    deck.handsByPlayer[playerId]?.push(cardId);
    state.activeCards[playerId]![deckId] = cardId;
  }
}

function advancePhase(state: ComposedGameState, spec: ComposedGameSpec) {
  const current = phaseFor(spec, state.phaseId);
  if (!current.nextPhaseId) throw new ComposedGameRuleError(`Phase ${current.id} has no nextPhaseId.`);
  state.phaseId = current.nextPhaseId;
  state.phaseVisit += 1;
  delete state.buzzes[current.id];
}

function determineWinner(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  winnerBy: "highest_score" | "actor" | "actor_team" | "none",
  actorId: string,
) {
  if (winnerBy === "none") return { kind: "none" as const, ids: [] };
  if (winnerBy === "actor") return { kind: "players" as const, ids: [actorId] };
  if (winnerBy === "actor_team") {
    const teamId = state.teamByPlayer[actorId];
    return teamId ? { kind: "teams" as const, ids: [teamId] } : { kind: "players" as const, ids: [actorId] };
  }
  const scoreMap = spec.setup.mode === "teams" ? state.scores.teams : state.scores.players;
  const highScore = Math.max(...Object.values(scoreMap), 0);
  return {
    kind: spec.setup.mode === "teams" ? ("teams" as const) : ("players" as const),
    ids: Object.keys(scoreMap).filter((id) => scoreMap[id] === highScore),
  };
}

function applyEffect(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  effect: Effect,
  actorId: string,
  payload: ComposedActionPayload,
) {
  if (effect.kind === "add_score") {
    const owner = targetOwner(state, effect.target, actorId);
    if (owner.kind === "global") state.scores.global += effect.amount;
    if (owner.kind === "player" && owner.id)
      state.scores.players[owner.id] = (state.scores.players[owner.id] ?? 0) + effect.amount;
    if (owner.kind === "team" && owner.id)
      state.scores.teams[owner.id] = (state.scores.teams[owner.id] ?? 0) + effect.amount;
  } else if (effect.kind === "add_resource") {
    const owner = targetOwner(state, effect.target, actorId);
    if (owner.kind === "global")
      state.resources.global[effect.resourceId] = clampResource(
        spec,
        effect.resourceId,
        (state.resources.global[effect.resourceId] ?? 0) + effect.amount,
      );
    if (owner.kind === "player" && owner.id)
      state.resources.players[owner.id]![effect.resourceId] = clampResource(
        spec,
        effect.resourceId,
        (state.resources.players[owner.id]?.[effect.resourceId] ?? 0) + effect.amount,
      );
    if (owner.kind === "team" && owner.id)
      state.resources.teams[owner.id]![effect.resourceId] = clampResource(
        spec,
        effect.resourceId,
        (state.resources.teams[owner.id]?.[effect.resourceId] ?? 0) + effect.amount,
      );
  } else if (effect.kind === "set_variable") state.variables[effect.variableId] = effect.value;
  else if (effect.kind === "record_input")
    state.variables[effect.channelId] = payload.text ?? payload.choiceId ?? payload.cardId ?? "submitted";
  else if (effect.kind === "register_secret_word") {
    const duel = state.wordDuels[effect.wordDuelId];
    const word = normalizeDuelWord(payload.text ?? "");
    if (!duel || !word) throw new ComposedGameRuleError("No secret word is available to lock.");
    duel.secretWordsByPlayer[actorId] = word;
  } else if (effect.kind === "guess_letter") {
    const duel = state.wordDuels[effect.wordDuelId];
    const letter = normalizeDuelWord(payload.text ?? "");
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord || !letter) throw new ComposedGameRuleError("No letter guess is available to resolve.");
    duel.guessedLettersByPlayer[actorId] = [...(duel.guessedLettersByPlayer[actorId] ?? []), letter];
    const revealedCount = [...secretWord].filter((candidate) => candidate === letter).length;
    const correct = revealedCount > 0;
    duel.lastGuess = { actorId, kind: "letter", value: letter, correct, revealedCount };
    const guessed = new Set(duel.guessedLettersByPlayer[actorId]);
    if ([...secretWord].every((candidate) => guessed.has(candidate))) {
      state.status = "completed";
      state.winner = { kind: "players", ids: [actorId] };
    }
  } else if (effect.kind === "guess_word") {
    const duel = state.wordDuels[effect.wordDuelId];
    const guess = normalizeDuelWord(payload.text ?? "");
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord || !guess) throw new ComposedGameRuleError("No word guess is available to resolve.");
    const correct = guess === secretWord;
    duel.lastGuess = { actorId, kind: "word", value: guess, correct, revealedCount: correct ? secretWord.length : 0 };
    if (correct) {
      state.status = "completed";
      state.winner = { kind: "players", ids: [actorId] };
    } else {
      const attempts = duel.incorrectWordsByPlayer[actorId] ?? [];
      duel.incorrectWordsByPlayer[actorId] = [...attempts.slice(-7), guess];
    }
  } else if (effect.kind === "start_timing") {
    const sense = state.secondSenses[effect.secondSenseId];
    if (!sense) throw new ComposedGameRuleError("No timing round is available to start.");
    sense.startedPlayerIds = [...sense.startedPlayerIds, actorId];
  } else if (effect.kind === "stop_timing") {
    const sense = state.secondSenses[effect.secondSenseId];
    const elapsedMs = payload.elapsedMs;
    if (!sense || !Number.isInteger(elapsedMs))
      throw new ComposedGameRuleError("No measured duration is available to stop.");
    sense.attemptsByPlayer[actorId] = elapsedMs!;
    if (sense.activePlayerIds.every((playerId) => sense.attemptsByPlayer[playerId] !== undefined)) {
      const sorted = sense.activePlayerIds
        .map((playerId) => ({
          playerId,
          elapsedMs: sense.attemptsByPlayer[playerId]!,
          errorMs: Math.abs(sense.attemptsByPlayer[playerId]! - sense.targetMs),
        }))
        .sort(
          (left, right) =>
            left.errorMs - right.errorMs ||
            left.elapsedMs - right.elapsedMs ||
            left.playerId.localeCompare(right.playerId),
        );
      const entries = sorted.map((entry) => ({
        ...entry,
        rank: sorted.findIndex((candidate) => candidate.errorMs === entry.errorMs) + 1,
      }));
      const desiredCount = Math.max(1, Math.ceil(sorted.length / 2));
      const cutoffErrorMs = sorted[desiredCount - 1]?.errorMs ?? sorted[0]?.errorMs ?? 0;
      const qualifiedPlayerIds = sorted
        .filter((entry) => entry.errorMs <= cutoffErrorMs)
        .map((entry) => entry.playerId);
      const finalTie = sorted.length === 2 && sorted[0]?.errorMs === sorted[1]?.errorMs;
      sense.stageStatus = "reveal";
      sense.lastRound = { stage: sense.stage, targetMs: sense.targetMs, entries, qualifiedPlayerIds, finalTie };
      if (qualifiedPlayerIds.length === 1) {
        state.status = "completed";
        state.winner = { kind: "players", ids: [qualifiedPlayerIds[0]!] };
      }
    }
  } else if (effect.kind === "advance_timing_round") {
    const sense = state.secondSenses[effect.secondSenseId];
    const qualifiedPlayerIds = sense?.lastRound?.qualifiedPlayerIds;
    if (!sense || !qualifiedPlayerIds?.length || sense.stageStatus !== "reveal")
      throw new ComposedGameRuleError("No completed timing round is ready to advance.");
    sense.stage += 1;
    sense.stageStatus = "open";
    sense.activePlayerIds = [...qualifiedPlayerIds];
    sense.startedPlayerIds = [];
    sense.attemptsByPlayer = {};
    sense.targetMs = secondSenseTarget(
      state.seed,
      secondSenseComponent(spec, effect.secondSenseId),
      sense.stage,
      sense.targetMs,
    );
    sense.targetHistory.push(sense.targetMs);
    state.round = sense.stage;
    state.activePlayerId = qualifiedPlayerIds[0] ?? state.activePlayerId;
  } else if (effect.kind === "draw_cards")
    drawCards(state, effect.deckId, effect.target === "actor" ? actorId : state.activePlayerId, effect.count);
  else if (effect.kind === "discard_selected_card") {
    const deck = state.decks[effect.deckId];
    const ownerId = effect.target === "active_player" ? state.activePlayerId : actorId;
    const cardId = payload.cardId ?? state.activeCards[ownerId]?.[effect.deckId];
    if (!deck || !cardId || !deck.handsByPlayer[ownerId]?.includes(cardId))
      throw new ComposedGameRuleError("No selected card is available to discard.");
    deck.handsByPlayer[ownerId] = deck.handsByPlayer[ownerId]!.filter((id) => id !== cardId);
    deck.discardPile.push(cardId);
    delete state.activeCards[ownerId]?.[effect.deckId];
  } else if (effect.kind === "move_selected_token") {
    const token = payload.tokenId ? state.boardTokens[effect.boardId]?.[payload.tokenId] : undefined;
    if (!token || !payload.spaceId) throw new ComposedGameRuleError("No token and destination were selected.");
    token.spaceId = payload.spaceId;
  } else if (effect.kind === "reveal") {
    if (!state.revealedIds.includes(effect.revealId)) state.revealedIds.push(effect.revealId);
  } else if (effect.kind === "randomize") {
    const randomizer = spec.randomizers.find((candidate) => candidate.id === effect.randomizerId);
    if (!randomizer) throw new ComposedGameRuleError(`Unknown randomizer: ${effect.randomizerId}.`);
    const random = nextRandom(state, randomizer.id);
    state.randomResults[randomizer.id] =
      randomizer.kind === "die"
        ? Math.floor(random * randomizer.sides) + 1
        : (randomizer.options[Math.floor(random * randomizer.options.length)]?.id ?? randomizer.options[0]!.id);
  } else if (effect.kind === "shuffle_deck") {
    const deck = state.decks[effect.deckId];
    if (!deck) throw new ComposedGameRuleError(`Unknown deck: ${effect.deckId}.`);
    deck.drawPile = seededShuffle(deck.drawPile, `${state.seed}:shuffle:${effect.deckId}:${state.randomCounter}`);
    state.randomCounter += 1;
  } else if (effect.kind === "set_active_player") {
    if (effect.mode === "actor") state.activePlayerId = actorId;
    else if (effect.mode === "selected") {
      if (!payload.targetPlayerId || !state.playerOrder.includes(payload.targetPlayerId)) {
        throw new ComposedGameRuleError("No valid active player was selected.");
      }
      state.activePlayerId = payload.targetPlayerId;
    } else if (effect.mode === "next_team_captain") {
      const currentTeamId = state.teamByPlayer[state.activePlayerId];
      const teamIndex = state.teams.findIndex((team) => team.id === currentTeamId);
      const nextTeam = state.teams[(teamIndex + 1) % state.teams.length];
      const nextCaptain = nextTeam ? state.captainByTeam?.[nextTeam.id] : undefined;
      if (!nextCaptain) throw new ComposedGameRuleError("The next team has no captain.");
      state.activePlayerId = nextCaptain;
    } else {
      const index = state.playerOrder.indexOf(state.activePlayerId);
      state.activePlayerId = state.playerOrder[(index + 1) % state.playerOrder.length] ?? state.activePlayerId;
    }
  } else if (effect.kind === "advance_phase") {
    const sketchKey = `${state.phaseId}:${state.phaseVisit}`;
    advancePhase(state, spec);
    if (state.sketches?.[sketchKey]) delete state.sketches[sketchKey];
  } else if (effect.kind === "advance_round") state.round += 1;
  else if (effect.kind === "end_game") {
    state.status = "completed";
    state.winner = determineWinner(state, spec, effect.winnerBy, actorId);
  }
}

function actionsMatching(state: ComposedGameState, condition: Extract<AtomicCondition, { kind: "action_count" }>) {
  return state.actions.filter(
    (record) =>
      record.actionId === condition.actionId &&
      (condition.scope === "game" ||
        (condition.scope === "round" ? record.round === state.round : record.phaseVisit === state.phaseVisit)),
  );
}

function conditionMatches(state: ComposedGameState, condition: AtomicCondition): boolean {
  if (condition.kind === "always") return true;
  if (condition.kind === "action_count") return actionsMatching(state, condition).length >= condition.count;
  if (condition.kind === "all_players_acted") {
    const actors = new Set(
      state.actions
        .filter((record) => record.actionId === condition.actionId && record.phaseVisit === state.phaseVisit)
        .map((record) => record.actorId),
    );
    return state.playerOrder.every((playerId) => actors.has(playerId));
  }
  if (condition.kind === "score_at_least") {
    if (condition.owner === "global") return state.scores.global >= condition.amount;
    const values =
      condition.owner === "any_team" ? Object.values(state.scores.teams) : Object.values(state.scores.players);
    return values.some((value) => value >= condition.amount);
  }
  if (condition.kind === "resource_at_least") {
    if (condition.owner === "global")
      return (state.resources.global[condition.resourceId] ?? Number.NEGATIVE_INFINITY) >= condition.amount;
    return [...Object.values(state.resources.players), ...Object.values(state.resources.teams)].some(
      (values) => (values[condition.resourceId] ?? Number.NEGATIVE_INFINITY) >= condition.amount,
    );
  }
  if (condition.kind === "deck_empty") return (state.decks[condition.deckId]?.drawPile.length ?? 0) === 0;
  if (condition.kind === "round_at_least") return state.round >= condition.round;
  if (condition.kind === "variable_equals") return state.variables[condition.variableId] === condition.value;
  if (condition.kind === "last_input_correct")
    return [...state.actions].reverse().find((record) => record.actionId === condition.actionId)?.correct === true;
  return false;
}

function conditionsMatch(state: ComposedGameState, conditions: AtomicCondition[], mode: "all" | "any"): boolean {
  if (!conditions.length) return mode === "all";
  return mode === "all"
    ? conditions.every((condition) => conditionMatches(state, condition))
    : conditions.some((condition) => conditionMatches(state, condition));
}

export function reduceComposedGame(
  state: ComposedGameState,
  actionInput: ComposedGameAction,
  actorId: string,
  isHost: boolean,
  spec: ComposedGameSpec,
): ComposedGameState {
  if (state.status === "completed") throw new ComposedGameRuleError("This game is already completed.");
  if (!state.playerOrder.includes(actorId)) throw new ComposedGameRuleError("Unknown player for this room.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(actionInput.idempotencyKey))
    throw new ComposedGameRuleError("Invalid idempotency key.");
  if (state.acceptedIdempotencyKeys.includes(actionInput.idempotencyKey))
    throw new ComposedGameRuleError("This action was already processed.");
  const phase = phaseFor(spec, state.phaseId);
  if (!phase.actionIds.includes(actionInput.actionId))
    throw new ComposedGameRuleError("This action is not available in the current phase.");
  const action = actionFor(spec, actionInput.actionId);
  if (!isActorAllowed(state, action, actorId, isHost))
    throw new ComposedGameRuleError("This player cannot perform the selected action.");
  if (
    action.oncePerPhase &&
    state.actions.some(
      (record) => record.actionId === action.id && record.actorId === actorId && record.phaseVisit === state.phaseVisit,
    )
  )
    throw new ComposedGameRuleError("This action can only be used once per phase.");

  const next = structuredClone(state);
  const payload = actionInput.payload ?? {};
  const correct = validatePayload(next, spec, action, actorId, payload);
  if (action.kind === "sketch") {
    next.sketches ??= {};
    const key = `${next.phaseId}:${next.phaseVisit}`;
    const current = next.sketches[key] ?? [];
    if (payload.clear) next.sketches[key] = [];
    else if (payload.stroke) {
      if (current.length >= 120) throw new ComposedGameRuleError("This canvas has reached its stroke limit.");
      if (current.some((stroke) => stroke.id === payload.stroke?.id))
        throw new ComposedGameRuleError("This stroke was already submitted.");
      next.sketches[key] = [...current, payload.stroke];
    }
  }
  if (action.kind === "buzz") next.buzzes[next.phaseId] = actorId;
  next.actions.push({
    sequence: next.actions.length + 1,
    phaseId: next.phaseId,
    phaseVisit: next.phaseVisit,
    round: next.round,
    actionId: action.id,
    actorId,
    payload: action.kind === "sketch" || action.kind === "secret_word" ? {} : payload,
    correct,
  });
  next.acceptedIdempotencyKeys.push(actionInput.idempotencyKey);
  if (next.acceptedIdempotencyKeys.length > 500) next.acceptedIdempotencyKeys.shift();

  const phaseAtStart = next.phaseId;
  action.effects.forEach((effect) => {
    applyEffect(next, spec, effect, actorId, payload);
  });
  for (const rule of spec.rules.filter((candidate) => candidate.trigger.actionId === action.id)) {
    if (conditionsMatch(next, rule.conditions, rule.conditionMode)) {
      rule.effects.forEach((effect) => {
        applyEffect(next, spec, effect, actorId, payload);
      });
    }
  }
  if (
    next.status === "playing" &&
    next.phaseId === phaseAtStart &&
    phase.completionMode !== "manual" &&
    conditionsMatch(next, phase.completionConditions, phase.completionMode)
  ) {
    phase.onComplete.forEach((effect) => {
      applyEffect(next, spec, effect, actorId, payload);
    });
    if (next.status === "playing" && next.phaseId === phaseAtStart) advancePhase(next, spec);
  }
  next.revision += 1;
  return next;
}

function componentVisible(component: ComposedComponent, state: ComposedGameState, viewer: PublicPlayer): boolean {
  if (component.audience === "public") return true;
  if (component.audience === "host") return viewer.isHost;
  if (component.audience === "active_player") return viewer.id === state.activePlayerId;
  return (
    Boolean(state.teamByPlayer[viewer.id]) && state.teamByPlayer[viewer.id] === state.teamByPlayer[state.activePlayerId]
  );
}

function cardDefinition(spec: ComposedGameSpec, deckId: string, cardId: string | undefined) {
  return cardId ? spec.decks.find((deck) => deck.id === deckId)?.cards.find((card) => card.id === cardId) : undefined;
}

function resolveText(
  source: Extract<ComposedComponent, { kind: "header" }>["title"],
  state: ComposedGameState,
  spec: ComposedGameSpec,
): string {
  if (source.kind === "literal") return source.value;
  if (source.kind === "variable") return String(state.variables[source.variableId] ?? "");
  if (source.kind === "active_card") {
    const cardId = state.activeCards[state.activePlayerId]?.[source.deckId];
    const card = cardDefinition(spec, source.deckId, cardId);
    return source.field === "title" ? (card?.title ?? "") : (card?.body ?? "");
  }
  const record = [...state.actions].reverse().find((action) => action.actionId === source.actionId);
  return record?.payload.text ?? record?.payload.choiceId ?? record?.payload.cardId ?? "";
}

function componentView(
  component: ComposedComponent,
  state: ComposedGameState,
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  viewerId: string,
): ResolvedComponentView {
  const base = { id: component.id, kind: component.kind };
  if (component.kind === "header")
    return {
      ...base,
      data: {
        eyebrow: component.eyebrow,
        title: resolveText(component.title, state, spec),
        description: component.description ? resolveText(component.description, state, spec) : undefined,
        icon: component.icon,
      },
    };
  if (component.kind === "prompt")
    return {
      ...base,
      data: {
        category: component.category,
        prompt: resolveText(component.prompt, state, spec),
        hint: component.hint ? resolveText(component.hint, state, spec) : undefined,
        icon: component.icon,
      },
    };
  if (component.kind === "deck") {
    const deck = state.decks[component.deckId];
    const activeCardId = state.activeCards[viewerId]?.[component.deckId];
    return {
      ...base,
      data: {
        deckId: component.deckId,
        label: component.label,
        remaining: deck?.drawPile.length ?? 0,
        activeCard: cardDefinition(spec, component.deckId, activeCardId),
      },
    };
  }
  if (component.kind === "choices")
    return {
      ...base,
      data: {
        title: component.title,
        columns: component.columns,
        choices: spec.choices
          .filter((choice) => component.optionIds.includes(choice.id))
          .map(({ correct: _correct, ...choice }) => choice),
      },
    };
  if (component.kind === "text_input")
    return {
      ...base,
      data: {
        label: component.label,
        placeholder: component.placeholder,
        multiline: component.multiline,
        maxLength: component.maxLength,
      },
    };
  if (component.kind === "drawing")
    return {
      ...base,
      data: { label: component.label, strokes: state.sketches?.[`${state.phaseId}:${state.phaseVisit}`] ?? [] },
    };
  if (component.kind === "timer") return { ...base, data: { seconds: component.seconds, label: component.label } };
  if (component.kind === "turn")
    return {
      ...base,
      data: {
        activePlayerId: state.activePlayerId,
        activePlayerName: players.find((player) => player.id === state.activePlayerId)?.name ?? "",
      },
    };
  if (component.kind === "round")
    return {
      ...base,
      data: { current: Math.min(state.round, spec.setup.rounds), total: spec.setup.rounds, label: component.label },
    };
  if (component.kind === "teams") return { ...base, data: { teams: state.teams } };
  if (component.kind === "players") return { ...base, data: { players } };
  if (component.kind === "scores") return { ...base, data: { title: component.title, scores: state.scores } };
  if (component.kind === "clues")
    return {
      ...base,
      data: {
        title: component.title,
        clues: component.clueIds.map((id) => ({
          id,
          text: state.revealedIds.includes(id) ? spec.clues.find((clue) => clue.id === id)?.text : undefined,
        })),
      },
    };
  if (component.kind === "challenge")
    return {
      ...base,
      data: {
        title: resolveText(component.title, state, spec),
        instruction: resolveText(component.instruction, state, spec),
        difficulty: component.difficulty,
        rewardLabel: component.rewardLabel,
        icon: component.icon,
      },
    };
  if (component.kind === "reveal")
    return {
      ...base,
      data: {
        revealed: state.revealedIds.includes(component.revealId),
        content: state.revealedIds.includes(component.revealId)
          ? spec.reveals.find((reveal) => reveal.id === component.revealId)
          : undefined,
      },
    };
  if (component.kind === "outcome")
    return {
      ...base,
      data: {
        visible: state.status === "completed",
        title: resolveText(component.title, state, spec),
        description: component.description ? resolveText(component.description, state, spec) : undefined,
        winner: state.winner,
      },
    };
  if (component.kind === "board")
    return {
      ...base,
      data: {
        definition: spec.boards.find((board) => board.id === component.boardId),
        tokens: state.boardTokens[component.boardId] ?? {},
      },
    };
  if (component.kind === "card_zone") {
    const deck = state.decks[component.deckId];
    const cardIds =
      component.zone === "hand"
        ? (deck?.handsByPlayer[viewerId] ?? [])
        : component.zone === "draw"
          ? (deck?.drawPile.map(() => "hidden") ?? [])
          : component.zone === "discard"
            ? (deck?.discardPile ?? [])
            : (deck?.table ?? []);
    return {
      ...base,
      data: {
        deckId: component.deckId,
        zone: component.zone,
        cards: component.zone === "draw" ? cardIds : cardIds.map((id) => cardDefinition(spec, component.deckId, id)),
      },
    };
  }
  if (component.kind === "resources")
    return {
      ...base,
      data: {
        definitions: spec.resources.filter((resource) => component.resourceIds.includes(resource.id)),
        global: state.resources.global,
        own: state.resources.players[viewerId] ?? {},
        team: state.teamByPlayer[viewerId] ? (state.resources.teams[state.teamByPlayer[viewerId]!] ?? {}) : {},
      },
    };
  if (component.kind === "randomizer")
    return {
      ...base,
      data: {
        definition: spec.randomizers.find((randomizer) => randomizer.id === component.randomizerId),
        result: state.randomResults[component.randomizerId],
      },
    };
  if (component.kind === "buzzer")
    return { ...base, data: { label: component.label, claimedByPlayerId: state.buzzes[state.phaseId] } };
  if (component.kind === "ordering")
    return {
      ...base,
      data: {
        items: (state.itemOrders[component.id] ?? component.itemIds).map((id) => {
          const item = spec.orderingItems.find((candidate) => candidate.id === id);
          return item ? { id: item.id, label: item.label } : { id, label: id };
        }),
      },
    };
  if (component.kind === "matching")
    return {
      ...base,
      data: {
        items: (state.itemOrders[component.id] ?? component.itemIds).map((id) => {
          const item = spec.matchingItems.find((candidate) => candidate.id === id);
          return item ? { id: item.id, label: item.label } : { id, label: id };
        }),
      },
    };
  if (component.kind === "media")
    return { ...base, data: { media: spec.media.find((media) => media.id === component.mediaId) } };
  if (component.kind === "story")
    return {
      ...base,
      data: {
        label: component.label,
        opening: resolveText(component.opening, state, spec),
        entries: state.actions
          .filter((record) => record.actionId === component.actionId && typeof record.payload.text === "string")
          .map((record) => ({
            sequence: record.sequence,
            round: record.round,
            actorId: record.actorId,
            actorName: players.find((player) => player.id === record.actorId)?.name ?? "Player",
            text: record.payload.text,
          })),
      },
    };
  if (component.kind === "word_duel") {
    const duel = state.wordDuels[component.id];
    const opponentPlayerId = opponentId(state, viewerId);
    const secretWord = duel?.secretWordsByPlayer[opponentPlayerId];
    const guessedLetters = duel?.guessedLettersByPlayer[viewerId] ?? [];
    const guessedSet = new Set(guessedLetters);
    const opponentMask = secretWord
      ? [...secretWord].map((letter) => (state.status === "completed" || guessedSet.has(letter) ? letter : "_"))
      : [];
    const keyboard = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => ({
      letter,
      state: !guessedSet.has(letter) ? "available" : secretWord?.includes(letter) ? "correct" : "wrong",
    }));
    const lastGuess = duel?.lastGuess
      ? {
          ...duel.lastGuess,
          value:
            duel.lastGuess.kind === "letter" || duel.lastGuess.correct || duel.lastGuess.actorId === viewerId
              ? duel.lastGuess.value
              : undefined,
        }
      : null;
    return {
      ...base,
      data: {
        minLength: component.minLength,
        maxLength: component.maxLength,
        hasSubmitted: Boolean(duel?.secretWordsByPlayer[viewerId]),
        submittedPlayerIds: Object.keys(duel?.secretWordsByPlayer ?? {}),
        ownWord: duel?.secretWordsByPlayer[viewerId],
        opponentId: opponentPlayerId,
        opponentName: players.find((player) => player.id === opponentPlayerId)?.name ?? "Opponent",
        opponentMask,
        wordLength: secretWord?.length ?? null,
        keyboard,
        misses: guessedLetters.filter((letter) => !secretWord?.includes(letter)),
        incorrectWordAttempts: duel?.incorrectWordsByPlayer[viewerId] ?? [],
        lastGuess,
      },
    };
  }
  if (component.kind === "second_sense") {
    const sense = state.secondSenses[component.id];
    const revealVisible = sense?.stageStatus === "reveal" || state.status === "completed";
    const qualifiedIds = new Set(sense?.lastRound?.qualifiedPlayerIds ?? []);
    return {
      ...base,
      data: {
        minTargetMs: component.minTargetMs,
        maxTargetMs: component.maxTargetMs,
        stage: sense?.stage ?? 1,
        stageStatus: sense?.stageStatus ?? "open",
        targetMs: sense?.targetMs ?? component.minTargetMs,
        activePlayerIds: sense?.activePlayerIds ?? [],
        startedPlayerIds: sense?.startedPlayerIds ?? [],
        lockedPlayerIds: Object.keys(sense?.attemptsByPlayer ?? {}),
        ownAttemptMs: sense?.attemptsByPlayer[viewerId],
        playerStates: players.map((player) => ({
          playerId: player.id,
          name: player.name,
          status: !(sense?.activePlayerIds.includes(player.id) ?? false)
            ? "eliminated"
            : revealVisible
              ? qualifiedIds.has(player.id)
                ? "qualified"
                : "eliminated"
              : sense?.attemptsByPlayer[player.id] !== undefined
                ? "locked"
                : sense?.startedPlayerIds.includes(player.id)
                  ? "timing"
                  : "ready",
        })),
        lastRound: revealVisible ? sense?.lastRound : null,
        previousTargetMs: sense && sense.targetHistory.length > 1 ? sense.targetHistory.at(-2) : null,
      },
    };
  }
  return { ...base, data: {} };
}

function specializedActionAvailable(state: ComposedGameState, action: ActionDefinition, playerId: string): boolean {
  if (action.kind !== "timing_start" && action.kind !== "timing_stop" && action.kind !== "timing_advance") return true;
  const sense = action.secondSenseId ? state.secondSenses[action.secondSenseId] : undefined;
  if (!sense) return false;
  if (action.kind === "timing_advance") return sense.stageStatus === "reveal";
  if (sense.stageStatus !== "open" || !sense.activePlayerIds.includes(playerId)) return false;
  const started = sense.startedPlayerIds.includes(playerId);
  const stopped = sense.attemptsByPlayer[playerId] !== undefined;
  return action.kind === "timing_start" ? !started && !stopped : started && !stopped;
}

export function projectComposedGameState(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  code: string,
  playerId: string,
): ComposedGameView {
  const viewer = players.find((player) => player.id === playerId);
  if (!viewer || !state.playerOrder.includes(playerId))
    throw new ComposedGameRuleError("Cannot project state for an unknown player.");
  const phase = phaseFor(spec, state.phaseId);
  const components = spec.components
    .filter((component) => phase.componentIds.includes(component.id) && componentVisible(component, state, viewer))
    .map((component) => componentView(component, state, spec, players, playerId));
  const availableActions = phase.actionIds
    .map((id) => actionFor(spec, id))
    .filter(
      (action) =>
        isActorAllowed(state, action, playerId, viewer.isHost) &&
        specializedActionAvailable(state, action, playerId) &&
        !(
          action.oncePerPhase &&
          state.actions.some(
            (record) =>
              record.actionId === action.id && record.actorId === playerId && record.phaseVisit === state.phaseVisit,
          )
        ),
    )
    .map((action) => ({
      id: action.id,
      label: action.label,
      kind: action.kind,
      ...(action.optionIds
        ? {
            options: spec.choices
              .filter((choice) => action.optionIds?.includes(choice.id))
              .map(({ correct: _correct, ...choice }) => choice),
          }
        : {}),
      ...(action.deckId ? { deckId: action.deckId } : {}),
      ...(action.boardId ? { boardId: action.boardId } : {}),
      ...(action.randomizerId ? { randomizerId: action.randomizerId } : {}),
      ...(action.itemIds ? { itemIds: action.itemIds } : {}),
    }));
  return {
    kind: "composed",
    code,
    title: spec.title,
    description: spec.description,
    theme: spec.theme,
    status: state.status,
    revision: state.revision,
    round: Math.min(state.round, spec.setup.rounds),
    totalRounds: spec.setup.rounds,
    phase: { id: phase.id, title: phase.title },
    players,
    selfPlayerId: playerId,
    activePlayerId: state.activePlayerId,
    teams: state.teams,
    captainByTeam: state.captainByTeam ?? {},
    scores: state.scores,
    components,
    availableActions,
    winner: state.winner,
  };
}
