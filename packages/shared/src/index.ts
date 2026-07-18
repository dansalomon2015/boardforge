export type GameTemplate = "hidden_roles" | "quiz_vote" | "composed";

export type ComposedExperienceId =
  | "movie_mime"
  | "word_trap"
  | "draw_battle"
  | "sound_check"
  | "story_chain"
  | "word_duel"
  | "second_sense"
  | "generic";

export type PublicPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
};

export type GameSummary = {
  template: GameTemplate;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  durationMinutes: number;
  accent: string;
  experienceId?: ComposedExperienceId | undefined;
};

export type LobbyView = {
  kind: "lobby";
  code: string;
  game: GameSummary;
  players: PublicPlayer[];
  selfPlayerId: string;
  canStart: boolean;
  startBlockReason?: string | undefined;
  teamSetup?:
    | {
        teams: Array<{
          id: string;
          name: string;
          color: string;
          playerIds: string[];
          maxMembers?: number | undefined;
          captainPlayerId?: string | undefined;
        }>;
        selfTeamId?: string | undefined;
        allowUnevenTeams: boolean;
      }
    | undefined;
};

export type HiddenRolesView = {
  kind: "hidden_roles";
  code: string;
  title: string;
  status: "playing" | "completed";
  revision: number;
  round: number;
  totalRounds: number;
  phase: "mission" | "vote" | "reveal" | "completed";
  players: PublicPlayer[];
  selfPlayerId: string;
  ownRole: {
    id: string;
    name: string;
    team: "crew" | "saboteur";
    objective: string;
  };
  submitted: boolean;
  scores: { crew: number; saboteur: number };
  lastReveal?: {
    sabotages: number;
    suspectedPlayerName?: string;
  };
  winner?: "crew" | "saboteur";
};

export type QuizVoteView = {
  kind: "quiz_vote";
  code: string;
  title: string;
  status: "playing" | "completed";
  revision: number;
  round: number;
  totalRounds: number;
  phase: "answer" | "reveal" | "completed";
  players: PublicPlayer[];
  selfPlayerId: string;
  question: {
    id: string;
    type: "trivia" | "player_vote";
    prompt: string;
    options?: Array<{ id: string; label: string }>;
  };
  submitted: boolean;
  scores: Record<string, number>;
  reveal?: {
    correctOptionId?: string;
    mostVotedPlayerId?: string;
    explanation: string;
  };
  winnerPlayerIds?: string[];
};

export type ComposedTheme =
  | "arcade"
  | "tropical"
  | "mystery"
  | "cosmic"
  | "western"
  | "medieval"
  | "cyberpunk"
  | "enchanted"
  | "pirate"
  | "spooky"
  | "retro"
  | "disco"
  | "noir"
  | "candy"
  | "nature"
  | "ocean"
  | "laboratory"
  | "royal"
  | "cozy"
  | "minimal"
  | {
      id: "custom";
      name: string;
      radius: "soft" | "round" | "sharp";
      colors: {
        background: string;
        surface: string;
        surfaceAlt: string;
        text: string;
        muted: string;
        primary: string;
        secondary: string;
        accent: string;
        border: string;
      };
    };

export type ResolvedGameComponent = {
  id: string;
  kind:
    | "header"
    | "prompt"
    | "deck"
    | "choices"
    | "text_input"
    | "drawing"
    | "timer"
    | "turn"
    | "round"
    | "teams"
    | "players"
    | "scores"
    | "clues"
    | "challenge"
    | "reveal"
    | "outcome"
    | "board"
    | "card_zone"
    | "resources"
    | "randomizer"
    | "buzzer"
    | "ordering"
    | "matching"
    | "media"
    | "story"
    | "word_duel"
    | "second_sense";
  data: Record<string, unknown>;
};

export type ComposedGameView = {
  kind: "composed";
  code: string;
  experienceId: ComposedExperienceId;
  title: string;
  description: string;
  theme: ComposedTheme;
  status: "playing" | "completed";
  revision: number;
  round: number;
  totalRounds: number;
  phase: { id: string; title: string };
  players: PublicPlayer[];
  selfPlayerId: string;
  activePlayerId: string;
  teams: Array<{ id: string; name: string; color: string; playerIds: string[] }>;
  captainByTeam: Record<string, string>;
  scores: { global: number; players: Record<string, number>; teams: Record<string, number> };
  components: ResolvedGameComponent[];
  availableActions: Array<{
    id: string;
    label: string;
    kind:
      | "advance"
      | "choose"
      | "text"
      | "draw"
      | "play_card"
      | "move"
      | "resource"
      | "randomize"
      | "buzz"
      | "order"
      | "match"
      | "complete_challenge"
      | "select_player"
      | "sketch"
      | "secret_word"
      | "letter_guess"
      | "word_guess"
      | "timing_start"
      | "timing_stop"
      | "timing_advance";
    options?:
      | Array<{ id: string; label: string; description?: string | undefined; icon?: string | undefined }>
      | undefined;
    deckId?: string | undefined;
    boardId?: string | undefined;
    randomizerId?: string | undefined;
    itemIds?: string[] | undefined;
  }>;
  winner: { kind: "players" | "teams" | "none"; ids: string[] } | null;
};

export type RoomView = LobbyView | HiddenRolesView | QuizVoteView | ComposedGameView;

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

export type GameAction =
  | { type: "SUBMIT_MISSION"; choice: "success" | "sabotage" }
  | { type: "CAST_VOTE"; targetPlayerId: string }
  | { type: "SUBMIT_ANSWER"; optionId: string }
  | { type: "CAST_PLAYER_VOTE"; targetPlayerId: string }
  | { type: "ADVANCE" }
  | { type: "COMPOSED_ACTION"; actionId: string; payload?: ComposedActionPayload | undefined };

export type GameActionEnvelope = {
  code: string;
  playerId: string;
  expectedRevision: number;
  idempotencyKey: string;
  action: GameAction;
};

export type JoinRoomPayload = {
  code: string;
  name: string;
  playerId?: string;
  reconnectToken?: string;
};

export type JoinRoomResult = {
  playerId: string;
  reconnectToken: string;
  view: RoomView;
};

export type GameNightView = {
  id: string;
  code: string;
  status: "lobby" | "playing" | "completed";
  selfPlayerId: string;
  isHost: boolean;
  players: PublicPlayer[];
  teams: Array<{
    id: string;
    name: string;
    color: string;
    playerIds: string[];
    captainPlayerId?: string | undefined;
    score: number;
  }>;
  currentRoomCode: string | null;
  gamesPlayed: number;
};

export type JoinGameNightResult = {
  playerId: string;
  reconnectToken: string;
  view: GameNightView;
};

export type SocketAck<T> = { ok: true; data: T } | { ok: false; error: string };
