import { z } from "zod";
import { composedThemeIdSchema, validateComposedGameSpec, type ComposedGameSpec, type ComposedTheme } from "./composed";

export const soundCheckPromptSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(48),
    answer: z.string().trim().min(2).max(48),
    category: z.enum(["animals", "machines", "household", "people", "nature", "situations", "music", "transport"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
  })
  .strict();

const teamSchema = z
  .object({
    name: z.string().trim().min(2).max(24),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const soundCheckSetupSchema = z
  .object({
    themeId: composedThemeIdSchema.default("retro"),
    promptCount: z.number().int().min(6).max(30).default(18),
    preferences: z.string().trim().min(3).max(240).optional(),
    teams: z
      .array(teamSchema)
      .min(2)
      .max(4)
      .default([
        { name: "The Echoes", color: "#7357ff" },
        { name: "The Frequencies", color: "#ff6b4a" },
      ]),
  })
  .superRefine((setup, context) => {
    const names = setup.teams.map((team) => team.name.toLowerCase());
    if (new Set(names).size !== names.length)
      context.addIssue({ code: "custom", path: ["teams"], message: "Team names must be unique." });
  })
  .strict();

export const soundCheckPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    game: z.literal("sound_check"),
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
    prompts: z.array(soundCheckPromptSchema).min(6).max(30),
  })
  .strict();

export type SoundCheckPrompt = z.infer<typeof soundCheckPromptSchema>;
export type SoundCheckSetupInput = z.input<typeof soundCheckSetupSchema>;
export type SoundCheckSetup = z.output<typeof soundCheckSetupSchema>;
export type SoundCheckPack = z.infer<typeof soundCheckPackSchema>;

