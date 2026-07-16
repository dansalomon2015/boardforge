import {
  cinemaCharadesSpec,
  composedBalancePatchSchema,
  composedGameSpecSchema,
  createMovieMimePack,
  movieCatalog,
  movieMimeSetupSchema,
  type ComposedBalancePatch,
  type GameSpec,
  type ComposedGameSpec,
  type HiddenRolesGameSpec,
  type MimeFilmPack,
  type MovieMimeSetup,
  type QuizVoteGameSpec,
  type QuizVoteQuestion,
  hiddenRolesGameSpecSchema,
  quizVoteGameSpecSchema,
  validateComposedGameSpec,
  validateGameSpec,
} from "@boardforge/game-spec";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export type GameBrief = {
  template: "hidden_roles" | "quiz_vote";
  prompt: string;
  players: number;
  durationMinutes: number;
};

export type PlaytestPlan = {
  personas: Array<{
    id: "careful" | "bold" | "chaotic" | "social";
    weight: number;
  }>;
  hypotheses: string[];
  simulations: number;
};

export type GameCritique = {
  summary: string;
  issues: Array<{ code: string; severity: "low" | "medium" | "high"; evidence: string }>;
};

export type BalancePatch = {
  summary: string;
  changes: Array<{ path: string; value: string | number }>;
};

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

export const composedGameReviewSchema = z
  .object({
    critique: composedGameCritiqueSchema,
    suggestedPatch: composedBalancePatchSchema.nullable(),
  })
  .strict();

export type ComposedGameReview = z.infer<typeof composedGameReviewSchema>;

