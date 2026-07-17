import { z } from "zod";
import { composedThemeIdSchema, validateComposedGameSpec, type ComposedGameSpec, type ComposedTheme } from "./composed";

export const wordTrapCardSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(48),
    word: z.string().trim().min(2).max(40),
    forbidden: z.array(z.string().trim().min(2).max(32)).length(5),
    category: z.enum(["everyday", "entertainment", "food", "places", "nature", "technology", "sports"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
  })
  .strict();

export const wordTrapSetupSchema = z
  .object({
    themeId: composedThemeIdSchema.default("disco"),
    cardCount: z.number().int().min(6).max(40).default(20),
    preferences: z.string().trim().min(3).max(240).optional(),
    teams: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(24),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          })
          .strict(),
      )
      .min(2)
      .max(4)
      .default([
        { name: "Team Electric", color: "#6c42f5" },
        { name: "Team Velvet", color: "#ff6b4a" },
      ]),
  })
  .superRefine((setup, context) => {
    const names = setup.teams.map((team) => team.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", path: ["teams"], message: "Team names must be unique." });
    }
  })
  .strict();

export const wordTrapPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    game: z.literal("word_trap"),
    source: z.enum(["random", "ai"]),
    themeId: composedThemeIdSchema,
    preferences: z.string().trim().min(3).max(240).optional(),
    teams: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^[a-z][a-z0-9_]*$/)
              .max(48),
            name: z.string().trim().min(2).max(24),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    cards: z.array(wordTrapCardSchema).min(6).max(40),
  })
  .strict();

export type WordTrapCard = z.infer<typeof wordTrapCardSchema>;
export type WordTrapSetupInput = z.input<typeof wordTrapSetupSchema>;
export type WordTrapSetup = z.output<typeof wordTrapSetupSchema>;
export type WordTrapPack = z.infer<typeof wordTrapPackSchema>;