export const soundCheckCatalog: readonly SoundCheckPrompt[] = [
  { id: "cat_purring", answer: "Cat Purring", category: "animals", difficulty: "easy" },
  { id: "dog_barking", answer: "Dog Barking", category: "animals", difficulty: "easy" },
  { id: "cow_mooing", answer: "Cow Mooing", category: "animals", difficulty: "easy" },
  { id: "rooster_crowing", answer: "Rooster Crowing", category: "animals", difficulty: "easy" },
  { id: "mosquito_buzzing", answer: "Mosquito Buzzing", category: "animals", difficulty: "medium" },
  { id: "owl_hooting", answer: "Owl Hooting", category: "animals", difficulty: "medium" },
  { id: "dolphin_clicking", answer: "Dolphin Clicking", category: "animals", difficulty: "hard" },
  { id: "woodpecker_pecking", answer: "Woodpecker Pecking", category: "animals", difficulty: "hard" },
  { id: "vacuum_cleaner", answer: "Vacuum Cleaner", category: "machines", difficulty: "easy" },
  { id: "hair_dryer", answer: "Hair Dryer", category: "machines", difficulty: "easy" },
  { id: "electric_drill", answer: "Electric Drill", category: "machines", difficulty: "medium" },
  { id: "washing_machine", answer: "Washing Machine", category: "machines", difficulty: "medium" },
  { id: "coffee_grinder", answer: "Coffee Grinder", category: "machines", difficulty: "medium" },
  { id: "printer_jamming", answer: "Printer Jamming", category: "machines", difficulty: "hard" },
  { id: "robot_starting", answer: "Robot Starting", category: "machines", difficulty: "hard" },
  { id: "arcade_machine", answer: "Arcade Machine", category: "machines", difficulty: "hard" },
  { id: "doorbell", answer: "Doorbell", category: "household", difficulty: "easy" },
  { id: "alarm_clock", answer: "Alarm Clock", category: "household", difficulty: "easy" },
  { id: "microwave_beeping", answer: "Microwave Beeping", category: "household", difficulty: "easy" },
  { id: "popcorn_popping", answer: "Popcorn Popping", category: "household", difficulty: "medium" },
  { id: "leaky_faucet", answer: "Leaky Faucet", category: "household", difficulty: "medium" },
  { id: "creaky_door", answer: "Creaky Door", category: "household", difficulty: "medium" },
  { id: "zipper_closing", answer: "Zipper Closing", category: "household", difficulty: "hard" },
  { id: "soda_can_opening", answer: "Soda Can Opening", category: "household", difficulty: "hard" },
  { id: "baby_crying", answer: "Baby Crying", category: "people", difficulty: "easy" },
  { id: "someone_snoring", answer: "Someone Snoring", category: "people", difficulty: "easy" },
  { id: "crowd_cheering", answer: "Crowd Cheering", category: "people", difficulty: "easy" },
  { id: "evil_laugh", answer: "Evil Laugh", category: "people", difficulty: "medium" },
  { id: "opera_singer", answer: "Opera Singer", category: "people", difficulty: "medium" },
  { id: "beatboxer", answer: "Beatboxer", category: "people", difficulty: "medium" },
  { id: "auctioneer", answer: "Auctioneer", category: "people", difficulty: "hard" },
  { id: "superhero_landing", answer: "Superhero Landing", category: "people", difficulty: "hard" },
  { id: "thunderstorm", answer: "Thunderstorm", category: "nature", difficulty: "easy" },
  { id: "ocean_waves", answer: "Ocean Waves", category: "nature", difficulty: "easy" },
  { id: "strong_wind", answer: "Strong Wind", category: "nature", difficulty: "easy" },
  { id: "campfire_crackling", answer: "Campfire Crackling", category: "nature", difficulty: "medium" },
  { id: "rain_on_window", answer: "Rain on a Window", category: "nature", difficulty: "medium" },
  { id: "avalanche", answer: "Avalanche", category: "nature", difficulty: "medium" },
  { id: "geyser_erupting", answer: "Geyser Erupting", category: "nature", difficulty: "hard" },
  { id: "ice_cracking", answer: "Ice Cracking", category: "nature", difficulty: "hard" },
  { id: "haunted_house", answer: "Haunted House", category: "situations", difficulty: "easy" },
  { id: "football_match", answer: "Football Match", category: "situations", difficulty: "easy" },
  { id: "fireworks_show", answer: "Fireworks Show", category: "situations", difficulty: "easy" },
  { id: "busy_restaurant", answer: "Busy Restaurant", category: "situations", difficulty: "medium" },
  { id: "video_game_battle", answer: "Video Game Battle", category: "situations", difficulty: "medium" },
  { id: "alien_invasion", answer: "Alien Invasion", category: "situations", difficulty: "medium" },
  { id: "spy_chase", answer: "Spy Chase", category: "situations", difficulty: "hard" },
  { id: "time_machine", answer: "Time Machine", category: "situations", difficulty: "hard" },
  { id: "drum_solo", answer: "Drum Solo", category: "music", difficulty: "easy" },
  { id: "electric_guitar", answer: "Electric Guitar", category: "music", difficulty: "easy" },
  { id: "trumpet_fanfare", answer: "Trumpet Fanfare", category: "music", difficulty: "medium" },
  { id: "dj_scratching", answer: "DJ Scratching", category: "music", difficulty: "medium" },
  { id: "music_box", answer: "Music Box", category: "music", difficulty: "medium" },
  { id: "orchestra_tuning", answer: "Orchestra Tuning", category: "music", difficulty: "hard" },
  { id: "broken_piano", answer: "Broken Piano", category: "music", difficulty: "hard" },
  { id: "marching_band", answer: "Marching Band", category: "music", difficulty: "hard" },
  { id: "race_car", answer: "Race Car", category: "transport", difficulty: "easy" },
  { id: "train_arriving", answer: "Train Arriving", category: "transport", difficulty: "easy" },
  { id: "helicopter", answer: "Helicopter", category: "transport", difficulty: "easy" },
  { id: "bicycle_bell", answer: "Bicycle Bell", category: "transport", difficulty: "medium" },
  { id: "ship_horn", answer: "Ship Horn", category: "transport", difficulty: "medium" },
  { id: "subway_doors", answer: "Subway Doors", category: "transport", difficulty: "medium" },
  { id: "rocket_launch", answer: "Rocket Launch", category: "transport", difficulty: "hard" },
  { id: "horse_carriage", answer: "Horse Carriage", category: "transport", difficulty: "hard" },
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

export function createSoundCheckPack(
  setupInput: SoundCheckSetupInput,
  promptIds: readonly string[],
  source: SoundCheckPack["source"],
): SoundCheckPack {
  const setup = soundCheckSetupSchema.parse(setupInput);
  if (promptIds.length !== setup.promptCount)
    throw new Error(`SoundCheck requires exactly ${setup.promptCount} prompts.`);
  if (new Set(promptIds).size !== promptIds.length) throw new Error("SoundCheck cannot contain duplicate prompts.");
  const byId = new Map(soundCheckCatalog.map((prompt) => [prompt.id, prompt]));
  const prompts = promptIds.map((id) => {
    const prompt = byId.get(id);
    if (!prompt) throw new Error(`Unknown SoundCheck prompt id: ${id}`);
    return prompt;
  });
  return soundCheckPackSchema.parse({
    schemaVersion: 1,
    game: "sound_check",
    source,
    themeId: setup.themeId,
    ...(setup.preferences ? { preferences: setup.preferences } : {}),
    teams: setup.teams.map((team, index) => ({ id: `team_${index + 1}`, ...team })),
    prompts,
  });
}

export function createRandomSoundCheckPack(setupInput: SoundCheckSetupInput, seed: string): SoundCheckPack {
  const setup = soundCheckSetupSchema.parse(setupInput);
  return createSoundCheckPack(
    setup,
    deterministicShuffle(soundCheckCatalog, seed)
      .slice(0, setup.promptCount)
      .map((prompt) => prompt.id),
    "random",
  );
}

export function createSoundCheckSpec(packInput: SoundCheckPack): ComposedGameSpec {
  const pack = soundCheckPackSchema.parse(packInput);
  const rounds = pack.prompts.length;
  const theme: ComposedTheme = pack.themeId;
  const suffix = numberHash(
    `sound-check-v1:${pack.themeId}:${pack.prompts.map((prompt) => prompt.id).join(":")}`,
  ).toString(36);
  const resolveEffects = [
    { kind: "discard_selected_card" as const, deckId: "sounds", target: "active_player" as const },
    { kind: "advance_round" as const, resetPhaseActions: true },
    { kind: "set_active_player" as const, mode: "next_team_captain" as const },
    { kind: "advance_phase" as const },
  ];
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `sound_check_${suffix}`.slice(0, 48),
    template: "composed",
    title: "SoundCheck",
    description: pack.preferences
      ? `A voice-only sound showdown tailored around ${pack.preferences}.`
      : "Imitate the secret sound with your voice while every other player races to identify it.",
    theme,
    minPlayers: pack.teams.length,
    maxPlayers: 12,
    suggestedDurationMinutes: Math.max(10, Math.ceil(rounds * 1.1)),
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
      startingPhaseId: "select_performer",
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
        id: "sounds",
        name: "Sound prompts",
        visibility: "private",
        shuffle: true,
        initialHandSize: 0,
        cards: pack.prompts.map((prompt) => ({
          id: prompt.id,
          title: prompt.answer,
          body: `${prompt.category} · ${prompt.difficulty}`,
          icon: "◖",
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
        title: { kind: "literal", value: "SoundCheck" },
        description: { kind: "literal", value: "One voice. One secret sound. The whole room is listening." },
        icon: "◖",
      },
      { id: "sound_deck", kind: "deck", audience: "active_player", deckId: "sounds", label: "Secret sound" },
      {
        id: "secret_sound",
        kind: "prompt",
        audience: "active_player",
        category: "Imitate this sound",
        prompt: { kind: "active_card", deckId: "sounds", field: "title" },
        hint: { kind: "active_card", deckId: "sounds", field: "body" },
        icon: "◖",
      },
      {
        id: "guess_input",
        kind: "text_input",
        audience: "public",
        label: "Name the sound",
        placeholder: "Type your guess…",
        multiline: false,
        maxLength: 48,
      },
      { id: "sound_timer", kind: "timer", audience: "public", seconds: 60, label: "Performance time" },
      { id: "turn", kind: "turn", audience: "public" },
      { id: "round", kind: "round", audience: "public", label: "Track" },
      { id: "teams", kind: "teams", audience: "public" },
      { id: "scores", kind: "scores", audience: "public", title: "Team score" },
      {
        id: "outcome",
        kind: "outcome",
        audience: "public",
        title: { kind: "literal", value: "Final mix" },
        description: { kind: "literal", value: "The team with the most correct guesses wins SoundCheck." },
      },
    ],
    actions: [
      {
        id: "select_performer",
        label: "Choose the performer",
        kind: "select_player",
        actor: "team_captain",
        oncePerPhase: true,
        effects: [{ kind: "set_active_player", mode: "selected" }, { kind: "advance_phase" }],
      },
      {
        id: "draw_sound",
        label: "Reveal my sound",
        kind: "draw",
        actor: "active_player",
        oncePerPhase: true,
        deckId: "sounds",
        effects: [{ kind: "draw_cards", deckId: "sounds", count: 1, target: "actor" }, { kind: "advance_phase" }],
      },
      {
        id: "pass_sound",
        label: "Pass sound",
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
        answerDeckId: "sounds",
        effects: [],
      },
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
        trigger: { kind: "after_action", actionId: "pass_sound" },
        conditionMode: "all",
        conditions: [{ kind: "round_at_least", round: rounds + 1 }],
        effects: [{ kind: "end_game", winnerBy: "highest_score" }],
      },
    ],
    phases: [
      {
        id: "select_performer",
        title: "The captain chooses",
        componentIds: ["game_header", "round", "turn", "teams", "scores"],
        actionIds: ["select_performer"],
        nextPhaseId: "draw_sound",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "draw_sound",
        title: "Secret sound",
        componentIds: ["game_header", "round", "turn", "teams", "scores", "sound_deck"],
        actionIds: ["draw_sound"],
        nextPhaseId: "performing",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "performing",
        title: "Live performance",
        componentIds: ["game_header", "round", "turn", "teams", "scores", "sound_timer", "secret_sound", "guess_input"],
        actionIds: ["pass_sound", "submit_guess"],
        nextPhaseId: "select_performer",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new Error(
      `Invalid SoundCheck GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`,
    );
  return validation.spec;
}

export const defaultSoundCheckPack = createRandomSoundCheckPack(
  { themeId: "retro", promptCount: 18 },
  "boardforge-default-sound-check",
);
export const defaultSoundCheckSpec = createSoundCheckSpec(defaultSoundCheckPack);
