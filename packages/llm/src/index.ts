import {
  cinemaCharadesSpec,
  composedGameSpecSchema,
  type GameSpec,
  type ComposedGameSpec,
  type HiddenRolesGameSpec,
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

export interface LlmProvider {
  readonly name: string;
  generateComposedGameSpec(prompt: string): Promise<ComposedGameSpec>;
  generateGameSpec(brief: GameBrief): Promise<GameSpec>;
  designPlaytest(spec: GameSpec): Promise<PlaytestPlan>;
  critiquePlaytest(spec: GameSpec, plan: PlaytestPlan): Promise<GameCritique>;
  proposeBalancePatch(spec: GameSpec, critique: GameCritique): Promise<BalancePatch>;
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

export class OpenAiLlmProvider implements LlmProvider {
  readonly name: string;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = "gpt-5.6",
  ) {
    if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required for the OpenAI provider.");
    this.name = `openai:${model}`;
    this.client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
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
      repairContext ? `Repair the previous candidate using these semantic issues: ${repairContext}` : "",
    ].filter(Boolean).join("\n");
    const schemaGuide = JSON.stringify(z.toJSONSchema(composedGameSpecSchema, { unrepresentable: "any" }));
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "system", content: instructions },
        {
          role: "user",
          content: [
            `Creator prompt: ${normalizedPrompt(prompt) || "Crée un jeu de soirée convivial et original."}`,
            `Required ComposedGameSpec JSON Schema: ${schemaGuide}`,
          ].join("\n\n"),
        },
      ],
      // JSON mode handles optional GameSpec fields; the strict Zod and semantic
      // validators below remain authoritative before the engine sees any data.
      text: { format: { type: "json_object" } },
      max_output_tokens: 14_000,
    });
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
};

export function createLlmProvider(config?: LlmProviderConfig): LlmProvider {
  const selected = config?.provider ?? (config?.apiKey ? "openai" : "fake");
  if (selected === "fake") return new FakeLlmProvider();
  if (selected === "openai") {
    if (!config?.apiKey) throw new Error("LLM_PROVIDER=openai requires OPENAI_API_KEY.");
    return new OpenAiLlmProvider(config.apiKey, config.model ?? "gpt-5.6");
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${selected}`);
}
