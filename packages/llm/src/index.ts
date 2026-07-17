import {
  composedBalancePatchSchema,
  createMovieMimePack,
  createWordTrapPack,
  createDrawBattlePack,
  drawBattleCatalog,
  drawBattleSetupSchema,
  createSoundCheckPack,
  soundCheckCatalog,
  soundCheckSetupSchema,
  createRandomStoryChainPack,
  createStoryChainPack,
  storyChainSetupSchema,
  storyRounds,
  storyTwistSchema,
  movieCatalog,
  movieMimeSetupSchema,
  wordTrapCatalog,
  wordTrapSetupSchema,
  type ComposedBalancePatch,
  type ComposedGameSpec,
  type MimeFilmPack,
  type MovieMimeSetup,
  type MovieMimeSetupInput,
  type WordTrapPack,
  type WordTrapSetup,
  type WordTrapSetupInput,
  type DrawBattlePack,
  type DrawBattleSetup,
  type DrawBattleSetupInput,
  type SoundCheckPack,
  type SoundCheckSetup,
  type SoundCheckSetupInput,
  type StoryChainPack,
  type StoryChainSetup,
  type StoryChainSetupInput,
} from "@boardforge/game-spec";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export type ComposedBalanceEvidence = {
  simulations: number;
  completionRate: number;
  averageActions: number;
  failures: Array<{ code: string; evidence: string }>;
};

export type ComposedAdjustableParameter =
  | { kind: "duration"; current: number; min: 2; max: 180 }
  | { kind: "timer"; componentId: string; current: number; min: 5; max: 900 }
  | {
      kind: "effect_amount";
      owner: "action" | "rule" | "phase";
      ownerId: string;
      effectIndex: number;
      effectKind: "add_score" | "add_resource";
      current: number;
      min: -100;
      max: 100;
    }
  | {
      kind: "draw_count";
      owner: "action" | "rule" | "phase";
      ownerId: string;
      effectIndex: number;
      current: number;
      min: 1;
      max: 12;
    }
  | { kind: "resource_initial"; resourceId: string; current: number; min: number; max: number };

export const composedGameCritiqueSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceSpecId: z.string().regex(/^[a-z][a-z0-9_]*$/).max(48),
    verdict: z.enum(["release_ready", "revise"]),
    summary: z.string().trim().min(8).max(400),
    strengths: z.array(z.string().trim().min(8).max(220)).max(5),
    issues: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(48),
            severity: z.enum(["low", "medium", "high"]),
            category: z.enum(["flow", "balance", "clarity", "privacy", "pace", "team_fairness", "replayability"]),
            evidence: z.string().trim().min(8).max(300),
            recommendation: z.string().trim().min(8).max(300),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export type ComposedGameCritique = z.infer<typeof composedGameCritiqueSchema>;

export type LlmUsageTelemetry = {
  operation: "movie_mime_selection" | "word_trap_selection" | "draw_battle_selection" | "sound_check_selection" | "story_chain_generation" | "composed_critique" | "composed_patch";
  provider: string;
  model: string;
  responseId: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
};

export interface LlmProvider {
  readonly name: string;
  generateMovieMimePack(setup: MovieMimeSetupInput): Promise<MimeFilmPack>;
  generateWordTrapPack(setup: WordTrapSetupInput): Promise<WordTrapPack>;
  generateDrawBattlePack(setup: DrawBattleSetupInput): Promise<DrawBattlePack>;
  generateSoundCheckPack(setup: SoundCheckSetupInput): Promise<SoundCheckPack>;
  generateStoryChainPack(setup: StoryChainSetupInput): Promise<StoryChainPack>;
  critiqueComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameCritique>;
  proposeComposedBalancePatch(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
    critique: ComposedGameCritique,
  ): Promise<ComposedBalancePatch>;
}

