import { z } from "zod";

const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/).max(48);
const shortTextSchema = z.string().trim().min(1).max(180);
const longTextSchema = z.string().trim().min(1).max(600);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const composedThemeIdSchema = z.enum([
  "arcade", "tropical", "mystery", "cosmic", "western", "medieval", "cyberpunk", "enchanted",
  "pirate", "spooky", "retro", "disco", "noir", "candy", "nature", "ocean", "laboratory",
  "royal", "cozy", "minimal",
]);

const customThemeSchema = z
  .object({
    id: z.literal("custom"),
    name: z.string().trim().min(2).max(40),
    radius: z.enum(["soft", "round", "sharp"]),
    colors: z
      .object({
        background: hexColorSchema,
        surface: hexColorSchema,
        surfaceAlt: hexColorSchema,
        text: hexColorSchema,
        muted: hexColorSchema,
        primary: hexColorSchema,
        secondary: hexColorSchema,
        accent: hexColorSchema,
        border: hexColorSchema,
      })
      .strict(),
  })
  .strict();

export const composedThemeSchema = z.union([composedThemeIdSchema, customThemeSchema]);

const audienceSchema = z.enum(["public", "host", "active_player", "team"]);
const ownerSchema = z.enum(["global", "actor", "active_player", "actor_team"]);
const teamSlotDefinitionSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(2).max(32),
    color: hexColorSchema,
  })
  .strict();

const textSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: longTextSchema }).strict(),
  z.object({ kind: z.literal("variable"), variableId: idSchema }).strict(),
  z.object({ kind: z.literal("active_card"), deckId: idSchema, field: z.enum(["title", "body"]) }).strict(),
  z.object({ kind: z.literal("last_input"), actionId: idSchema }).strict(),
]);

const componentBase = {
  id: idSchema,
  audience: audienceSchema.default("public"),
};

export const composedComponentSchema = z.discriminatedUnion("kind", [
  z.object({ ...componentBase, kind: z.literal("header"), eyebrow: shortTextSchema.optional(), title: textSourceSchema, description: textSourceSchema.optional(), icon: z.string().max(8).optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("prompt"), category: shortTextSchema.optional(), prompt: textSourceSchema, hint: textSourceSchema.optional(), icon: z.string().max(8).optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("deck"), deckId: idSchema, label: shortTextSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("choices"), title: shortTextSchema.optional(), optionIds: z.array(idSchema).min(2).max(12), columns: z.number().int().min(1).max(3).default(2) }).strict(),
  z.object({ ...componentBase, kind: z.literal("text_input"), label: shortTextSchema, placeholder: shortTextSchema.optional(), multiline: z.boolean().default(false), maxLength: z.number().int().min(1).max(600).default(180) }).strict(),
  z.object({ ...componentBase, kind: z.literal("drawing"), label: shortTextSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("timer"), seconds: z.number().int().min(5).max(900), label: shortTextSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("turn") }).strict(),
  z.object({ ...componentBase, kind: z.literal("round"), label: shortTextSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("teams") }).strict(),
  z.object({ ...componentBase, kind: z.literal("players") }).strict(),
  z.object({ ...componentBase, kind: z.literal("scores"), title: shortTextSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("clues"), title: shortTextSchema.optional(), clueIds: z.array(idSchema).min(1).max(12) }).strict(),
  z.object({ ...componentBase, kind: z.literal("challenge"), title: textSourceSchema, instruction: textSourceSchema, difficulty: z.enum(["easy", "medium", "hard"]).default("medium"), rewardLabel: shortTextSchema.optional(), icon: z.string().max(8).optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("reveal"), revealId: idSchema }).strict(),
  z.object({ ...componentBase, kind: z.literal("outcome"), title: textSourceSchema, description: textSourceSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("board"), boardId: idSchema }).strict(),
  z.object({ ...componentBase, kind: z.literal("card_zone"), deckId: idSchema, zone: z.enum(["hand", "draw", "discard", "table"]) }).strict(),
  z.object({ ...componentBase, kind: z.literal("resources"), resourceIds: z.array(idSchema).min(1).max(12) }).strict(),
  z.object({ ...componentBase, kind: z.literal("randomizer"), randomizerId: idSchema }).strict(),
  z.object({ ...componentBase, kind: z.literal("buzzer"), label: shortTextSchema.default("Buzzer") }).strict(),
  z.object({ ...componentBase, kind: z.literal("ordering"), itemIds: z.array(idSchema).min(2).max(16) }).strict(),
  z.object({ ...componentBase, kind: z.literal("matching"), itemIds: z.array(idSchema).min(4).max(24) }).strict(),
  z.object({ ...componentBase, kind: z.literal("media"), mediaId: idSchema }).strict(),
  z.object({ ...componentBase, kind: z.literal("story"), opening: textSourceSchema, actionId: idSchema, label: shortTextSchema.optional() }).strict(),
  z.object({ ...componentBase, kind: z.literal("word_duel"), minLength: z.number().int().min(3).max(12), maxLength: z.number().int().min(4).max(16) }).strict(),
]);