export const wordTrapCatalog: readonly WordTrapCard[] = [
  {
    id: "pizza",
    word: "Pizza",
    forbidden: ["cheese", "slice", "Italy", "dough", "oven"],
    category: "food",
    difficulty: "easy",
  },
  {
    id: "coffee",
    word: "Coffee",
    forbidden: ["drink", "cup", "morning", "caffeine", "bean"],
    category: "food",
    difficulty: "easy",
  },
  {
    id: "chocolate",
    word: "Chocolate",
    forbidden: ["sweet", "cocoa", "bar", "candy", "brown"],
    category: "food",
    difficulty: "easy",
  },
  {
    id: "sushi",
    word: "Sushi",
    forbidden: ["Japan", "rice", "fish", "roll", "raw"],
    category: "food",
    difficulty: "medium",
  },
  {
    id: "popcorn",
    word: "Popcorn",
    forbidden: ["movie", "corn", "snack", "butter", "cinema"],
    category: "food",
    difficulty: "easy",
  },
  {
    id: "birthday",
    word: "Birthday",
    forbidden: ["cake", "party", "candles", "age", "gift"],
    category: "everyday",
    difficulty: "easy",
  },
  {
    id: "vacation",
    word: "Vacation",
    forbidden: ["holiday", "travel", "beach", "work", "hotel"],
    category: "everyday",
    difficulty: "easy",
  },
  {
    id: "umbrella",
    word: "Umbrella",
    forbidden: ["rain", "wet", "open", "weather", "cover"],
    category: "everyday",
    difficulty: "easy",
  },
  {
    id: "toothbrush",
    word: "Toothbrush",
    forbidden: ["teeth", "paste", "bathroom", "clean", "morning"],
    category: "everyday",
    difficulty: "easy",
  },
  {
    id: "alarm_clock",
    word: "Alarm Clock",
    forbidden: ["wake", "morning", "sleep", "time", "ring"],
    category: "everyday",
    difficulty: "medium",
  },
  {
    id: "superhero",
    word: "Superhero",
    forbidden: ["power", "cape", "save", "villain", "comic"],
    category: "entertainment",
    difficulty: "easy",
  },
  {
    id: "karaoke",
    word: "Karaoke",
    forbidden: ["sing", "song", "microphone", "music", "lyrics"],
    category: "entertainment",
    difficulty: "easy",
  },
  {
    id: "detective",
    word: "Detective",
    forbidden: ["crime", "clue", "police", "mystery", "investigate"],
    category: "entertainment",
    difficulty: "medium",
  },
  {
    id: "wizard",
    word: "Wizard",
    forbidden: ["magic", "wand", "spell", "Harry", "robe"],
    category: "entertainment",
    difficulty: "easy",
  },
  {
    id: "documentary",
    word: "Documentary",
    forbidden: ["film", "real", "facts", "camera", "nature"],
    category: "entertainment",
    difficulty: "hard",
  },
  {
    id: "paris",
    word: "Paris",
    forbidden: ["France", "Eiffel", "capital", "city", "Seine"],
    category: "places",
    difficulty: "easy",
  },
  {
    id: "airport",
    word: "Airport",
    forbidden: ["plane", "flight", "passport", "terminal", "luggage"],
    category: "places",
    difficulty: "easy",
  },
  {
    id: "desert",
    word: "Desert",
    forbidden: ["sand", "hot", "camel", "dry", "Sahara"],
    category: "places",
    difficulty: "easy",
  },
  {
    id: "library",
    word: "Library",
    forbidden: ["book", "read", "quiet", "borrow", "shelf"],
    category: "places",
    difficulty: "easy",
  },
  {
    id: "amusement_park",
    word: "Amusement Park",
    forbidden: ["ride", "roller coaster", "fun", "ticket", "Disney"],
    category: "places",
    difficulty: "medium",
  },
  {
    id: "dolphin",
    word: "Dolphin",
    forbidden: ["ocean", "swim", "fish", "smart", "jump"],
    category: "nature",
    difficulty: "easy",
  },
  {
    id: "volcano",
    word: "Volcano",
    forbidden: ["lava", "eruption", "mountain", "hot", "ash"],
    category: "nature",
    difficulty: "easy",
  },
  {
    id: "rainbow",
    word: "Rainbow",
    forbidden: ["colors", "rain", "sky", "arc", "sun"],
    category: "nature",
    difficulty: "easy",
  },
  {
    id: "penguin",
    word: "Penguin",
    forbidden: ["bird", "ice", "black", "white", "Antarctica"],
    category: "nature",
    difficulty: "easy",
  },
  {
    id: "photosynthesis",
    word: "Photosynthesis",
    forbidden: ["plant", "sunlight", "green", "energy", "oxygen"],
    category: "nature",
    difficulty: "hard",
  },
  {
    id: "smartphone",
    word: "Smartphone",
    forbidden: ["phone", "call", "screen", "app", "mobile"],
    category: "technology",
    difficulty: "easy",
  },
  {
    id: "password",
    word: "Password",
    forbidden: ["login", "secret", "account", "letters", "security"],
    category: "technology",
    difficulty: "medium",
  },
  {
    id: "robot",
    word: "Robot",
    forbidden: ["machine", "human", "metal", "AI", "program"],
    category: "technology",
    difficulty: "easy",
  },
  {
    id: "wifi",
    word: "Wi-Fi",
    forbidden: ["internet", "wireless", "router", "connection", "password"],
    category: "technology",
    difficulty: "easy",
  },
  {
    id: "algorithm",
    word: "Algorithm",
    forbidden: ["computer", "code", "steps", "data", "program"],
    category: "technology",
    difficulty: "hard",
  },
  {
    id: "football",
    word: "Football",
    forbidden: ["ball", "goal", "team", "field", "kick"],
    category: "sports",
    difficulty: "easy",
  },
  {
    id: "basketball",
    word: "Basketball",
    forbidden: ["ball", "hoop", "court", "NBA", "dribble"],
    category: "sports",
    difficulty: "easy",
  },
  {
    id: "marathon",
    word: "Marathon",
    forbidden: ["run", "race", "distance", "finish", "kilometers"],
    category: "sports",
    difficulty: "medium",
  },
  {
    id: "surfing",
    word: "Surfing",
    forbidden: ["wave", "board", "ocean", "beach", "water"],
    category: "sports",
    difficulty: "easy",
  },
  {
    id: "referee",
    word: "Referee",
    forbidden: ["whistle", "sport", "rules", "game", "penalty"],
    category: "sports",
    difficulty: "medium",
  },
  {
    id: "time_machine",
    word: "Time Machine",
    forbidden: ["future", "past", "travel", "clock", "DeLorean"],
    category: "entertainment",
    difficulty: "medium",
  },
  {
    id: "ghost",
    word: "Ghost",
    forbidden: ["dead", "haunted", "spirit", "scary", "invisible"],
    category: "entertainment",
    difficulty: "easy",
  },
  {
    id: "wedding",
    word: "Wedding",
    forbidden: ["marriage", "bride", "groom", "ring", "ceremony"],
    category: "everyday",
    difficulty: "easy",
  },
  {
    id: "traffic_jam",
    word: "Traffic Jam",
    forbidden: ["cars", "road", "stuck", "drive", "rush hour"],
    category: "everyday",
    difficulty: "medium",
  },
  {
    id: "recycling",
    word: "Recycling",
    forbidden: ["waste", "plastic", "bin", "reuse", "environment"],
    category: "everyday",
    difficulty: "medium",
  },
  {
    id: "avocado",
    word: "Avocado",
    forbidden: ["green", "fruit", "toast", "guacamole", "seed"],
    category: "food",
    difficulty: "easy",
  },
  {
    id: "pancake",
    word: "Pancake",
    forbidden: ["breakfast", "flat", "syrup", "flip", "batter"],
    category: "food",
    difficulty: "easy",
  },
  {
    id: "museum",
    word: "Museum",
    forbidden: ["art", "history", "exhibit", "gallery", "visit"],
    category: "places",
    difficulty: "easy",
  },
  {
    id: "north_pole",
    word: "North Pole",
    forbidden: ["Santa", "ice", "Arctic", "cold", "top"],
    category: "places",
    difficulty: "medium",
  },
  {
    id: "earthquake",
    word: "Earthquake",
    forbidden: ["ground", "shake", "disaster", "magnitude", "fault"],
    category: "nature",
    difficulty: "medium",
  },
  {
    id: "constellation",
    word: "Constellation",
    forbidden: ["stars", "sky", "pattern", "night", "zodiac"],
    category: "nature",
    difficulty: "hard",
  },
  {
    id: "virtual_reality",
    word: "Virtual Reality",
    forbidden: ["headset", "game", "digital", "3D", "computer"],
    category: "technology",
    difficulty: "medium",
  },
  {
    id: "podcast",
    word: "Podcast",
    forbidden: ["listen", "audio", "episode", "host", "radio"],
    category: "technology",
    difficulty: "medium",
  },
  {
    id: "gymnastics",
    word: "Gymnastics",
    forbidden: ["flip", "balance", "Olympics", "beam", "routine"],
    category: "sports",
    difficulty: "medium",
  },
  {
    id: "chess",
    word: "Chess",
    forbidden: ["king", "queen", "board", "pieces", "checkmate"],
    category: "sports",
    difficulty: "medium",
  },
];

function numberHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
  const shuffled = [...values];
  let state = numberHash(seed) || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const selected = state % (index + 1);
    [shuffled[index], shuffled[selected]] = [shuffled[selected]!, shuffled[index]!];
  }
  return shuffled;
}

export function createWordTrapPack(
  setupInput: WordTrapSetupInput,
  cardIds: readonly string[],
  source: WordTrapPack["source"],
): WordTrapPack {
  const setup = wordTrapSetupSchema.parse(setupInput);
  if (cardIds.length !== setup.cardCount) throw new Error(`WordTrap requires exactly ${setup.cardCount} cards.`);
  if (new Set(cardIds).size !== cardIds.length) throw new Error("WordTrap cannot contain duplicate cards.");
  const byId = new Map(wordTrapCatalog.map((card) => [card.id, card]));
  const cards = cardIds.map((id) => {
    const card = byId.get(id);
    if (!card) throw new Error(`Unknown WordTrap card id: ${id}`);
    return card;
  });
  return wordTrapPackSchema.parse({
    schemaVersion: 1,
    game: "word_trap",
    source,
    themeId: setup.themeId,
    ...(setup.preferences ? { preferences: setup.preferences } : {}),
    teams: setup.teams.map((team, index) => ({ id: `team_${index + 1}`, ...team })),
    cards,
  });
}