function adjustableEffects(
  parameters: ComposedAdjustableParameter[],
  owner: "action" | "rule" | "phase",
  ownerId: string,
  effects: ComposedGameSpec["actions"][number]["effects"],
): void {
  effects.forEach((effect, effectIndex) => {
    if (effect.kind === "add_score" || effect.kind === "add_resource") {
      parameters.push({
        kind: "effect_amount",
        owner,
        ownerId,
        effectIndex,
        effectKind: effect.kind,
        current: effect.amount,
        min: -100,
        max: 100,
      });
    } else if (effect.kind === "draw_cards") {
      parameters.push({
        kind: "draw_count",
        owner,
        ownerId,
        effectIndex,
        current: effect.count,
        min: 1,
        max: 12,
      });
    }
  });
}

export function composedAdjustableParameters(spec: ComposedGameSpec): ComposedAdjustableParameter[] {
  const parameters: ComposedAdjustableParameter[] = [];
  if (spec.suggestedDurationMinutes !== undefined) {
    parameters.push({
      kind: "duration",
      current: spec.suggestedDurationMinutes,
      min: 2,
      max: 180,
    });
  }
  for (const component of spec.components) {
    if (component.kind === "timer") {
      parameters.push({
        kind: "timer",
        componentId: component.id,
        current: component.seconds,
        min: 5,
        max: 900,
      });
    }
  }
  for (const resource of spec.resources) {
    parameters.push({
      kind: "resource_initial",
      resourceId: resource.id,
      current: resource.initialValue,
      min: resource.min,
      max: resource.max,
    });
  }
  for (const action of spec.actions) adjustableEffects(parameters, "action", action.id, action.effects);
  for (const rule of spec.rules) adjustableEffects(parameters, "rule", rule.id, rule.effects);
  for (const phase of spec.phases) adjustableEffects(parameters, "phase", phase.id, phase.onComplete);
  return parameters;
}

function composedReviewContext(spec: ComposedGameSpec, evidence: ComposedBalanceEvidence) {
  const components = new Map(spec.components.map((component) => [component.id, component.kind]));
  const actions = new Map(spec.actions.map((action) => [action.id, action]));
  return {
    game: {
      id: spec.id,
      title: spec.title,
      description: spec.description,
      players: { min: spec.minPlayers, max: spec.maxPlayers },
      setup: {
        mode: spec.setup.mode,
        teamCount: spec.setup.teamPolicy?.teams.length ?? 0,
      },
      phases: spec.phases.map((phase) => ({
        id: phase.id,
        title: phase.title,
        nextPhaseId: phase.nextPhaseId ?? null,
        components: phase.componentIds.map((id) => ({ id, kind: components.get(id) ?? "unknown" })),
        actions: phase.actionIds.map((id) => {
          const action = actions.get(id);
          return {
            id,
            kind: action?.kind ?? "unknown",
            actor: action?.actor ?? "unknown",
            effectKinds: action?.effects.map((effect) => effect.kind) ?? [],
          };
        }),
      })),
    },
    playtestEvidence: evidence,
    adjustableParameters: composedAdjustableParameters(spec),
  };
}

