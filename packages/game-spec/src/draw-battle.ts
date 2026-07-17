import { z } from "zod";
import { composedThemeIdSchema, validateComposedGameSpec, type ComposedGameSpec, type ComposedTheme } from "./composed";

export const drawBattlePromptSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(48),
    prompt: z.string().trim().min(2).max(48),
    category: z.enum(["everyday", "animals", "food", "places", "fantasy", "entertainment", "actions", "objects"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
  })
  .strict();

const teamSchema = z
  .object({
    name: z.string().trim().min(2).max(24),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const drawBattleSetupSchema = z
  .object({
    themeId: composedThemeIdSchema.default("arcade"),
    promptCount: z.number().int().min(6).max(30).default(18),
    preferences: z.string().trim().min(3).max(240).optional(),
    teams: z
      .array(teamSchema)
      .min(2)
      .max(4)
      .default([
        { name: "The Doodlers", color: "#7357ff" },
        { name: "The Scribblers", color: "#ff6b4a" },
      ]),
  })
  .superRefine((setup, context) => {
    const names = setup.teams.map((team) => team.name.toLowerCase());
    if (new Set(names).size !== names.length)
      context.addIssue({ code: "custom", path: ["teams"], message: "Team names must be unique." });
  })
  .strict();

export const drawBattlePackSchema = z
  .object({
    schemaVersion: z.literal(1),
    game: z.literal("draw_battle"),
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
    prompts: z.array(drawBattlePromptSchema).min(6).max(30),
  })
  .strict();

export type DrawBattlePrompt = z.infer<typeof drawBattlePromptSchema>;
export type DrawBattleSetupInput = z.input<typeof drawBattleSetupSchema>;
export type DrawBattleSetup = z.output<typeof drawBattleSetupSchema>;
export type DrawBattlePack = z.infer<typeof drawBattlePackSchema>;

export const drawBattleCatalog: readonly DrawBattlePrompt[] = [
  { id: "bicycle", prompt: "Bicycle", category: "objects", difficulty: "easy" },
  { id: "umbrella", prompt: "Umbrella", category: "objects", difficulty: "easy" },
  { id: "toothbrush", prompt: "Toothbrush", category: "objects", difficulty: "easy" },
  { id: "alarm_clock", prompt: "Alarm Clock", category: "objects", difficulty: "medium" },
  { id: "vacuum_cleaner", prompt: "Vacuum Cleaner", category: "objects", difficulty: "medium" },
  { id: "shopping_cart", prompt: "Shopping Cart", category: "objects", difficulty: "medium" },
  { id: "guitar", prompt: "Guitar", category: "objects", difficulty: "easy" },
  { id: "telescope", prompt: "Telescope", category: "objects", difficulty: "medium" },
  { id: "cactus", prompt: "Cactus", category: "everyday", difficulty: "easy" },
  { id: "birthday_party", prompt: "Birthday Party", category: "everyday", difficulty: "medium" },
  { id: "traffic_jam", prompt: "Traffic Jam", category: "everyday", difficulty: "medium" },
  { id: "first_day_school", prompt: "First Day of School", category: "everyday", difficulty: "hard" },
  { id: "camping", prompt: "Camping", category: "everyday", difficulty: "easy" },
  { id: "rainy_day", prompt: "Rainy Day", category: "everyday", difficulty: "easy" },
  { id: "penguin", prompt: "Penguin", category: "animals", difficulty: "easy" },
  { id: "giraffe", prompt: "Giraffe", category: "animals", difficulty: "easy" },
  { id: "octopus", prompt: "Octopus", category: "animals", difficulty: "easy" },
  { id: "chameleon", prompt: "Chameleon", category: "animals", difficulty: "medium" },
  { id: "peacock", prompt: "Peacock", category: "animals", difficulty: "medium" },
  { id: "platypus", prompt: "Platypus", category: "animals", difficulty: "hard" },
  { id: "pizza", prompt: "Pizza", category: "food", difficulty: "easy" },
  { id: "ice_cream", prompt: "Ice Cream", category: "food", difficulty: "easy" },
  { id: "spaghetti", prompt: "Spaghetti", category: "food", difficulty: "easy" },
  { id: "pancake_stack", prompt: "Pancake Stack", category: "food", difficulty: "medium" },
  { id: "sushi_roll", prompt: "Sushi Roll", category: "food", difficulty: "medium" },
  { id: "fortune_cookie", prompt: "Fortune Cookie", category: "food", difficulty: "hard" },
  { id: "eiffel_tower", prompt: "Eiffel Tower", category: "places", difficulty: "easy" },
  { id: "desert_island", prompt: "Desert Island", category: "places", difficulty: "easy" },
  { id: "haunted_house", prompt: "Haunted House", category: "places", difficulty: "medium" },
  { id: "amusement_park", prompt: "Amusement Park", category: "places", difficulty: "medium" },
  { id: "space_station", prompt: "Space Station", category: "places", difficulty: "hard" },
  { id: "underwater_city", prompt: "Underwater City", category: "places", difficulty: "hard" },
  { id: "dragon", prompt: "Dragon", category: "fantasy", difficulty: "easy" },
  { id: "wizard", prompt: "Wizard", category: "fantasy", difficulty: "easy" },
  { id: "magic_carpet", prompt: "Magic Carpet", category: "fantasy", difficulty: "medium" },
  { id: "mermaid", prompt: "Mermaid", category: "fantasy", difficulty: "medium" },
  { id: "invisible_man", prompt: "Invisible Person", category: "fantasy", difficulty: "hard" },
  { id: "time_machine", prompt: "Time Machine", category: "fantasy", difficulty: "hard" },
  { id: "superhero", prompt: "Superhero", category: "entertainment", difficulty: "easy" },
  { id: "rock_concert", prompt: "Rock Concert", category: "entertainment", difficulty: "medium" },
  { id: "movie_theater", prompt: "Movie Theater", category: "entertainment", difficulty: "medium" },
  { id: "video_game", prompt: "Video Game", category: "entertainment", difficulty: "medium" },
  { id: "detective", prompt: "Detective", category: "entertainment", difficulty: "medium" },
  { id: "talent_show", prompt: "Talent Show", category: "entertainment", difficulty: "hard" },
  { id: "moonwalking", prompt: "Moonwalking", category: "actions", difficulty: "medium" },
  { id: "juggling", prompt: "Juggling", category: "actions", difficulty: "easy" },
  { id: "building_sandcastle", prompt: "Building a Sandcastle", category: "actions", difficulty: "medium" },
  { id: "walking_dog", prompt: "Walking the Dog", category: "actions", difficulty: "easy" },
  { id: "taking_selfie", prompt: "Taking a Selfie", category: "actions", difficulty: "easy" },
  { id: "chasing_butterfly", prompt: "Chasing a Butterfly", category: "actions", difficulty: "hard" },
  { id: "hot_air_balloon", prompt: "Hot Air Balloon", category: "objects", difficulty: "medium" },
  { id: "snow_globe", prompt: "Snow Globe", category: "objects", difficulty: "medium" },
  { id: "roller_skates", prompt: "Roller Skates", category: "objects", difficulty: "easy" },
  { id: "treasure_map", prompt: "Treasure Map", category: "objects", difficulty: "medium" },
  { id: "robot", prompt: "Robot", category: "entertainment", difficulty: "easy" },
  { id: "volcano", prompt: "Volcano", category: "places", difficulty: "easy" },
  { id: "pirate_ship", prompt: "Pirate Ship", category: "fantasy", difficulty: "easy" },
  { id: "northern_lights", prompt: "Northern Lights", category: "places", difficulty: "hard" },
  { id: "breakfast_bed", prompt: "Breakfast in Bed", category: "everyday", difficulty: "hard" },
  { id: "cat_keyboard", prompt: "Cat on a Keyboard", category: "animals", difficulty: "hard" },
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

export function createDrawBattlePack(
  setupInput: DrawBattleSetupInput,
  promptIds: readonly string[],
  source: DrawBattlePack["source"],
): DrawBattlePack {
  const setup = drawBattleSetupSchema.parse(setupInput);
  if (promptIds.length !== setup.promptCount)
    throw new Error(`DrawBattle requires exactly ${setup.promptCount} prompts.`);
  if (new Set(promptIds).size !== promptIds.length) throw new Error("DrawBattle cannot contain duplicate prompts.");
  const byId = new Map(drawBattleCatalog.map((prompt) => [prompt.id, prompt]));
  const prompts = promptIds.map((id) => {
    const prompt = byId.get(id);
    if (!prompt) throw new Error(`Unknown DrawBattle prompt id: ${id}`);
    return prompt;
  });
  return drawBattlePackSchema.parse({
    schemaVersion: 1,
    game: "draw_battle",
    source,
    themeId: setup.themeId,
    ...(setup.preferences ? { preferences: setup.preferences } : {}),
    teams: setup.teams.map((team, index) => ({ id: `team_${index + 1}`, ...team })),
    prompts,
  });
}

export function createRandomDrawBattlePack(setupInput: DrawBattleSetupInput, seed: string): DrawBattlePack {
  const setup = drawBattleSetupSchema.parse(setupInput);
  return createDrawBattlePack(
    setup,
    deterministicShuffle(drawBattleCatalog, seed)
      .slice(0, setup.promptCount)
      .map((prompt) => prompt.id),
    "random",
  );
}

export function createDrawBattleSpec(packInput: DrawBattlePack): ComposedGameSpec {
  const pack = drawBattlePackSchema.parse(packInput);
  const rounds = pack.prompts.length;
  const theme: ComposedTheme = pack.themeId;
  const suffix = numberHash(
    `draw-battle-v1:${pack.themeId}:${pack.prompts.map((prompt) => prompt.id).join(":")}`,
  ).toString(36);
  const resolveEffects = [
    { kind: "discard_selected_card" as const, deckId: "prompts", target: "active_player" as const },
    { kind: "advance_round" as const, resetPhaseActions: true },
    { kind: "set_active_player" as const, mode: "next_team_captain" as const },
    { kind: "advance_phase" as const },
  ];
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `draw_battle_${suffix}`.slice(0, 48),
    template: "composed",
    title: "DrawBattle",
    description: pack.preferences
      ? `A live drawing showdown tailored around ${pack.preferences}.`
      : "Draw together, race to name the secret prompt, and turn every line into points.",
    theme,
    minPlayers: pack.teams.length,
    maxPlayers: 12,
    suggestedDurationMinutes: Math.max(10, Math.ceil(rounds * 1.35)),
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
      startingPhaseId: "select_artist",
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
        id: "prompts",
        name: "Drawing prompts",
        visibility: "private",
        shuffle: true,
        initialHandSize: 0,
        cards: pack.prompts.map((prompt) => ({
          id: prompt.id,
          title: prompt.prompt,
          body: `${prompt.category} · ${prompt.difficulty}`,
          icon: "✎",
          tags: [prompt.category, prompt.difficulty],
        })),
      },
    ],
    components: [
      {
        id: "game_header",
        kind: "header",
        audience: "public",
        eyebrow: "BoardForge Original",
        title: { kind: "literal", value: "DrawBattle" },
        description: { kind: "literal", value: "One secret prompt. One live canvas. Everyone else races to guess." },
        icon: "✎",
      },
      { id: "prompt_deck", kind: "deck", audience: "active_player", deckId: "prompts", label: "Secret prompt" },
      {
        id: "secret_prompt",
        kind: "prompt",
        audience: "active_player",
        category: "Draw this",
        prompt: { kind: "active_card", deckId: "prompts", field: "title" },
        hint: { kind: "active_card", deckId: "prompts", field: "body" },
        icon: "✎",
      },
      { id: "live_canvas", kind: "drawing", audience: "public", label: "Live canvas" },
      {
        id: "guess_input",
        kind: "text_input",
        audience: "public",
        label: "Name the drawing",
        placeholder: "Type your guess…",
        multiline: false,
        maxLength: 48,
      },
      { id: "draw_timer", kind: "timer", audience: "public", seconds: 75, label: "Drawing time" },
      { id: "turn", kind: "turn", audience: "public" },
      { id: "round", kind: "round", audience: "public", label: "Canvas" },
      { id: "teams", kind: "teams", audience: "public" },
      { id: "scores", kind: "scores", audience: "public", title: "Team score" },
      {
        id: "outcome",
        kind: "outcome",
        audience: "public",
        title: { kind: "literal", value: "Final gallery" },
        description: { kind: "literal", value: "The team with the most correct guesses wins DrawBattle." },
      },
    ],
    actions: [
      {
        id: "select_artist",
        label: "Choose the artist",
        kind: "select_player",
        actor: "team_captain",
        oncePerPhase: true,
        effects: [{ kind: "set_active_player", mode: "selected" }, { kind: "advance_phase" }],
      },
      {
        id: "draw_prompt",
        label: "Reveal my prompt",
        kind: "draw",
        actor: "active_player",
        oncePerPhase: true,
        deckId: "prompts",
        effects: [{ kind: "draw_cards", deckId: "prompts", count: 1, target: "actor" }, { kind: "advance_phase" }],
      },
      {
        id: "pass_prompt",
        label: "Pass prompt",
        kind: "advance",
        actor: "active_player",
        oncePerPhase: true,
        effects: resolveEffects,
      },
      {
        id: "submit_guess",
        label: "Submit guess",
        kind: "text",
        actor: "guessers",
        oncePerPhase: false,
        answerDeckId: "prompts",
        effects: [],
      },
      { id: "draw_stroke", label: "Draw", kind: "sketch", actor: "active_player", oncePerPhase: false, effects: [] },
    ],
    rules: [
      {
        id: "resolve_correct_guess",
        trigger: { kind: "after_action", actionId: "submit_guess" },
        conditionMode: "all",
        conditions: [{ kind: "last_input_correct", actionId: "submit_guess" }],
        effects: [{ kind: "add_score", target: "actor_team", amount: 1 }, ...resolveEffects],
      },
      {
        id: "end_after_guess",
        trigger: { kind: "after_action", actionId: "submit_guess" },
        conditionMode: "all",
        conditions: [
          { kind: "last_input_correct", actionId: "submit_guess" },
          { kind: "round_at_least", round: rounds + 1 },
        ],
        effects: [{ kind: "end_game", winnerBy: "highest_score" }],
      },
      {
        id: "end_after_pass",
        trigger: { kind: "after_action", actionId: "pass_prompt" },
        conditionMode: "all",
        conditions: [{ kind: "round_at_least", round: rounds + 1 }],
        effects: [{ kind: "end_game", winnerBy: "highest_score" }],
      },
    ],
    phases: [
      {
        id: "select_artist",
        title: "The captain chooses",
        componentIds: ["game_header", "round", "turn", "teams", "scores"],
        actionIds: ["select_artist"],
        nextPhaseId: "draw_prompt",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "draw_prompt",
        title: "Secret prompt",
        componentIds: ["game_header", "round", "turn", "teams", "scores", "prompt_deck"],
        actionIds: ["draw_prompt"],
        nextPhaseId: "drawing",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "drawing",
        title: "Live canvas",
        componentIds: [
          "game_header",
          "round",
          "turn",
          "teams",
          "scores",
          "draw_timer",
          "secret_prompt",
          "live_canvas",
          "guess_input",
        ],
        actionIds: ["pass_prompt", "submit_guess", "draw_stroke"],
        nextPhaseId: "select_artist",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new Error(
      `Invalid DrawBattle GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`,
    );
  return validation.spec;
}

export const defaultDrawBattlePack = createRandomDrawBattlePack(
  { themeId: "arcade", promptCount: 18 },
  "boardforge-default-draw-battle",
);
export const defaultDrawBattleSpec = createDrawBattleSpec(defaultDrawBattlePack);