const choiceSchema = z.object({ id: idSchema, label: shortTextSchema, description: shortTextSchema.optional(), icon: z.string().max(8).optional(), correct: z.boolean().optional() }).strict();
const clueSchema = z.object({ id: idSchema, text: shortTextSchema }).strict();
const revealSchema = z.object({ id: idSchema, title: shortTextSchema, description: longTextSchema.optional(), icon: z.string().max(8).optional() }).strict();
const orderingItemSchema = z.object({ id: idSchema, label: shortTextSchema, rank: z.number().int().min(0).max(100) }).strict();
const matchingItemSchema = z.object({ id: idSchema, label: shortTextSchema, pairId: idSchema }).strict();

export const deckDefinitionSchema = z
  .object({
    id: idSchema,
    name: shortTextSchema,
    visibility: z.enum(["public", "private"]),
    shuffle: z.boolean().default(true),
    initialHandSize: z.number().int().min(0).max(12).default(0),
    cards: z
      .array(z.object({ id: idSchema, title: shortTextSchema, body: longTextSchema.optional(), icon: z.string().max(8).optional(), tags: z.array(idSchema).max(8).default([]) }).strict())
      .min(1)
      .max(120),
  })
  .strict();

export const boardDefinitionSchema = z
  .object({
    id: idSchema,
    name: shortTextSchema,
    layout: z.enum(["track", "grid", "zones"]),
    spaces: z.array(z.object({ id: idSchema, label: shortTextSchema, x: z.number().int().min(0).max(20).optional(), y: z.number().int().min(0).max(20).optional() }).strict()).min(2).max(100),
    tokens: z.array(z.object({ id: idSchema, label: shortTextSchema, owner: z.enum(["global", "player", "team"]), startSpaceId: idSchema }).strict()).max(24),
  })
  .strict();

export const resourceDefinitionSchema = z
  .object({ id: idSchema, name: shortTextSchema, icon: z.string().max(8).optional(), scope: z.enum(["global", "player", "team"]), initialValue: z.number().int().min(-1000).max(1000), min: z.number().int().min(-1000).max(1000), max: z.number().int().min(-1000).max(1000) })
  .strict();

export const randomizerDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({ id: idSchema, kind: z.literal("die"), label: shortTextSchema, sides: z.number().int().min(2).max(100) }).strict(),
  z.object({ id: idSchema, kind: z.literal("spinner"), label: shortTextSchema, options: z.array(choiceSchema).min(2).max(20) }).strict(),
]);

const mediaDefinitionSchema = z
  .object({ id: idSchema, kind: z.enum(["image", "audio", "video"]), title: shortTextSchema, url: z.string().url().max(500).refine((value) => value.startsWith("https://"), "Media URLs must use HTTPS."), alt: shortTextSchema })
  .strict();

