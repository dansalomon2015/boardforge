import type { ActionDefinition, ComposedComponent, ComposedGameSpec } from "@boardforge/game-spec";
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
  experienceId: ComposedGameSpec["experienceId"];
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