function hashText(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function normalizedPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

export class FakeLlmProvider implements LlmProvider {
  readonly name = "procedural-local";

  async generateMovieMimePack(setupInput: MovieMimeSetupInput): Promise<MimeFilmPack> {
    const setup = movieMimeSetupSchema.parse(setupInput);
    const preferences = normalizedPrompt(setup.preferences ?? "sélection variée");
    const preferenceWords = new Set(preferences.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((word) => word.length >= 4));
    const genreAliases: Record<string, string[]> = {
      action: ["action", "combat", "explosion"],
      adventure: ["adventure", "aventure", "travel", "voyage", "exploration"],
      animation: ["animation", "dessin", "pixar", "disney"],
      comedy: ["comedy", "comedie", "comédie", "funny", "humor", "humour"],
      crime: ["policier", "crime", "mafia", "braquage"],
      drama: ["drama", "drame", "dramatic", "emotion", "émotion"],
      family: ["family", "famille", "familial", "children", "enfant", "enfants"],
      fantasy: ["fantasy", "magic", "wizard", "fantastique", "magie", "sorcier"],
      horror: ["horror", "scary", "horreur", "peur", "frisson"],
      musical: ["musical", "music", "dance", "musique", "danse"],
      romance: ["romance", "romantic", "love", "romantique", "amour"],
      science_fiction: ["science", "fiction", "space", "future", "spatial", "futur"],
      sport: ["sport", "sports", "competition", "compétition"],
      thriller: ["thriller", "suspense", "tension"],
    };
    const ranked = movieCatalog
      .map((film) => {
        let score = hashText(`${preferences}:${film.id}`) % 100;
        for (const genre of film.genres) {
          if (genreAliases[genre]?.some((alias) => preferenceWords.has(alias))) score += 1_000;
        }
        if (film.audience === "family" && [...preferenceWords].some((word) => ["family", "children", "kids", "famille", "familial", "enfant", "enfants"].includes(word))) score += 800;
        const decade = Math.floor(film.year / 10) * 10;
        if (preferences.includes(String(decade))) score += 700;
        return { film, score };
      })
      .sort((left, right) => right.score - left.score || left.film.id.localeCompare(right.film.id));
    return createMovieMimePack(setup, ranked.slice(0, setup.filmCount).map(({ film }) => film.id), "ai");
  }

  async generateWordTrapPack(setupInput: WordTrapSetupInput): Promise<WordTrapPack> {
    const setup = wordTrapSetupSchema.parse(setupInput);
    const preferences = normalizedPrompt(setup.preferences ?? "a varied party mix").toLowerCase();
    const preferenceWords = new Set(preferences.split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
    const ranked = wordTrapCatalog
      .map((card) => {
        const searchable = [card.word, card.category, card.difficulty, ...card.forbidden].join(" ").toLowerCase();
        const matches = [...preferenceWords].filter((word) => searchable.includes(word)).length;
        return { card, score: matches * 1_000 + hashText(`${preferences}:${card.id}`) % 100 };
      })
      .sort((left, right) => right.score - left.score || left.card.id.localeCompare(right.card.id));
    return createWordTrapPack(setup, ranked.slice(0, setup.cardCount).map(({ card }) => card.id), "ai");
  }

  async generateDrawBattlePack(setupInput: DrawBattleSetupInput): Promise<DrawBattlePack> {
    const setup = drawBattleSetupSchema.parse(setupInput);
    const preferences = normalizedPrompt(setup.preferences ?? "a varied drawing mix").toLowerCase();
    const preferenceWords = new Set(preferences.split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
    const ranked = drawBattleCatalog
      .map((prompt) => {
        const searchable = [prompt.prompt, prompt.category, prompt.difficulty].join(" ").toLowerCase();
        const matches = [...preferenceWords].filter((word) => searchable.includes(word)).length;
        return { prompt, score: matches * 1_000 + hashText(`${preferences}:${prompt.id}`) % 100 };
      })
      .sort((left, right) => right.score - left.score || left.prompt.id.localeCompare(right.prompt.id));
    return createDrawBattlePack(setup, ranked.slice(0, setup.promptCount).map(({ prompt }) => prompt.id), "ai");
  }

  async generateSoundCheckPack(setupInput: SoundCheckSetupInput): Promise<SoundCheckPack> {
    const setup = soundCheckSetupSchema.parse(setupInput);
    const preferences = normalizedPrompt(setup.preferences ?? "a varied sound imitation mix").toLowerCase();
    const preferenceWords = new Set(preferences.split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
    const ranked = soundCheckCatalog
      .map((prompt) => {
        const searchable = [prompt.answer, prompt.category, prompt.difficulty].join(" ").toLowerCase();
        const matches = [...preferenceWords].filter((word) => searchable.includes(word)).length;
        return { prompt, score: matches * 1_000 + hashText(`${preferences}:${prompt.id}`) % 100 };
      })
      .sort((left, right) => right.score - left.score || left.prompt.id.localeCompare(right.prompt.id));
    return createSoundCheckPack(setup, ranked.slice(0, setup.promptCount).map(({ prompt }) => prompt.id), "ai");
  }

  async generateStoryChainPack(setupInput: StoryChainSetupInput): Promise<StoryChainPack> {
    const setup = storyChainSetupSchema.parse(setupInput);
    const selected = createRandomStoryChainPack(setup, `local-ai:${normalizedPrompt(setup.preferences ?? setup.mood)}`);
    return createStoryChainPack(setup, selected, "ai");
  }

  async proposeComposedBalancePatch(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
    critique: ComposedGameCritique,
  ): Promise<ComposedBalancePatch> {
    const timer = spec.components.find((component) => component.kind === "timer");
    if (timer?.kind === "timer") {
      const adjustment = evidence.completionRate < 1 ? 15 : -5;
      return {
        schemaVersion: 1,
        sourceSpecId: spec.id,
        summary: critique.issues[0]?.recommendation ?? (evidence.completionRate < 1
          ? "Donne davantage de temps aux joueurs pour réduire les parties bloquées."
          : "Resserre légèrement le rythme après un playtest entièrement terminé."),
        changes: [
          {
            kind: "set_timer_seconds",
            componentId: timer.id,
            seconds: Math.max(5, Math.min(900, timer.seconds + adjustment)),
          },
        ],
      };
    }
    return {
      schemaVersion: 1,
      sourceSpecId: spec.id,
      summary: "Ajuste la durée annoncée sans modifier les mécaniques validées du jeu.",
      changes: [
        {
          kind: "set_duration",
          minutes: Math.max(2, Math.min(180, (spec.suggestedDurationMinutes ?? 15) + 5)),
        },
      ],
    };
  }

  async critiqueComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameCritique> {
    const passed = evidence.completionRate === 1 && evidence.failures.length === 0;
    return {
      schemaVersion: 1,
      sourceSpecId: spec.id,
      verdict: passed ? "release_ready" : "revise",
      summary: passed
        ? `${spec.title} termine toutes les simulations et respecte les vues privées contrôlées par le serveur.`
        : `${spec.title} présente encore des blocages observés pendant les simulations déterministes.`,
      strengths: [
        `${evidence.simulations} simulations couvrent plusieurs configurations de joueurs avec le même moteur que les rooms réelles.`,
        "Les transitions, scores et informations privées restent contrôlés par le serveur autoritaire.",
      ],
      issues: passed
        ? [
            {
              code: "PACE_TUNING_OPPORTUNITY",
              severity: "low",
              category: "pace",
              evidence: `Les parties terminées utilisent en moyenne ${evidence.averageActions} actions.`,
              recommendation: "Resserre légèrement le rythme pour comparer une variante sans modifier les mécaniques.",
            },
          ]
        : evidence.failures.slice(0, 8).map((failure) => ({
            code: failure.code,
            severity: "high" as const,
            category: "flow" as const,
            evidence: failure.evidence,
            recommendation: "Corrige le paramètre responsable puis rejoue la même matrice de simulations.",
          })),
    };
  }

}

function requireParsedOutput<T>(value: T | null, operation: string): T {
  if (value === null) {
    throw new Error(`OpenAI returned no parsed output for ${operation}.`);
  }
  return value;
}

type OpenAiTelemetryResponse = {
  id: string;
  usage?: {
    input_tokens: number;
    input_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
    output_tokens: number;
    total_tokens: number;
  } | null;
};

export class OpenAiLlmProvider implements LlmProvider {
  readonly name: string;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = "gpt-5.6-terra",
    private readonly reviewModel = model,
    private readonly onTelemetry?: (telemetry: LlmUsageTelemetry) => void,
  ) {
    if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required for the OpenAI provider.");
    this.name = `openai:${model}`;
    this.client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 0 });
  }

  private recordTelemetry(
    operation: LlmUsageTelemetry["operation"],
    model: string,
    startedAt: number,
    response: OpenAiTelemetryResponse,
  ): void {
    const usage = response.usage;
    if (!usage || !this.onTelemetry) return;
    this.onTelemetry({
      operation,
      provider: this.name,
      model,
      responseId: response.id,
      inputTokens: usage.input_tokens,
      cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: usage.input_tokens_details?.cache_write_tokens ?? 0,
      outputTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
      latencyMs: Date.now() - startedAt,
    });
  }

  private async selectMovieMimeCandidate(
    setup: MovieMimeSetup,
    repairContext?: string,
  ): Promise<{ filmIds: string[] }> {
    const selectionSchema = z.object({
      filmIds: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(48)).min(6).max(40),
    }).strict();
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        {
          role: "system",
          content: [
            "You curate a movie-charades deck from an audited catalog.",
            "Return only catalog IDs. Never invent, rename or repeat a movie.",
            "Select exactly the requested count.",
            "Prioritize the user's preferences, then balance recognizability, eras, genres and mimeability.",
            "For family requests, select only entries whose audience is family.",
            "The returned order should alternate easy and more surprising choices.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            requestedCount: setup.filmCount,
            preferences: setup.preferences,
            catalog: movieCatalog,
            ...(repairContext ? { repairContext } : {}),
          }),
        },
      ],
      prompt_cache_key: "boardforge:movie-mime-selection:v1",
      text: { format: zodTextFormat(selectionSchema, "movie_mime_selection") },
      max_output_tokens: 1_200,
    });
    this.recordTelemetry("movie_mime_selection", this.reviewModel, startedAt, response);
    return requireParsedOutput(response.output_parsed, "movie mime selection");
  }

  async generateMovieMimePack(setupInput: MovieMimeSetupInput): Promise<MimeFilmPack> {
    const setup = movieMimeSetupSchema.parse(setupInput);
    const first = await this.selectMovieMimeCandidate(setup);
    try {
      return createMovieMimePack(setup, first.filmIds, "ai");
    } catch (error) {
      const repaired = await this.selectMovieMimeCandidate(
        setup,
        error instanceof Error ? error.message : "The previous selection was invalid.",
      );
      return createMovieMimePack(setup, repaired.filmIds, "ai");
    }
  }

  private async selectWordTrapCandidate(
    setup: WordTrapSetup,
    repairContext?: string,
  ): Promise<{ cardIds: string[] }> {
    const selectionSchema = z.object({
      cardIds: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(48)).min(6).max(40),
    }).strict();
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        {
          role: "system",
          content: [
            "You curate a forbidden-word party deck from an audited catalog.",
            "Return only catalog IDs. Never invent, rename or repeat a card.",
            "Select exactly the requested count.",
            "Honor the requested mood or topic, while balancing categories and difficulty.",
            "Prefer words that are recognizable, social and fun to describe aloud.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ requestedCount: setup.cardCount, preferences: setup.preferences, catalog: wordTrapCatalog, ...(repairContext ? { repairContext } : {}) }),
        },
      ],
      prompt_cache_key: "boardforge:word-trap-selection:v1",
      text: { format: zodTextFormat(selectionSchema, "word_trap_selection") },
      max_output_tokens: 1_200,
    });
    this.recordTelemetry("word_trap_selection", this.reviewModel, startedAt, response);
    return requireParsedOutput(response.output_parsed, "WordTrap selection");
  }

  async generateWordTrapPack(setupInput: WordTrapSetupInput): Promise<WordTrapPack> {
    const setup = wordTrapSetupSchema.parse(setupInput);
    const first = await this.selectWordTrapCandidate(setup);
    try {
      return createWordTrapPack(setup, first.cardIds, "ai");
    } catch (error) {
      const repaired = await this.selectWordTrapCandidate(setup, error instanceof Error ? error.message : "The previous selection was invalid.");
      return createWordTrapPack(setup, repaired.cardIds, "ai");
    }
  }

  private async selectDrawBattleCandidate(
    setup: DrawBattleSetup,
    repairContext?: string,
  ): Promise<{ promptIds: string[] }> {
    const selectionSchema = z.object({ promptIds: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(48)).min(6).max(30) }).strict();
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        { role: "system", content: [
          "You curate a live drawing party deck from an audited catalog.",
          "Return only catalog IDs. Never invent, rename or repeat a prompt.",
          "Select exactly the requested count.",
          "Honor the requested topic while balancing categories, difficulty, recognizability and drawability.",
          "Keep the selection welcoming and visually varied.",
        ].join("\n") },
        { role: "user", content: JSON.stringify({ requestedCount: setup.promptCount, preferences: setup.preferences, catalog: drawBattleCatalog, ...(repairContext ? { repairContext } : {}) }) },
      ],
      prompt_cache_key: "boardforge:draw-battle-selection:v1",
      text: { format: zodTextFormat(selectionSchema, "draw_battle_selection") },
      max_output_tokens: 1_200,
    });
    this.recordTelemetry("draw_battle_selection", this.reviewModel, startedAt, response);
    return requireParsedOutput(response.output_parsed, "DrawBattle selection");
  }

  async generateDrawBattlePack(setupInput: DrawBattleSetupInput): Promise<DrawBattlePack> {
    const setup = drawBattleSetupSchema.parse(setupInput);
    const first = await this.selectDrawBattleCandidate(setup);
    try {
      return createDrawBattlePack(setup, first.promptIds, "ai");
    } catch (error) {
      const repaired = await this.selectDrawBattleCandidate(setup, error instanceof Error ? error.message : "The previous selection was invalid.");
      return createDrawBattlePack(setup, repaired.promptIds, "ai");
    }
  }

  private async selectSoundCheckCandidate(
    setup: SoundCheckSetup,
    repairContext?: string,
  ): Promise<{ promptIds: string[] }> {
    const selectionSchema = z.object({ promptIds: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(48)).min(6).max(30) }).strict();
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        { role: "system", content: [
          "You curate a voice-only sound imitation party deck from an audited catalog.",
          "Return only catalog IDs. Never invent, rename or repeat a prompt.",
          "Select exactly the requested count.",
          "Honor the requested topic while balancing categories, difficulty and recognizability.",
          "Every selection must be safe and practical to imitate without props or a microphone.",
        ].join("\n") },
        { role: "user", content: JSON.stringify({ requestedCount: setup.promptCount, preferences: setup.preferences, catalog: soundCheckCatalog, ...(repairContext ? { repairContext } : {}) }) },
      ],
      prompt_cache_key: "boardforge:sound-check-selection:v1",
      text: { format: zodTextFormat(selectionSchema, "sound_check_selection") },
      max_output_tokens: 1_200,
    });
    this.recordTelemetry("sound_check_selection", this.reviewModel, startedAt, response);
    return requireParsedOutput(response.output_parsed, "SoundCheck selection");
  }

  async generateSoundCheckPack(setupInput: SoundCheckSetupInput): Promise<SoundCheckPack> {
    const setup = soundCheckSetupSchema.parse(setupInput);
    const first = await this.selectSoundCheckCandidate(setup);
    try {
      return createSoundCheckPack(setup, first.promptIds, "ai");
    } catch (error) {
      const repaired = await this.selectSoundCheckCandidate(setup, error instanceof Error ? error.message : "The previous selection was invalid.");
      return createSoundCheckPack(setup, repaired.promptIds, "ai");
    }
  }

  private async generateStoryChainCandidate(
    setup: StoryChainSetup,
    repairContext?: string,
  ): Promise<{ title: string; opening: string; twists: z.infer<typeof storyTwistSchema>[] }> {
    const count = storyRounds[setup.length];
    const candidateSchema = z.object({
      title: z.string().trim().min(2).max(64),
      opening: z.string().trim().min(20).max(420),
      twists: z.array(storyTwistSchema).min(8).max(16),
    }).strict();
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        { role: "system", content: [
          "You are the story editor for a premium, welcoming party game.",
          "Create English story content only; never create or modify game rules.",
          `Return exactly ${count} distinct secret twists.`,
          "Each twist needs a unique lowercase snake_case id, a unique one- or two-word requiredWord, and a short creative direction.",
          "The opening should be vivid, immediately playable, and leave room for many directions.",
          "Keep everything PG-13, inclusive, original, and suitable for reading aloud with friends or family.",
          "Do not reference copyrighted characters, living public figures, politics, explicit sex, self-harm, or graphic violence.",
        ].join("\n") },
        { role: "user", content: JSON.stringify({ mood: setup.mood, storyLength: setup.length, requestedTwists: count, preferences: setup.preferences, ...(repairContext ? { repairContext } : {}) }) },
      ],
      prompt_cache_key: "boardforge:story-chain-generation:v1",
      text: { format: zodTextFormat(candidateSchema, "story_chain_pack") },
      max_output_tokens: 2_800,
    });
    this.recordTelemetry("story_chain_generation", this.reviewModel, startedAt, response);
    return requireParsedOutput(response.output_parsed, "StoryChain generation");
  }

  async generateStoryChainPack(setupInput: StoryChainSetupInput): Promise<StoryChainPack> {
    const setup = storyChainSetupSchema.parse(setupInput);
    const first = await this.generateStoryChainCandidate(setup);
    try {
      return createStoryChainPack(setup, first, "ai");
    } catch (error) {
      const repaired = await this.generateStoryChainCandidate(setup, error instanceof Error ? error.message : "The previous story pack was invalid.");
      return createStoryChainPack(setup, repaired, "ai");
    }
  }

  async proposeComposedBalancePatch(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
    critique: ComposedGameCritique,
  ): Promise<ComposedBalancePatch> {
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        {
          role: "system",
          content: [
            "You are BoardForge's constrained balance reviewer.",
            "Propose one minimal balance revision for the validated ComposedGameSpec using only the supplied closed patch schema.",
            "Never add, remove or rename mechanics, phases, actions, components, IDs or executable content.",
            "Every target ID and effect index must already exist in the source spec and match the requested effect kind.",
            "Prefer a single evidence-backed change. Keep all values within the schema bounds.",
            "sourceSpecId must exactly equal the source GameSpec ID.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            ...composedReviewContext(spec, evidence),
            critique,
          }),
        },
      ],
      prompt_cache_key: "boardforge:composed-patch:v1",
      text: { format: zodTextFormat(composedBalancePatchSchema, "composed_balance_patch") },
      max_output_tokens: 1_500,
    });
    this.recordTelemetry("composed_patch", this.reviewModel, startedAt, response);
    return requireParsedOutput(response.output_parsed, "composed balance patch");
  }

  async critiqueComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameCritique> {
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        {
          role: "system",
          content: [
            "You are BoardForge's constrained playtest critic.",
            "Review only the supplied validated ComposedGameSpec and deterministic playtest evidence.",
            "Return the critique in the same language as the game.",
            "Every claim must cite evidence supplied in the telemetry or the visible GameSpec structure.",
            "Do not propose code, scripts, new mechanics or arbitrary schema changes.",
            "Use verdict revise for any blocked simulation, private-information failure or unreachable ending.",
            "sourceSpecId must exactly equal the source GameSpec ID.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(composedReviewContext(spec, evidence)) },
      ],
      prompt_cache_key: "boardforge:composed-critique:v1",
      text: { format: zodTextFormat(composedGameCritiqueSchema, "composed_game_critique") },
      max_output_tokens: 1_800,
    });
    this.recordTelemetry("composed_critique", this.reviewModel, startedAt, response);
    const critique = requireParsedOutput(response.output_parsed, "composed game critique");
    if (critique.sourceSpecId !== spec.id) {
      throw new Error(`OpenAI critique targeted ${critique.sourceSpecId}, not ${spec.id}.`);
    }
    return critique;
  }

}

export type LlmProviderConfig = {
  provider: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  reviewModel?: string | undefined;
  onTelemetry?: ((telemetry: LlmUsageTelemetry) => void) | undefined;
};

export function createLlmProvider(config?: LlmProviderConfig): LlmProvider {
  const selected = config?.provider ?? (config?.apiKey ? "openai" : "fake");
  if (selected === "fake") return new FakeLlmProvider();
  if (selected === "openai") {
    if (!config?.apiKey) throw new Error("LLM_PROVIDER=openai requires OPENAI_API_KEY.");
    const generationModel = config.model ?? "gpt-5.6";
    return new OpenAiLlmProvider(
      config.apiKey,
      generationModel,
      config.reviewModel ?? generationModel,
      config.onTelemetry,
    );
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${selected}`);
}