export const atomicConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }).strict(),
  z.object({ kind: z.literal("action_count"), actionId: idSchema, count: z.number().int().min(1).max(100), scope: z.enum(["phase", "round", "game"]).default("phase") }).strict(),
  z.object({ kind: z.literal("all_players_acted"), actionId: idSchema }).strict(),
  z.object({ kind: z.literal("score_at_least"), owner: z.enum(["any_player", "any_team", "global"]), amount: z.number().int().min(-1000).max(1000) }).strict(),
  z.object({ kind: z.literal("resource_at_least"), resourceId: idSchema, owner: z.enum(["any", "global"]), amount: z.number().int().min(-1000).max(1000) }).strict(),
  z.object({ kind: z.literal("deck_empty"), deckId: idSchema }).strict(),
  z.object({ kind: z.literal("round_at_least"), round: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal("variable_equals"), variableId: idSchema, value: z.union([z.string().max(180), z.number(), z.boolean()]) }).strict(),
  z.object({ kind: z.literal("last_input_correct"), actionId: idSchema }).strict(),
]);

export const effectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_score"), target: ownerSchema, amount: z.number().int().min(-100).max(100) }).strict(),
  z.object({ kind: z.literal("add_resource"), resourceId: idSchema, target: ownerSchema, amount: z.number().int().min(-100).max(100) }).strict(),
  z.object({ kind: z.literal("set_variable"), variableId: idSchema, value: z.union([z.string().max(180), z.number(), z.boolean()]) }).strict(),
  z.object({ kind: z.literal("record_input"), channelId: idSchema }).strict(),
  z.object({ kind: z.literal("register_secret_word"), wordDuelId: idSchema }).strict(),
  z.object({ kind: z.literal("guess_letter"), wordDuelId: idSchema }).strict(),
  z.object({ kind: z.literal("guess_word"), wordDuelId: idSchema }).strict(),
  z.object({ kind: z.literal("draw_cards"), deckId: idSchema, count: z.number().int().min(1).max(12), target: z.enum(["actor", "active_player"]) }).strict(),
  z.object({ kind: z.literal("discard_selected_card"), deckId: idSchema, target: z.enum(["actor", "active_player"]).default("actor") }).strict(),
  z.object({ kind: z.literal("move_selected_token"), boardId: idSchema }).strict(),
  z.object({ kind: z.literal("reveal"), revealId: idSchema }).strict(),
  z.object({ kind: z.literal("randomize"), randomizerId: idSchema }).strict(),
  z.object({ kind: z.literal("shuffle_deck"), deckId: idSchema }).strict(),
  z.object({ kind: z.literal("set_active_player"), mode: z.enum(["next", "actor", "selected", "next_team_captain"]) }).strict(),
  z.object({ kind: z.literal("advance_phase") }).strict(),
  z.object({ kind: z.literal("advance_round"), resetPhaseActions: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal("end_game"), winnerBy: z.enum(["highest_score", "actor", "actor_team", "none"]) }).strict(),
]);

export const actionDefinitionSchema = z
  .object({
    id: idSchema,
    label: shortTextSchema,
    kind: z.enum(["advance", "choose", "text", "draw", "play_card", "move", "resource", "randomize", "buzz", "order", "match", "complete_challenge", "select_player", "sketch", "secret_word", "letter_guess", "word_guess"]),
    actor: z.enum(["host", "active_player", "any_player", "all_players", "team", "team_captain", "opponents", "guessers"]),
    oncePerPhase: z.boolean().default(false),
    optionIds: z.array(idSchema).min(2).max(12).optional(),
    itemIds: z.array(idSchema).min(2).max(24).optional(),
    deckId: idSchema.optional(),
    boardId: idSchema.optional(),
    randomizerId: idSchema.optional(),
    answerDeckId: idSchema.optional(),
    requiredWordDeckId: idSchema.optional(),
    wordDuelId: idSchema.optional(),
    effects: z.array(effectSchema).max(12).default([]),
  })
  .strict();

export const ruleDefinitionSchema = z
  .object({
    id: idSchema,
    trigger: z.object({ kind: z.literal("after_action"), actionId: idSchema }).strict(),
    conditionMode: z.enum(["all", "any"]).default("all"),
    conditions: z.array(atomicConditionSchema).max(8).default([]),
    effects: z.array(effectSchema).min(1).max(12),
  })
  .strict();

