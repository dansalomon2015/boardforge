import { z } from "zod";
import { composedThemeIdSchema, validateComposedGameSpec, type ComposedGameSpec, type ComposedTheme } from "./composed";

export const storyMoodSchema = z.enum(["chaotic", "mystery", "fantasy", "spooky", "romantic", "family"]);
export const storyLengthSchema = z.enum(["mini", "quick", "full", "epic"]);

export const storyChainSetupSchema = z
  .object({
    themeId: composedThemeIdSchema.default("cozy"),
    mood: storyMoodSchema.default("chaotic"),
    length: storyLengthSchema.default("full"),
    preferences: z.string().trim().min(3).max(240).optional(),
  })
  .strict();

export const storyTwistSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(48),
    requiredWord: z
      .string()
      .trim()
      .regex(/^[A-Za-z]+(?:[ '-][A-Za-z]+)?$/)
      .min(2)
      .max(28),
    direction: z.string().trim().min(8).max(160),
  })
  .strict();

export const storyChainPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    game: z.literal("story_chain"),
    source: z.enum(["random", "ai"]),
    themeId: composedThemeIdSchema,
    mood: storyMoodSchema,
    length: storyLengthSchema,
    preferences: z.string().trim().min(3).max(240).optional(),
    title: z.string().trim().min(2).max(64),
    opening: z.string().trim().min(20).max(420),
    twists: z.array(storyTwistSchema).min(4).max(16),
  })
  .strict();

export type StoryMood = z.infer<typeof storyMoodSchema>;
export type StoryLength = z.infer<typeof storyLengthSchema>;
export type StoryChainSetupInput = z.input<typeof storyChainSetupSchema>;
export type StoryChainSetup = z.output<typeof storyChainSetupSchema>;
export type StoryTwist = z.infer<typeof storyTwistSchema>;
export type StoryChainPack = z.infer<typeof storyChainPackSchema>;

export const storyRounds: Record<StoryLength, number> = { mini: 4, quick: 8, full: 12, epic: 16 };

const openings: Record<StoryMood, { title: string; opening: string }> = {
  chaotic: {
    title: "The Night Everything Went Sideways",
    opening:
      "At precisely 8:17, every light in the city turned purple and the mayor's goldfish announced that it knew why.",
  },
  mystery: {
    title: "The Last Key at Bellweather House",
    opening:
      "The envelope had no stamp, no address, and only one sentence inside: return the key before the clock strikes thirteen.",
  },
  fantasy: {
    title: "The Map That Remembered",
    opening:
      "On the morning the mountains began to move, a young mapmaker discovered a road that had never existed before.",
  },
  spooky: {
    title: "Someone Knocked from Inside the Wall",
    opening:
      "The old house had been silent for fifty years, until three soft knocks answered from behind the freshly painted wall.",
  },
  romantic: {
    title: "Meet Me Where the Trains Forget",
    opening:
      "They had missed each other by seven minutes every Friday for a year, until one impossible note appeared on both their tickets.",
  },
  family: {
    title: "The Great Sunday Adventure",
    opening:
      "Grandma's famous pie vanished from the windowsill, leaving a trail of blue crumbs and one very suspicious garden gnome.",
  },
};