export function createRandomWordTrapPack(setupInput: WordTrapSetupInput, seed: string): WordTrapPack {
  const setup = wordTrapSetupSchema.parse(setupInput);
  const selected = deterministicShuffle(wordTrapCatalog, seed).slice(0, setup.cardCount);
  return createWordTrapPack(
    setup,
    selected.map((card) => card.id),
    "random",
  );
}

export function createWordTrapSpec(packInput: WordTrapPack): ComposedGameSpec {
  const pack = wordTrapPackSchema.parse(packInput);
  const rounds = pack.cards.length;
  const theme: ComposedTheme = pack.themeId;
  const suffix = numberHash(`word-trap-v1:${pack.themeId}:${pack.cards.map((card) => card.id).join(":")}`).toString(36);
  const resolveEffects = (discardTarget: "actor" | "active_player") => [
    { kind: "discard_selected_card" as const, deckId: "words", target: discardTarget },
    { kind: "advance_round" as const, resetPhaseActions: true },
    { kind: "set_active_player" as const, mode: "next_team_captain" as const },
    { kind: "advance_phase" as const },
  ];
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `word_trap_${suffix}`.slice(0, 48),
    template: "composed",
    experienceId: "word_trap",
    title: "WordTrap",
    description: pack.preferences
      ? `A forbidden-word challenge tailored around ${pack.preferences}.`
      : "Give clever clues, avoid five forbidden words, and beat the buzzer.",
    theme,
    minPlayers: pack.teams.length,
    maxPlayers: 12,
    suggestedDurationMinutes: Math.max(8, Math.ceil(rounds * 1.15)),
    setup: {
      mode: "teams",
      teamPolicy: {
        teams: pack.teams,
        minMembersPerTeam: 1,
        maxMembersPerTeam: 6,
        allocation: "balanced",
        allowUnevenTeams: true,
        rotateActivePlayer: true,
      },
      rounds,
      startingPhaseId: "select_clue_giver",
      startingPlayer: "random",
    },
    variables: [],
    choices: [],
    clues: [],
    reveals: [],
    orderingItems: [],
    matchingItems: [],
    boards: [],
    resources: [],
    randomizers: [],
    media: [],
    decks: [
      {
        id: "words",
        name: "Forbidden word cards",
        visibility: "private",
        shuffle: true,
        initialHandSize: 0,
        cards: pack.cards.map((card) => ({
          id: card.id,
          title: card.word,
          body: `DO NOT SAY: ${card.forbidden.join(" · ")}`,
          icon: "⚡",
          tags: [card.category, card.difficulty],
        })),
      },
    ],
    components: [
      {
        id: "game_header",
        kind: "header",
        audience: "public",
        eyebrow: "BoardForge Original",
        title: { kind: "literal", value: "WordTrap" },
        description: { kind: "literal", value: "Make your team guess the word without stepping into the trap." },
        icon: "⚡",
      },
      { id: "word_deck", kind: "deck", audience: "active_player", deckId: "words", label: "Secret word" },
      {
        id: "word_prompt",
        kind: "prompt",
        audience: "active_player",
        category: "Make them guess",
        prompt: { kind: "active_card", deckId: "words", field: "title" },
        hint: { kind: "active_card", deckId: "words", field: "body" },
        icon: "⚡",
      },
      { id: "clue_timer", kind: "timer", audience: "public", seconds: 60, label: "Time remaining" },
      { id: "turn", kind: "turn", audience: "public" },
      { id: "round", kind: "round", audience: "public", label: "Card" },
      { id: "teams", kind: "teams", audience: "public" },
      { id: "scores", kind: "scores", audience: "public", title: "Team score" },
      { id: "trap_buzzer", kind: "buzzer", audience: "public", label: "Forbidden word!" },
      {
        id: "outcome",
        kind: "outcome",
        audience: "public",
        title: { kind: "literal", value: "Final score" },
        description: { kind: "literal", value: "The team with the most points escapes the trap." },
      },
    ],
    actions: [
      {
        id: "select_clue_giver",
        label: "Choose the clue giver",
        kind: "select_player",
        actor: "team_captain",
        oncePerPhase: true,
        effects: [{ kind: "set_active_player", mode: "selected" }, { kind: "advance_phase" }],
      },
      {
        id: "draw_word",
        label: "Reveal my word",
        kind: "draw",
        actor: "active_player",
        oncePerPhase: true,
        deckId: "words",
        effects: [{ kind: "draw_cards", deckId: "words", count: 1, target: "actor" }, { kind: "advance_phase" }],
      },
      {
        id: "word_guessed",
        label: "Word guessed",
        kind: "complete_challenge",
        actor: "active_player",
        oncePerPhase: true,
        effects: [{ kind: "add_score", target: "actor_team", amount: 1 }, ...resolveEffects("actor")],
      },
      {
        id: "word_passed",
        label: "Pass",
        kind: "advance",
        actor: "active_player",
        oncePerPhase: true,
        effects: resolveEffects("actor"),
      },
      {
        id: "forbidden_called",
        label: "Forbidden word!",
        kind: "buzz",
        actor: "opponents",
        oncePerPhase: true,
        effects: [{ kind: "add_score", target: "actor_team", amount: 1 }, ...resolveEffects("active_player")],
      },
    ],
    rules: [
      ...["word_guessed", "word_passed", "forbidden_called"].map((actionId) => ({
        id: `end_after_${actionId}`,
        trigger: { kind: "after_action" as const, actionId },
        conditionMode: "all" as const,
        conditions: [{ kind: "round_at_least" as const, round: rounds + 1 }],
        effects: [{ kind: "end_game" as const, winnerBy: "highest_score" as const }],
      })),
    ],
    phases: [
      {
        id: "select_clue_giver",
        title: "The captain chooses",
        componentIds: ["game_header", "round", "turn", "teams", "scores"],
        actionIds: ["select_clue_giver"],
        nextPhaseId: "draw",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "draw",
        title: "Secret card",
        componentIds: ["game_header", "round", "turn", "teams", "scores", "word_deck"],
        actionIds: ["draw_word"],
        nextPhaseId: "clue",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "clue",
        title: "Beat the trap",
        componentIds: ["game_header", "round", "turn", "teams", "scores", "clue_timer", "word_prompt", "trap_buzzer"],
        actionIds: ["word_guessed", "word_passed", "forbidden_called"],
        nextPhaseId: "select_clue_giver",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new Error(
      `Invalid WordTrap GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`,
    );
  return validation.spec;
}

export const defaultWordTrapPack = createRandomWordTrapPack(
  { themeId: "disco", cardCount: 20 },
  "boardforge-default-word-trap",
);
export const defaultWordTrapSpec = createWordTrapSpec(defaultWordTrapPack);