export const phaseDefinitionSchema = z
  .object({
    id: idSchema,
    title: shortTextSchema,
    componentIds: z.array(idSchema).min(1).max(24),
    actionIds: z.array(idSchema).max(16),
    nextPhaseId: idSchema.optional(),
    completionMode: z.enum(["manual", "all", "any"]).default("manual"),
    completionConditions: z.array(atomicConditionSchema).max(8).default([]),
    onComplete: z.array(effectSchema).max(12).default([]),
  })
  .strict();

export const composedGameSpecSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: idSchema,
    template: z.literal("composed"),
    title: z.string().trim().min(2).max(64),
    description: z.string().trim().min(8).max(280),
    theme: composedThemeSchema,
    minPlayers: z.number().int().min(1).max(20),
    maxPlayers: z.number().int().min(1).max(20),
    suggestedDurationMinutes: z.number().int().min(2).max(180).optional(),
    setup: z
      .object({
        mode: z.enum(["individual", "teams", "cooperative"]),
        teamPolicy: z
          .object({
            teams: z.array(teamSlotDefinitionSchema).min(2).max(6),
            minMembersPerTeam: z.number().int().min(1).max(10).default(1),
            maxMembersPerTeam: z.number().int().min(1).max(20).optional(),
            allocation: z.enum(["balanced", "random"]).default("balanced"),
            allowUnevenTeams: z.boolean().default(true),
            rotateActivePlayer: z.boolean().default(true),
          })
          .strict()
          .optional(),
        rounds: z.number().int().min(1).max(50),
        startingPhaseId: idSchema,
        startingPlayer: z.enum(["first", "random"]).default("random"),
      })
      .strict(),
    variables: z.array(z.object({ id: idSchema, initialValue: z.union([z.string().max(180), z.number(), z.boolean()]) }).strict()).max(24).default([]),
    choices: z.array(choiceSchema).max(60).default([]),
    clues: z.array(clueSchema).max(40).default([]),
    reveals: z.array(revealSchema).max(30).default([]),
    orderingItems: z.array(orderingItemSchema).max(40).default([]),
    matchingItems: z.array(matchingItemSchema).max(48).default([]),
    decks: z.array(deckDefinitionSchema).max(12).default([]),
    boards: z.array(boardDefinitionSchema).max(6).default([]),
    resources: z.array(resourceDefinitionSchema).max(20).default([]),
    randomizers: z.array(randomizerDefinitionSchema).max(12).default([]),
    media: z.array(mediaDefinitionSchema).max(24).default([]),
    components: z.array(composedComponentSchema).min(1).max(80),
    actions: z.array(actionDefinitionSchema).min(1).max(60),
    rules: z.array(ruleDefinitionSchema).max(60).default([]),
    phases: z.array(phaseDefinitionSchema).min(1).max(40),
  })
  .strict();

export type ComposedTheme = z.infer<typeof composedThemeSchema>;
export type ComposedComponent = z.infer<typeof composedComponentSchema>;
export type DeckDefinition = z.infer<typeof deckDefinitionSchema>;
export type BoardDefinition = z.infer<typeof boardDefinitionSchema>;
export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;
export type RandomizerDefinition = z.infer<typeof randomizerDefinitionSchema>;
export type AtomicCondition = z.infer<typeof atomicConditionSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;
export type PhaseDefinition = z.infer<typeof phaseDefinitionSchema>;
export type ComposedGameSpec = z.infer<typeof composedGameSpecSchema>;

export type ComposedValidationIssue = { code: string; path: string; message: string };
export type ComposedGameSpecValidation =
  | { ok: true; spec: ComposedGameSpec }
  | { ok: false; issues: ComposedValidationIssue[] };

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.size === seen.add(value).size))];
}