export const storyTwistCatalog: readonly StoryTwist[] = [
  { id: "umbrella", requiredWord: "umbrella", direction: "Introduce an object that should not be here." },
  { id: "whisper", requiredWord: "whisper", direction: "Let someone reveal a secret without saying it directly." },
  { id: "moon", requiredWord: "moon", direction: "Make the setting change in an unexpected way." },
  { id: "piano", requiredWord: "piano", direction: "Bring in a sound that changes the mood." },
  { id: "midnight", requiredWord: "midnight", direction: "Add a deadline the characters cannot ignore." },
  { id: "postcard", requiredWord: "postcard", direction: "Deliver news from somewhere impossible." },
  { id: "dragon", requiredWord: "dragon", direction: "Introduce a surprising ally or obstacle." },
  { id: "sandwich", requiredWord: "sandwich", direction: "Turn an ordinary object into crucial evidence." },
  { id: "mirror", requiredWord: "mirror", direction: "Make a character question what they just saw." },
  { id: "elevator", requiredWord: "elevator", direction: "Move everyone somewhere they did not choose." },
  { id: "glitter", requiredWord: "glitter", direction: "Leave behind a clue that is impossible to hide." },
  { id: "penguin", requiredWord: "penguin", direction: "Add a character nobody expected to meet." },
  { id: "promise", requiredWord: "promise", direction: "Force someone to choose between two loyalties." },
  { id: "storm", requiredWord: "storm", direction: "Raise the stakes with a sudden complication." },
  { id: "photograph", requiredWord: "photograph", direction: "Reveal that the past is not what it seemed." },
  { id: "suitcase", requiredWord: "suitcase", direction: "Give the group something valuable to protect." },
  { id: "robot", requiredWord: "robot", direction: "Let an unlikely helper solve the wrong problem." },
  { id: "candle", requiredWord: "candle", direction: "Narrow the scene to one vivid detail." },
  { id: "ticket", requiredWord: "ticket", direction: "Offer a way out with an inconvenient condition." },
  { id: "echo", requiredWord: "echo", direction: "Bring back something said earlier with a new meaning." },
  { id: "recipe", requiredWord: "recipe", direction: "Hide an instruction inside something ordinary." },
  { id: "bicycle", requiredWord: "bicycle", direction: "Start a chase using the least suitable transport." },
  { id: "crown", requiredWord: "crown", direction: "Shift who appears to hold the power." },
  { id: "window", requiredWord: "window", direction: "Show the characters something they cannot reach yet." },
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

export function createStoryChainPack(
  setupInput: StoryChainSetupInput,
  content: { title: string; opening: string; twists: readonly StoryTwist[] },
  source: StoryChainPack["source"],
): StoryChainPack {
  const setup = storyChainSetupSchema.parse(setupInput);
  const count = storyRounds[setup.length];
  if (content.twists.length !== count)
    throw new Error(`StoryChain requires exactly ${count} twists for a ${setup.length} story.`);
  const words = content.twists.map((twist) => twist.requiredWord.toLowerCase());
  if (new Set(words).size !== words.length) throw new Error("StoryChain cannot repeat a required word.");
  const normalize = (value: string) =>
    ` ${value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
  const publicPremise = normalize(`${content.title} ${content.opening}`);
  const leakedWord = content.twists.find((twist) =>
    publicPremise.includes(` ${normalize(twist.requiredWord).trim()} `),
  );
  if (leakedWord)
    throw new Error(`StoryChain required word “${leakedWord.requiredWord}” is already visible in the public premise.`);
  return storyChainPackSchema.parse({
    schemaVersion: 1,
    game: "story_chain",
    source,
    themeId: setup.themeId,
    mood: setup.mood,
    length: setup.length,
    ...(setup.preferences ? { preferences: setup.preferences } : {}),
    title: content.title,
    opening: content.opening,
    twists: content.twists,
  });
}

export function createRandomStoryChainPack(setupInput: StoryChainSetupInput, seed: string): StoryChainPack {
  const setup = storyChainSetupSchema.parse(setupInput);
  const base = openings[setup.mood];
  return createStoryChainPack(
    setup,
    {
      ...base,
      twists: deterministicShuffle(storyTwistCatalog, `${seed}:${setup.mood}`).slice(0, storyRounds[setup.length]),
    },
    "random",
  );
}

export function createStoryChainSpec(packInput: StoryChainPack): ComposedGameSpec {
  const pack = storyChainPackSchema.parse(packInput);
  const rounds = pack.twists.length;
  const theme: ComposedTheme = pack.themeId;
  const suffix = numberHash(`story-chain-v1:${pack.title}:${pack.twists.map((twist) => twist.id).join(":")}`).toString(
    36,
  );
  const resolveTurn = [
    { kind: "discard_selected_card" as const, deckId: "twists", target: "active_player" as const },
    { kind: "advance_round" as const, resetPhaseActions: true },
    { kind: "set_active_player" as const, mode: "next" as const },
    { kind: "advance_phase" as const },
  ];
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `story_chain_${suffix}`.slice(0, 48),
    template: "composed",
    experienceId: "story_chain",
    title: "StoryChain",
    description: pack.preferences
      ? `A shared story inspired by your idea: “${pack.preferences}”.`
      : "Build one unforgettable story together, one secret twist and one voice at a time.",
    theme,
    minPlayers: 2,
    maxPlayers: 12,
    suggestedDurationMinutes: Math.max(12, rounds * 2),
    setup: { mode: "cooperative", rounds, startingPhaseId: "draw_twist", startingPlayer: "random" },
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
        id: "twists",
        name: "Secret twists",
        visibility: "private",
        shuffle: true,
        initialHandSize: 0,
        cards: pack.twists.map((twist) => ({
          id: twist.id,
          title: twist.requiredWord,
          body: twist.direction,
          icon: "✦",
          tags: [pack.mood],
        })),
      },
    ],
    components: [
      {
        id: "game_header",
        kind: "header",
        audience: "public",
        eyebrow: "BoardForge Original",
        title: { kind: "literal", value: pack.title },
        description: {
          kind: "literal",
          value: "Write one or two sentences. Keep the story moving. Make your secret word feel inevitable.",
        },
        icon: "✦",
      },
      {
        id: "story",
        kind: "story",
        audience: "public",
        opening: { kind: "literal", value: pack.opening },
        actionId: "continue_story",
        label: "Our story",
      },
      { id: "twist_deck", kind: "deck", audience: "active_player", deckId: "twists", label: "Your secret twist" },
      {
        id: "secret_twist",
        kind: "prompt",
        audience: "active_player",
        category: "Your sentence must include",
        prompt: { kind: "active_card", deckId: "twists", field: "title" },
        hint: { kind: "active_card", deckId: "twists", field: "body" },
        icon: "✦",
      },
      {
        id: "story_input",
        kind: "text_input",
        audience: "active_player",
        label: "Continue the story",
        placeholder: "Write one or two sentences…",
        multiline: true,
        maxLength: 320,
      },
      { id: "turn", kind: "turn", audience: "public" },
      { id: "round", kind: "round", audience: "public", label: "Chapter" },
      {
        id: "outcome",
        kind: "outcome",
        audience: "public",
        title: { kind: "literal", value: "The end — for now" },
        description: {
          kind: "literal",
          value: "Read your one-of-a-kind story aloud, from the very first line to the final twist.",
        },
      },
    ],
    actions: [
      {
        id: "draw_twist",
        label: "Reveal my secret twist",
        kind: "draw",
        actor: "active_player",
        oncePerPhase: true,
        deckId: "twists",
        effects: [{ kind: "draw_cards", deckId: "twists", count: 1, target: "actor" }, { kind: "advance_phase" }],
      },
      {
        id: "continue_story",
        label: "Add to the story",
        kind: "text",
        actor: "active_player",
        oncePerPhase: true,
        requiredWordDeckId: "twists",
        effects: resolveTurn,
      },
    ],
    rules: [
      {
        id: "end_story",
        trigger: { kind: "after_action", actionId: "continue_story" },
        conditionMode: "all",
        conditions: [{ kind: "round_at_least", round: rounds + 1 }],
        effects: [{ kind: "end_game", winnerBy: "none" }],
      },
    ],
    phases: [
      {
        id: "draw_twist",
        title: "A new twist",
        componentIds: ["game_header", "story", "round", "turn", "twist_deck", "outcome"],
        actionIds: ["draw_twist"],
        nextPhaseId: "write",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
      {
        id: "write",
        title: "Continue the tale",
        componentIds: ["game_header", "story", "round", "turn", "secret_twist", "story_input", "outcome"],
        actionIds: ["continue_story"],
        nextPhaseId: "draw_twist",
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new Error(
      `Invalid StoryChain GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`,
    );
  return validation.spec;
}

export const defaultStoryChainPack = createRandomStoryChainPack(
  { themeId: "cozy", mood: "chaotic", length: "full" },
  "boardforge-default-story-chain",
);
export const defaultStoryChainSpec = createStoryChainSpec(defaultStoryChainPack);