export type LlmUsageTelemetry = {
  operation: "movie_mime_selection" | "composed_generation" | "composed_review" | "composed_critique" | "composed_patch";
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
  generateMovieMimePack(setup: MovieMimeSetup): Promise<MimeFilmPack>;
  generateComposedGameSpec(prompt: string): Promise<ComposedGameSpec>;
  reviewComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameReview>;
  critiqueComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameCritique>;
  proposeComposedBalancePatch(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
    critique: ComposedGameCritique,
  ): Promise<ComposedBalancePatch>;
  generateGameSpec(brief: GameBrief): Promise<GameSpec>;
  designPlaytest(spec: GameSpec): Promise<PlaytestPlan>;
  critiquePlaytest(spec: GameSpec, plan: PlaytestPlan): Promise<GameCritique>;
  proposeBalancePatch(spec: GameSpec, critique: GameCritique): Promise<BalancePatch>;
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

const playtestPlanSchema = z
  .object({
    personas: z
      .array(
        z
          .object({
            id: z.enum(["careful", "bold", "chaotic", "social"]),
            weight: z.number().int().min(1).max(5),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    hypotheses: z.array(z.string().trim().min(8).max(180)).min(2).max(5),
    simulations: z.number().int().min(8).max(50),
  })
  .strict();

const gameCritiqueSchema = z
  .object({
    summary: z.string().trim().min(8).max(400),
    issues: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(48),
            severity: z.enum(["low", "medium", "high"]),
            evidence: z.string().trim().min(8).max(300),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

const balancePatchSchema = z
  .object({
    summary: z.string().trim().min(8).max(300),
    changes: z
      .array(
        z
          .object({
            path: z.string().trim().min(1).max(80),
            value: z.union([z.string().max(180), z.number()]),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

type Accent = GameSpec["accent"];

type HiddenTheme = {
  keywords: string[];
  title: string;
  crewName: string;
  saboteurName: string;
  crewObjective: string;
  saboteurObjective: string;
  missionPrompt: string;
};

const accents: Accent[] = ["violet", "coral", "cyan", "lime"];

const hiddenThemes: HiddenTheme[] = [
  {
    keywords: ["space", "spatial", "galaxy", "galaxie", "planet", "planète", "sci-fi", "vaisseau"],
    title: "Starfall Protocol",
    crewName: "Équipage astral",
    saboteurName: "Agent du vide",
    crewObjective: "Stabilisez le vaisseau et remportez la majorité des missions avant l'effondrement du réacteur.",
    saboteurObjective: "Compromettez les missions sans révéler votre allégeance au Vide.",
    missionPrompt: "Décidez secrètement de stabiliser le secteur ou, si vous êtes l'Agent du vide, de provoquer une avarie.",
  },
  {
    keywords: ["fantasy", "dragon", "magic", "magie", "royaume", "kingdom", "sorcier", "médiéval"],
    title: "The Broken Crown",
    crewName: "Gardien royal",
    saboteurName: "Métamorphe",
    crewObjective: "Protégez les sceaux du royaume et démasquez la créature infiltrée dans la cour.",
    saboteurObjective: "Brisez les sceaux du royaume tout en conservant votre apparence humaine.",
    missionPrompt: "Choisissez secrètement de renforcer le sceau ou, si vous êtes le Métamorphe, de le corrompre.",
  },
  {
    keywords: ["pirate", "trésor", "treasure", "island", "île", "navire", "océan", "ocean"],
    title: "Mutiny at Dawn",
    crewName: "Marin loyal",
    saboteurName: "Mutin",
    crewObjective: "Menez le navire jusqu'au trésor et identifiez les meneurs de la mutinerie.",
    saboteurObjective: "Détournez le navire et faites échouer l'expédition sans être jeté par-dessus bord.",
    missionPrompt: "Choisissez secrètement de tenir le cap ou, si vous êtes Mutin, de saboter la traversée.",
  },
  {
    keywords: ["mystery", "mystère", "detective", "détective", "murder", "meurtre", "manoir", "enquête"],
    title: "Midnight Manor",
    crewName: "Enquêteur",
    saboteurName: "Cerveau du crime",
    crewObjective: "Rassemblez les indices et identifiez l'architecte du crime avant minuit.",
    saboteurObjective: "Détruisez les preuves et détournez les soupçons vers les autres invités.",
    missionPrompt: "Décidez secrètement de préserver l'indice ou, si vous êtes le Cerveau, de le falsifier.",
  },
  {
    keywords: ["office", "bureau", "startup", "entreprise", "company", "team", "équipe", "projet"],
    title: "Deadline Zero",
    crewName: "Équipe projet",
    saboteurName: "Bloqueur secret",
    crewObjective: "Livrez le projet critique à temps et identifiez qui bloque silencieusement l'équipe.",
    saboteurObjective: "Faites dérailler la livraison en restant le collègue le plus irréprochable.",
    missionPrompt: "Décidez secrètement de valider le livrable ou, si vous êtes le Bloqueur, d'y glisser une erreur.",
  },
];

const genericHiddenTheme: HiddenTheme = {
  keywords: [],
  title: "Double Signal",
  crewName: "Allié",
  saboteurName: "Agent double",
  crewObjective: "Réussissez la majorité des missions et identifiez l'agent infiltré dans le groupe.",
  saboteurObjective: "Faites échouer la majorité des missions sans attirer le vote final.",
  missionPrompt: "Choisissez secrètement de faire progresser le plan ou, si vous êtes l'Agent double, de le compromettre.",
};

const triviaBank: QuizVoteQuestion[] = [
  {
    id: "mars_day",
    type: "trivia",
    prompt: "Combien de temps dure approximativement une journée sur Mars ?",
    options: [
      { id: "mars_24", label: "24 h 39 min" },
      { id: "mars_30", label: "30 heures" },
      { id: "mars_48", label: "48 heures" },
    ],
    correctOptionId: "mars_24",
    explanation: "Le sol martien dure environ 24 heures et 39 minutes.",
  },
  {
    id: "octopus_hearts",
    type: "trivia",
    prompt: "Combien de cœurs possède une pieuvre ?",
    options: [
      { id: "heart_1", label: "Un" },
      { id: "heart_2", label: "Deux" },
      { id: "heart_3", label: "Trois" },
      { id: "heart_8", label: "Huit" },
    ],
    correctOptionId: "heart_3",
    explanation: "Une pieuvre possède deux cœurs branchiaux et un cœur systémique.",
  },
  {
    id: "chess_squares",
    type: "trivia",
    prompt: "Combien de cases compte un échiquier classique ?",
    options: [
      { id: "chess_56", label: "56" },
      { id: "chess_64", label: "64" },
      { id: "chess_72", label: "72" },
    ],
    correctOptionId: "chess_64",
    explanation: "Un échiquier est composé de 8 rangées et 8 colonnes, soit 64 cases.",
  },
  {
    id: "pacific_ocean",
    type: "trivia",
    prompt: "Quel est le plus vaste océan de la Terre ?",
    options: [
      { id: "ocean_atlantic", label: "L'océan Atlantique" },
      { id: "ocean_indian", label: "L'océan Indien" },
      { id: "ocean_pacific", label: "L'océan Pacifique" },
    ],
    correctOptionId: "ocean_pacific",
    explanation: "L'océan Pacifique est le plus vaste bassin océanique de la planète.",
  },
  {
    id: "adult_bones",
    type: "trivia",
    prompt: "Combien d'os compte généralement le squelette humain adulte ?",
    options: [
      { id: "bones_186", label: "186" },
      { id: "bones_206", label: "206" },
      { id: "bones_226", label: "226" },
    ],
    correctOptionId: "bones_206",
    explanation: "Le squelette humain adulte compte généralement 206 os.",
  },
  {
    id: "eiffel_year",
    type: "trivia",
    prompt: "En quelle année la tour Eiffel a-t-elle été achevée ?",
    options: [
      { id: "eiffel_1879", label: "1879" },
      { id: "eiffel_1889", label: "1889" },
      { id: "eiffel_1900", label: "1900" },
    ],
    correctOptionId: "eiffel_1889",
    explanation: "La tour Eiffel a été achevée en 1889 pour l'Exposition universelle.",
  },
];

const stopWords = new Set([
  "a", "an", "the", "un", "une", "des", "de", "du", "le", "la", "les", "avec", "and", "et", "pour",
  "create", "créer", "cree", "fais", "faire", "game", "jeu", "party", "rapide", "minute", "minutes",
]);

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

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return slug && /^[a-z]/.test(slug) ? slug : `forge_${slug || "game"}`;
}

function themeLabel(prompt: string, fallback: string): string {
  const words = normalizedPrompt(prompt)
    .replace(/\b\d+\s*(?:-| )?minutes?\b/gi, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 1 && !stopWords.has(word.toLowerCase()))
    .slice(0, 5);
  if (words.length === 0) return fallback;
  return words.join(" ").slice(0, 52);
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function pickHiddenTheme(prompt: string): HiddenTheme {
  const lower = normalizedPrompt(prompt).toLowerCase();
  return hiddenThemes.find((theme) => theme.keywords.some((keyword) => lower.includes(keyword))) ?? genericHiddenTheme;
}

function validateGeneratedSpec(spec: GameSpec): GameSpec {
  const validation = validateGameSpec(spec);
  if (!validation.ok) {
    throw new Error(`The local provider produced an invalid GameSpec: ${JSON.stringify(validation.issues)}`);
  }
  return validation.spec;
}

function generateHiddenRolesSpec(brief: GameBrief, hash: number): HiddenRolesGameSpec {
  const theme = pickHiddenTheme(brief.prompt);
  const label = titleCase(themeLabel(brief.prompt, theme.title));
  const title = label.toLowerCase() === theme.title.toLowerCase()
    ? theme.title
    : `${theme.title}: ${label}`.slice(0, 64).replace(/\s+\S*$/, (word) => word.length > 0 ? word : "");
  const duration = Math.max(5, Math.min(45, brief.durationMinutes));
  const rounds = duration <= 10 ? 2 : duration <= 24 ? 3 : duration <= 34 ? 4 : 5;

  return {
    schemaVersion: 1,
    id: slugify(`hidden_${theme.title}_${label}_${hash.toString(36)}`).slice(0, 48),
    template: "hidden_roles",
    title: title.slice(0, 64),
    description: `Un jeu de bluff sur le thème « ${label} » : le groupe doit réussir ${Math.ceil(rounds / 2)} missions avant que l'infiltré ne prenne le contrôle.`.slice(0, 280),
    minPlayers: 2,
    maxPlayers: Math.max(8, Math.min(12, brief.players)),
    durationMinutes: duration,
    accent: accents[hash % accents.length]!,
    rounds,
    roles: [
      {
        id: "crew",
        name: theme.crewName,
        team: "crew",
        objective: theme.crewObjective,
      },
      {
        id: "saboteur",
        name: theme.saboteurName,
        team: "saboteur",
        objective: theme.saboteurObjective,
      },
    ],
    missionPrompt: `${theme.missionPrompt} Thème de cette partie : ${label}.`.slice(0, 180),
    discussionSeconds: Math.max(30, Math.min(120, Math.round(duration * 3.5))),
    scoring: {
      crewMissionPoints: 1,
      saboteurMissionPoints: 1,
      correctVoteBonus: duration >= 25 ? 2 : 1,
    },
  };
}

function socialQuestions(label: string): QuizVoteQuestion[] {
  const safeLabel = label.slice(0, 70);
  return [
    {
      id: "social_hero",
      type: "player_vote",
      prompt: `Qui deviendrait le héros le plus improbable dans « ${safeLabel} » ?`,
      explanation: "Le groupe vote pour la personne qui surprendrait tout le monde au moment décisif.",
    },
    {
      id: "social_calm",
      type: "player_vote",
      prompt: `Qui garderait le mieux son calme pendant « ${safeLabel} » ?`,
      explanation: "Le groupe désigne la personne la plus fiable quand la situation devient chaotique.",
    },
    {
      id: "social_bold",
      type: "player_vote",
      prompt: `Qui prendrait la décision la plus audacieuse dans « ${safeLabel} » ?`,
      explanation: "Le groupe vote pour la personne qui oserait tenter le plan que personne d'autre n'imagine.",
    },
    {
      id: "social_twist",
      type: "player_vote",
      prompt: `Qui provoquerait le retournement de situation le plus mémorable dans « ${safeLabel} » ?`,
      explanation: "Le groupe choisit la personne capable de transformer complètement l'histoire.",
    },
  ];
}

function rotated<T>(items: T[], offset: number): T[] {
  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function generateQuizVoteSpec(brief: GameBrief, hash: number): QuizVoteGameSpec {
  const label = titleCase(themeLabel(brief.prompt, "Party Mix"));
  const duration = Math.max(5, Math.min(45, brief.durationMinutes));
  const questionCount = Math.max(3, Math.min(8, Math.round(duration / 4)));
  const trivia = rotated(triviaBank, hash % triviaBank.length);
  const social = rotated(socialQuestions(label), Math.floor(hash / 7) % 4);
  const questions: QuizVoteQuestion[] = [];

  for (let index = 0; index < questionCount; index += 1) {
    const useSocial = index % 2 === 1 || index >= trivia.length;
    const source = useSocial
      ? social[Math.floor(index / 2) % social.length]!
      : trivia[Math.floor(index / 2) % trivia.length]!;
    questions.push(structuredClone(source));
  }

  return {
    schemaVersion: 1,
    id: slugify(`quiz_${label}_${hash.toString(36)}`).slice(0, 48),
    template: "quiz_vote",
    title: `Pulse: ${label}`.slice(0, 64),
    description: `Un party game unique autour de « ${label} », alternant quiz express et votes sur les personnalités du groupe.`.slice(0, 280),
    minPlayers: 2,
    maxPlayers: Math.max(10, Math.min(12, brief.players)),
    durationMinutes: duration,
    accent: accents[hash % accents.length]!,
    answerSeconds: Math.max(15, Math.min(60, Math.round((duration * 60) / questionCount / 3))),
    questions,
    scoring: {
      correctAnswerPoints: duration >= 25 ? 3 : 2,
      popularVotePoints: 1,
    },
  };
}

export class FakeLlmProvider implements LlmProvider {
  readonly name = "procedural-local";

  async generateMovieMimePack(setupInput: MovieMimeSetup): Promise<MimeFilmPack> {
    const setup = movieMimeSetupSchema.parse(setupInput);
    const preferences = normalizedPrompt(setup.preferences ?? "sélection variée");
    const preferenceWords = new Set(preferences.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((word) => word.length >= 4));
    const genreAliases: Record<string, string[]> = {
      action: ["action", "combat", "explosion"],
      adventure: ["aventure", "voyage", "exploration"],
      animation: ["animation", "dessin", "pixar", "disney"],
      comedy: ["comedie", "comédie", "drole", "drôle", "humour"],
      crime: ["policier", "crime", "mafia", "braquage"],
      drama: ["drame", "dramatique", "emotion", "émotion"],
      family: ["famille", "familial", "enfant", "enfants"],
      fantasy: ["fantastique", "magie", "sorcier", "fantasy"],
      horror: ["horreur", "peur", "frisson"],
      musical: ["musical", "musique", "danse"],
      romance: ["romance", "romantique", "amour"],
      science_fiction: ["science", "fiction", "spatial", "futur"],
      sport: ["sport", "competition", "compétition"],
      thriller: ["thriller", "suspense", "tension"],
    };
    const ranked = movieCatalog
      .map((film) => {
        let score = hashText(`${preferences}:${film.id}`) % 100;
        for (const genre of film.genres) {
          if (genreAliases[genre]?.some((alias) => preferenceWords.has(alias))) score += 1_000;
        }
        if (film.audience === "family" && [...preferenceWords].some((word) => ["famille", "familial", "enfant", "enfants"].includes(word))) score += 800;
        const decade = Math.floor(film.year / 10) * 10;
        if (preferences.includes(String(decade))) score += 700;
        return { film, score };
      })
      .sort((left, right) => right.score - left.score || left.film.id.localeCompare(right.film.id));
    return createMovieMimePack(setup, ranked.slice(0, setup.filmCount).map(({ film }) => film.id), "ai");
  }

  async generateComposedGameSpec(prompt: string): Promise<ComposedGameSpec> {
    const normalized = normalizedPrompt(prompt) || "Un jeu de soirée convivial";
    const hash = hashText(normalized);
    const themes: ComposedGameSpec["theme"][] = ["disco", "cosmic", "tropical", "mystery", "retro", "cozy"];
    const spec = structuredClone(cinemaCharadesSpec);
    spec.id = slugify(`composed_${normalized}_${hash.toString(36)}`).slice(0, 48);
    spec.title = titleCase(themeLabel(normalized, "Jeu surprise")).slice(0, 64);
    spec.description = `Un jeu social généré autour de « ${normalized} », assemblé avec des composants BoardForge validés.`.slice(0, 280);
    spec.theme = themes[hash % themes.length]!;
    const validation = validateComposedGameSpec(spec);
    if (!validation.ok) throw new Error(`The local provider produced an invalid ComposedGameSpec: ${JSON.stringify(validation.issues)}`);
    return validation.spec;
  }

  async reviewComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameReview> {
    const critique = await this.critiqueComposedGameSpec(spec, evidence);
    const suggestedPatch = await this.proposeComposedBalancePatch(spec, evidence, critique);
    return { critique, suggestedPatch };
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

  async generateGameSpec(brief: GameBrief): Promise<GameSpec> {
    const fingerprint = `${brief.template}|${normalizedPrompt(brief.prompt)}|${brief.players}|${brief.durationMinutes}`;
    const hash = hashText(fingerprint);
    const spec = brief.template === "hidden_roles"
      ? generateHiddenRolesSpec(brief, hash)
      : generateQuizVoteSpec(brief, hash);
    return validateGeneratedSpec(spec);
  }

  async designPlaytest(spec: GameSpec): Promise<PlaytestPlan> {
    return {
      personas: [
        { id: "careful", weight: 2 },
        { id: "bold", weight: 2 },
        { id: spec.template === "hidden_roles" ? "social" : "chaotic", weight: 1 },
      ],
      hypotheses: [
        "The game reaches a terminal state without a blocked phase.",
        "No single strategy dominates every seeded simulation.",
      ],
      simulations: 12,
    };
  }

  async critiquePlaytest(spec: GameSpec, _plan: PlaytestPlan): Promise<GameCritique> {
    return {
      summary: `${spec.title} is structurally playable. Live GPT-5.6 critique will replace this deterministic report.`,
      issues: [
        {
          code: "DEMO_DETERMINISTIC_REPORT",
          severity: "low",
          evidence: "The local provider intentionally returns reproducible demo evidence.",
        },
      ],
    };
  }

  async proposeBalancePatch(_spec: GameSpec, critique: GameCritique): Promise<BalancePatch> {
    return {
      summary: critique.summary,
      changes: [],
    };
  }
}

function requireParsedOutput<T>(value: T | null, operation: string): T {
  if (value === null) {
    throw new Error(`OpenAI returned no parsed output for ${operation}.`);
  }
  return value;
}

function parseJsonOutput(value: string, operation: string): unknown {
  const output = value.trim();
  if (!output) throw new Error(`OpenAI returned no JSON output for ${operation}.`);
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error(`OpenAI returned malformed JSON for ${operation}.`);
  }
}

function generationInstructions(brief: GameBrief): string {
  const templateRules = brief.template === "hidden_roles"
    ? [
        "Return exactly two role definitions: one crew role and one saboteur role.",
        "Create an original bluff scenario, objectives and mission prompt that strongly match the brief.",
        "Use 2 to 5 rounds and keep the scoring comprehensible for a short party game.",
      ]
    : [
        "Return 3 to 8 questions with a balanced mix of trivia and player_vote questions.",
        "Trivia must have plausible distractors, one correct option ID and a factually accurate explanation.",
        "Social votes must be playful, inclusive and strongly connected to the requested universe.",
      ];

  return [
    "You are BoardForge, a constrained social-game designer.",
    "Create an original, immediately playable GameSpec in the same language as the user's brief.",
    "Never output source code, scripts, formulas, URLs, dynamic instructions or executable content.",
    "The fixed TypeScript engine is authoritative; only fill the supplied schema.",
    `The requested player count (${brief.players}) must fall between minPlayers and maxPlayers.`,
    `Keep durationMinutes close to ${brief.durationMinutes}.`,
    "Use safe lowercase snake_case IDs beginning with a letter.",
    "All titles, prompts, objectives and explanations must respect the schema length limits.",
    ...templateRules,
  ].join("\n");
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

  async generateMovieMimePack(setupInput: MovieMimeSetup): Promise<MimeFilmPack> {
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

  private async generateCandidate(brief: GameBrief, repairContext?: string): Promise<GameSpec> {
    const userPrompt = [
      `Game family: ${brief.template}`,
      `Players: ${brief.players}`,
      `Target duration: ${brief.durationMinutes} minutes`,
      `Creator brief: ${normalizedPrompt(brief.prompt) || "Invent a welcoming social party game."}`,
      repairContext ? `Repair request: ${repairContext}` : "",
    ].filter(Boolean).join("\n");

    if (brief.template === "hidden_roles") {
      const response = await this.client.responses.parse({
        model: this.model,
        input: [
          { role: "system", content: generationInstructions(brief) },
          { role: "user", content: userPrompt },
        ],
        text: { format: zodTextFormat(hiddenRolesGameSpecSchema, "hidden_roles_game_spec") },
        max_output_tokens: 4_500,
      });
      return requireParsedOutput(response.output_parsed, "hidden-role GameSpec generation");
    }

    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        { role: "system", content: generationInstructions(brief) },
        { role: "user", content: userPrompt },
      ],
      text: { format: zodTextFormat(quizVoteGameSpecSchema, "quiz_vote_game_spec") },
      max_output_tokens: 5_500,
    });
    return requireParsedOutput(response.output_parsed, "quiz/vote GameSpec generation");
  }

  private async generateComposedCandidate(prompt: string, repairContext?: string): Promise<unknown> {
    const instructions = [
      "You are BoardForge, a constrained compiler for social and tabletop games.",
      "Turn the creator's prompt into one immediately playable ComposedGameSpec version 2.",
      "Return structured data only. Never emit code, scripts, formulas, regular expressions or executable instructions.",
      "Use only component, action, condition and effect kinds present in the supplied strict schema.",
      "Infer player bounds, duration, team structure and theme from the prompt; do not ask follow-up questions.",
      "For team games, invent two to six thematic team slots with distinct safe IDs, readable names and hex colors; real players will choose their slot in the lobby.",
      "Every team must contain at least one player. Use allowUnevenTeams when a valid 2-vs-1 or similar configuration is intended.",
      "Every phase must expose at least one reachable legal action and the game must have a reachable end_game effect.",
      "Private cards or prompts must use private decks and active_player or team audiences.",
      "Prefer two to six short phases and comprehensible scoring. Use safe lowercase snake_case IDs.",
      "The current room UI reliably supports headers, prompts, decks, choices, text input, timers, turns, rounds, teams, players, scores and outcomes.",
      "Use other mechanics only when they are essential to the requested game.",
      "Return one JSON object conforming exactly to the JSON Schema supplied in the user message.",
    ].join("\n");
    const schemaGuide = JSON.stringify(z.toJSONSchema(composedGameSpecSchema, { unrepresentable: "any" }));
    const startedAt = Date.now();
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content: `${instructions}\n\nRequired ComposedGameSpec JSON Schema:\n${schemaGuide}`,
        },
        {
          role: "user",
          content: [
            `Creator prompt: ${normalizedPrompt(prompt) || "Crée un jeu de soirée convivial et original."}`,
            repairContext ? `Repair these semantic issues: ${repairContext}` : "",
          ].join("\n\n"),
        },
      ],
      prompt_cache_key: "boardforge:composed-generation:v2",
      // JSON mode handles optional GameSpec fields; the strict Zod and semantic
      // validators below remain authoritative before the engine sees any data.
      text: { format: { type: "json_object" } },
      max_output_tokens: 8_000,
    });
    this.recordTelemetry("composed_generation", this.model, startedAt, response);
    return parseJsonOutput(response.output_text, "composed GameSpec generation");
  }

  async generateComposedGameSpec(prompt: string): Promise<ComposedGameSpec> {
    const first = await this.generateComposedCandidate(prompt);
    const validation = validateComposedGameSpec(first);
    if (validation.ok) return validation.spec;
    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    const repaired = await this.generateComposedCandidate(prompt, issues);
    const repairedValidation = validateComposedGameSpec(repaired);
    if (!repairedValidation.ok) throw new Error(`OpenAI produced an invalid ComposedGameSpec after repair: ${JSON.stringify(repairedValidation.issues)}`);
    return repairedValidation.spec;
  }

  async reviewComposedGameSpec(
    spec: ComposedGameSpec,
    evidence: ComposedBalanceEvidence,
  ): Promise<ComposedGameReview> {
    const startedAt = Date.now();
    const response = await this.client.responses.parse({
      model: this.reviewModel,
      input: [
        {
          role: "system",
          content: [
            "You are BoardForge's constrained playtest reviewer and balance editor.",
            "Review only the compact validated game structure and deterministic telemetry supplied by the server.",
            "Return the critique in the same language as the game.",
            "Every claim must cite supplied evidence or visible structure.",
            "Use verdict revise for any blocked simulation, private-information failure or unreachable ending.",
            "You may suggest at most one minimal patch using only an entry from adjustableParameters.",
            "Never add mechanics, IDs, executable content or targets absent from adjustableParameters.",
            "Return suggestedPatch as null when no safe evidence-backed adjustment is justified.",
            "Both critique.sourceSpecId and any patch.sourceSpecId must equal the supplied game ID.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(composedReviewContext(spec, evidence)) },
      ],
      prompt_cache_key: "boardforge:composed-review:v1",
      text: { format: zodTextFormat(composedGameReviewSchema, "composed_game_review") },
      max_output_tokens: 2_800,
    });
    this.recordTelemetry("composed_review", this.reviewModel, startedAt, response);
    const review = requireParsedOutput(response.output_parsed, "composed game review");
    if (review.critique.sourceSpecId !== spec.id) {
      throw new Error(`OpenAI critique targeted ${review.critique.sourceSpecId}, not ${spec.id}.`);
    }
    if (review.suggestedPatch && review.suggestedPatch.sourceSpecId !== spec.id) {
      throw new Error(`OpenAI balance patch targeted ${review.suggestedPatch.sourceSpecId}, not ${spec.id}.`);
    }
    return review;
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

  async generateGameSpec(brief: GameBrief): Promise<GameSpec> {
    const first = await this.generateCandidate(brief);
    const validation = validateGameSpec(first);
    if (validation.ok) return validation.spec;

    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    const repaired = await this.generateCandidate(
      brief,
      `The previous structured result failed semantic validation. Correct these issues without changing the requested concept: ${issues}`,
    );
    return validateGeneratedSpec(repaired);
  }

  async designPlaytest(spec: GameSpec): Promise<PlaytestPlan> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        {
          role: "system",
          content: "Design a compact deterministic playtest plan for the supplied GameSpec. Return only the structured plan. Personas are fixed simulation policies, not free-form agents.",
        },
        { role: "user", content: JSON.stringify(spec) },
      ],
      text: { format: zodTextFormat(playtestPlanSchema, "playtest_plan") },
      max_output_tokens: 1_200,
    });
    return requireParsedOutput(response.output_parsed, "playtest planning");
  }

  async critiquePlaytest(spec: GameSpec, plan: PlaytestPlan): Promise<GameCritique> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        {
          role: "system",
          content: "Critique the structural playability and likely balance of this validated GameSpec and playtest plan. Be concrete, concise and evidence-based. Return only the structured critique.",
        },
        { role: "user", content: JSON.stringify({ spec, plan }) },
      ],
      text: { format: zodTextFormat(gameCritiqueSchema, "game_critique") },
      max_output_tokens: 1_500,
    });
    return requireParsedOutput(response.output_parsed, "game critique");
  }

  async proposeBalancePatch(spec: GameSpec, critique: GameCritique): Promise<BalancePatch> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        {
          role: "system",
          content: "Propose a minimal bounded balance patch. Change only existing scalar fields; never add mechanics, executable content, IDs, templates, roles, questions or code. Return an empty changes array when no safe patch is justified.",
        },
        { role: "user", content: JSON.stringify({ spec, critique }) },
      ],
      text: { format: zodTextFormat(balancePatchSchema, "balance_patch") },
      max_output_tokens: 1_200,
    });
    return requireParsedOutput(response.output_parsed, "balance patch");
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