function semanticIssues(spec: ComposedGameSpec): ComposedValidationIssue[] {
  const issues: ComposedValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const collections: Array<[string, Array<{ id: string }>]> = [
    ["variables", spec.variables], ["choices", spec.choices], ["clues", spec.clues], ["reveals", spec.reveals],
    ["orderingItems", spec.orderingItems], ["matchingItems", spec.matchingItems], ["decks", spec.decks],
    ["boards", spec.boards], ["resources", spec.resources], ["randomizers", spec.randomizers], ["media", spec.media],
    ["components", spec.components], ["actions", spec.actions], ["rules", spec.rules], ["phases", spec.phases],
  ];
  for (const [path, values] of collections) {
    for (const id of duplicates(values.map((value) => value.id))) add("DUPLICATE_ID", path, `Duplicate ${path} id: ${id}.`);
  }

  if (spec.minPlayers > spec.maxPlayers) add("PLAYER_RANGE_INVALID", "minPlayers", "minPlayers must not exceed maxPlayers.");
  const teamPolicy = spec.setup.teamPolicy;
  if (spec.setup.mode === "teams" && !teamPolicy) add("TEAM_POLICY_REQUIRED", "setup.teamPolicy", "Team games require a teamPolicy.");
  if (spec.setup.mode !== "teams" && teamPolicy) add("TEAM_POLICY_NOT_ALLOWED", "setup.teamPolicy", "Only team games may define a teamPolicy.");
  if (teamPolicy) {
    const teamCount = teamPolicy.teams.length;
    const minimumRequired = teamCount * teamPolicy.minMembersPerTeam;
    for (const id of duplicates(teamPolicy.teams.map((team) => team.id))) add("DUPLICATE_TEAM_ID", "setup.teamPolicy.teams", `Duplicate team id: ${id}.`);
    if (spec.minPlayers < minimumRequired) add("TEAM_MINIMUM_INVALID", "minPlayers", `At least ${minimumRequired} players are required to populate every team.`);
    if (teamPolicy.maxMembersPerTeam && teamPolicy.maxMembersPerTeam < teamPolicy.minMembersPerTeam) add("TEAM_MEMBER_RANGE_INVALID", "setup.teamPolicy.maxMembersPerTeam", "maxMembersPerTeam must not be lower than minMembersPerTeam.");
    if (teamPolicy.maxMembersPerTeam && spec.maxPlayers > teamCount * teamPolicy.maxMembersPerTeam) add("TEAM_CAPACITY_INVALID", "maxPlayers", "maxPlayers exceeds the configured team capacity.");
    if (!teamPolicy.allowUnevenTeams && spec.minPlayers === spec.maxPlayers && spec.minPlayers % teamCount !== 0) add("UNEQUAL_TEAMS_FORBIDDEN", "setup.teamPolicy.allowUnevenTeams", "The fixed player count cannot be divided into equal teams.");
  }

  const ids = (values: Array<{ id: string }>) => new Set(values.map((value) => value.id));
  const phaseIds = ids(spec.phases);
  const componentIds = ids(spec.components);
  const actionIds = ids(spec.actions);
  const deckIds = ids(spec.decks);
  const deckById = new Map(spec.decks.map((deck) => [deck.id, deck]));
  const boardIds = ids(spec.boards);
  const resourceIds = ids(spec.resources);
  const randomizerIds = ids(spec.randomizers);
  const revealIds = ids(spec.reveals);
  const choiceIds = ids(spec.choices);
  const clueIds = ids(spec.clues);
  const orderingIds = ids(spec.orderingItems);
  const matchingIds = ids(spec.matchingItems);
  const mediaIds = ids(spec.media);
  const variableIds = ids(spec.variables);
  const componentById = new Map(spec.components.map((component) => [component.id, component]));
  const wordDuelIds = new Set(spec.components.filter((component) => component.kind === "word_duel").map((component) => component.id));
  const actionById = new Map(spec.actions.map((action) => [action.id, action]));

  if (!phaseIds.has(spec.setup.startingPhaseId)) add("UNKNOWN_PHASE", "setup.startingPhaseId", "Starting phase does not exist.");

  const checkEffect = (effect: Effect, path: string) => {
    if ((effect.kind === "draw_cards" || effect.kind === "discard_selected_card" || effect.kind === "shuffle_deck") && !deckIds.has(effect.deckId)) add("UNKNOWN_DECK", path, `Unknown deck: ${effect.deckId}.`);
    if (effect.kind === "move_selected_token" && !boardIds.has(effect.boardId)) add("UNKNOWN_BOARD", path, `Unknown board: ${effect.boardId}.`);
    if (effect.kind === "add_resource" && !resourceIds.has(effect.resourceId)) add("UNKNOWN_RESOURCE", path, `Unknown resource: ${effect.resourceId}.`);
    if (effect.kind === "randomize" && !randomizerIds.has(effect.randomizerId)) add("UNKNOWN_RANDOMIZER", path, `Unknown randomizer: ${effect.randomizerId}.`);
    if (effect.kind === "reveal" && !revealIds.has(effect.revealId) && !clueIds.has(effect.revealId)) add("UNKNOWN_REVEAL", path, `Unknown reveal or clue: ${effect.revealId}.`);
    if (effect.kind === "set_variable" && !variableIds.has(effect.variableId)) add("UNKNOWN_VARIABLE", path, `Unknown variable: ${effect.variableId}.`);
    if ((effect.kind === "register_secret_word" || effect.kind === "guess_letter" || effect.kind === "guess_word") && !wordDuelIds.has(effect.wordDuelId)) add("UNKNOWN_WORD_DUEL", path, `Unknown word duel: ${effect.wordDuelId}.`);
  };

  spec.decks.forEach((deck, index) => {
    if (deck.initialHandSize * spec.maxPlayers > deck.cards.length) add("INSUFFICIENT_CARDS", `decks.${index}.initialHandSize`, "Deck cannot deal the requested private hands at maxPlayers.");
    for (const id of duplicates(deck.cards.map((card) => card.id))) add("DUPLICATE_CARD_ID", `decks.${index}.cards`, `Duplicate card id: ${id}.`);
  });
  spec.boards.forEach((board, index) => {
    const spaceIds = ids(board.spaces);
    for (const token of board.tokens) if (!spaceIds.has(token.startSpaceId)) add("UNKNOWN_SPACE", `boards.${index}.tokens`, `Unknown start space: ${token.startSpaceId}.`);
  });
  spec.resources.forEach((resource, index) => {
    if (resource.min > resource.max || resource.initialValue < resource.min || resource.initialValue > resource.max) add("RESOURCE_RANGE_INVALID", `resources.${index}`, "Resource initialValue must be within min and max.");
  });

  spec.components.forEach((component, index) => {
    const path = `components.${index}`;
    if ((component.kind === "deck" || component.kind === "card_zone") && !deckIds.has(component.deckId)) add("UNKNOWN_DECK", path, `Unknown deck: ${component.deckId}.`);
    if (component.kind === "board" && !boardIds.has(component.boardId)) add("UNKNOWN_BOARD", path, `Unknown board: ${component.boardId}.`);
    if (component.kind === "resources") for (const id of component.resourceIds) if (!resourceIds.has(id)) add("UNKNOWN_RESOURCE", path, `Unknown resource: ${id}.`);
    if (component.kind === "randomizer" && !randomizerIds.has(component.randomizerId)) add("UNKNOWN_RANDOMIZER", path, `Unknown randomizer: ${component.randomizerId}.`);
    if (component.kind === "reveal" && !revealIds.has(component.revealId)) add("UNKNOWN_REVEAL", path, `Unknown reveal: ${component.revealId}.`);
    if (component.kind === "choices") for (const id of component.optionIds) if (!choiceIds.has(id)) add("UNKNOWN_CHOICE", path, `Unknown choice: ${id}.`);
    if (component.kind === "clues") for (const id of component.clueIds) if (!clueIds.has(id)) add("UNKNOWN_CLUE", path, `Unknown clue: ${id}.`);
    if (component.kind === "ordering") for (const id of component.itemIds) if (!orderingIds.has(id)) add("UNKNOWN_ORDERING_ITEM", path, `Unknown ordering item: ${id}.`);
    if (component.kind === "matching") for (const id of component.itemIds) if (!matchingIds.has(id)) add("UNKNOWN_MATCHING_ITEM", path, `Unknown matching item: ${id}.`);
    if (component.kind === "media" && !mediaIds.has(component.mediaId)) add("UNKNOWN_MEDIA", path, `Unknown media: ${component.mediaId}.`);
    if (component.kind === "story" && !actionIds.has(component.actionId)) add("UNKNOWN_ACTION", path, `Unknown story action: ${component.actionId}.`);
    if (component.kind === "word_duel" && component.minLength > component.maxLength) add("WORD_DUEL_LENGTH_INVALID", path, "Word duel minLength must not exceed maxLength.");
  });

  spec.actions.forEach((action, index) => {
    const path = `actions.${index}`;
    if (["team", "team_captain", "opponents", "guessers"].includes(action.actor) && spec.setup.mode !== "teams") add("TEAM_ACTOR_REQUIRES_TEAMS", path, `Actor ${action.actor} requires team mode.`);
    if (action.kind === "choose" && (!action.optionIds || action.optionIds.some((id) => !choiceIds.has(id)))) add("ACTION_OPTIONS_INVALID", path, "Choose actions require known optionIds.");
    if ((action.kind === "draw" || action.kind === "play_card") && (!action.deckId || !deckIds.has(action.deckId))) add("ACTION_DECK_INVALID", path, "Card actions require a known deckId.");
    if (action.kind === "move" && (!action.boardId || !boardIds.has(action.boardId))) add("ACTION_BOARD_INVALID", path, "Move actions require a known boardId.");
    if (action.kind === "randomize" && (!action.randomizerId || !randomizerIds.has(action.randomizerId))) add("ACTION_RANDOMIZER_INVALID", path, "Randomize actions require a known randomizerId.");
    if (action.kind === "order" && (!action.itemIds || action.itemIds.some((id) => !orderingIds.has(id)))) add("ACTION_ORDERING_INVALID", path, "Order actions require known ordering itemIds.");
    if (action.kind === "match" && (!action.itemIds || action.itemIds.some((id) => !matchingIds.has(id)))) add("ACTION_MATCHING_INVALID", path, "Match actions require known matching itemIds.");
    if (action.answerDeckId && (action.kind !== "text" || !deckIds.has(action.answerDeckId))) add("ACTION_ANSWER_DECK_INVALID", path, "answerDeckId is only valid for text actions and must reference a known deck.");
    if (action.answerDeckId && deckById.get(action.answerDeckId)?.visibility !== "private") add("ACTION_ANSWER_DECK_PUBLIC", path, "Text answer validation must reference a private deck.");
    if (action.requiredWordDeckId && (action.kind !== "text" || !deckIds.has(action.requiredWordDeckId))) add("ACTION_REQUIRED_WORD_DECK_INVALID", path, "requiredWordDeckId is only valid for text actions and must reference a known deck.");
    if (action.requiredWordDeckId && deckById.get(action.requiredWordDeckId)?.visibility !== "private") add("ACTION_REQUIRED_WORD_DECK_PUBLIC", path, "Required-word validation must reference a private deck.");
    if (action.answerDeckId && action.requiredWordDeckId) add("ACTION_TEXT_VALIDATION_AMBIGUOUS", path, "A text action cannot use both exact-answer and required-word validation.");
    if (["secret_word", "letter_guess", "word_guess"].includes(action.kind) && (!action.wordDuelId || !wordDuelIds.has(action.wordDuelId))) add("ACTION_WORD_DUEL_INVALID", path, "Word duel actions require a known wordDuelId.");
    if (action.wordDuelId && !["secret_word", "letter_guess", "word_guess"].includes(action.kind)) add("ACTION_WORD_DUEL_NOT_ALLOWED", path, "wordDuelId is only valid for word duel actions.");
    action.effects.forEach((effect, effectIndex) => checkEffect(effect, `${path}.effects.${effectIndex}`));
  });

  const checkCondition = (condition: AtomicCondition, path: string) => {
    if ((condition.kind === "action_count" || condition.kind === "all_players_acted" || condition.kind === "last_input_correct") && !actionIds.has(condition.actionId)) add("UNKNOWN_ACTION", path, `Unknown action: ${condition.actionId}.`);
    if (condition.kind === "resource_at_least" && !resourceIds.has(condition.resourceId)) add("UNKNOWN_RESOURCE", path, `Unknown resource: ${condition.resourceId}.`);
    if (condition.kind === "deck_empty" && !deckIds.has(condition.deckId)) add("UNKNOWN_DECK", path, `Unknown deck: ${condition.deckId}.`);
    if (condition.kind === "variable_equals" && !variableIds.has(condition.variableId)) add("UNKNOWN_VARIABLE", path, `Unknown variable: ${condition.variableId}.`);
  };

  spec.rules.forEach((rule, index) => {
    if (!actionIds.has(rule.trigger.actionId)) add("UNKNOWN_ACTION", `rules.${index}.trigger`, `Unknown action: ${rule.trigger.actionId}.`);
    rule.conditions.forEach((condition, conditionIndex) => checkCondition(condition, `rules.${index}.conditions.${conditionIndex}`));
    rule.effects.forEach((effect, effectIndex) => checkEffect(effect, `rules.${index}.effects.${effectIndex}`));
  });
  spec.phases.forEach((phase, index) => {
    const path = `phases.${index}`;
    if (phase.nextPhaseId && !phaseIds.has(phase.nextPhaseId)) add("UNKNOWN_PHASE", `${path}.nextPhaseId`, `Unknown phase: ${phase.nextPhaseId}.`);
    for (const id of phase.componentIds) if (!componentIds.has(id)) add("UNKNOWN_COMPONENT", path, `Unknown component: ${id}.`);
    for (const id of phase.actionIds) if (!actionIds.has(id)) add("UNKNOWN_ACTION", path, `Unknown action: ${id}.`);
    const phaseComponents = phase.componentIds.map((id) => componentById.get(id)).filter((component): component is ComposedComponent => Boolean(component));
    const supportsHumanAction = (action: ActionDefinition): boolean => {
      if (action.kind === "advance" || action.kind === "complete_challenge") return true;
      if (action.kind === "choose") return phaseComponents.some((component) => component.kind === "choices" && action.optionIds?.every((id) => component.optionIds.includes(id)));
      if (action.kind === "text") return phaseComponents.some((component) => component.kind === "text_input");
      if (action.kind === "draw") return phaseComponents.some((component) => (component.kind === "deck" || component.kind === "card_zone") && component.deckId === action.deckId);
      if (action.kind === "play_card") return phaseComponents.some((component) => component.kind === "card_zone" && component.zone === "hand" && component.deckId === action.deckId);
      if (action.kind === "move") return phaseComponents.some((component) => component.kind === "board" && component.boardId === action.boardId);
      if (action.kind === "resource") return phaseComponents.some((component) => component.kind === "resources");
      if (action.kind === "randomize") return phaseComponents.some((component) => component.kind === "randomizer" && component.randomizerId === action.randomizerId);
      if (action.kind === "buzz") return phaseComponents.some((component) => component.kind === "buzzer");
      if (action.kind === "order") return phaseComponents.some((component) => component.kind === "ordering" && action.itemIds?.every((id) => component.itemIds.includes(id)));
      if (action.kind === "match") return phaseComponents.some((component) => component.kind === "matching" && action.itemIds?.every((id) => component.itemIds.includes(id)));
      if (action.kind === "select_player") return phaseComponents.some((component) => component.kind === "teams" || component.kind === "players");
      if (action.kind === "sketch") return phaseComponents.some((component) => component.kind === "drawing");
      if (action.kind === "secret_word" || action.kind === "letter_guess" || action.kind === "word_guess") return phaseComponents.some((component) => component.kind === "word_duel" && component.id === action.wordDuelId);
      return false;
    };
    for (const id of phase.actionIds) {
      const action = actionById.get(id);
      if (action && !supportsHumanAction(action)) add("HUMAN_CONTROL_MISSING", `${path}.actionIds`, `Action ${id} has no compatible interactive component in this phase.`);
    }
    phase.completionConditions.forEach((condition, conditionIndex) => checkCondition(condition, `${path}.completionConditions.${conditionIndex}`));
    phase.onComplete.forEach((effect, effectIndex) => checkEffect(effect, `${path}.onComplete.${effectIndex}`));
  });

  return issues;
}

export function validateComposedGameSpec(input: unknown): ComposedGameSpecValidation {
  const parsed = composedGameSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => ({ code: "SCHEMA_INVALID", path: issue.path.join("."), message: issue.message })) };
  }
  const issues = semanticIssues(parsed.data);
  return issues.length ? { ok: false, issues } : { ok: true, spec: parsed.data };
}
