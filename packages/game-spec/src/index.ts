import { z } from "zod";
import type { ComposedGameSpec } from "./composed";
export * from "./composed";
export * from "./composed-fixtures";
export * from "./balance-patch";
export * from "./movie-mime";
export * from "./word-trap";

const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/).max(48);
const shortTextSchema = z.string().trim().min(1).max(180);

const baseFields = {
  schemaVersion: z.literal(1),
  id: idSchema,
  title: z.string().trim().min(2).max(64),
  description: z.string().trim().min(8).max(280),
  minPlayers: z.number().int().min(2).max(12),
  maxPlayers: z.number().int().min(2).max(12),
  durationMinutes: z.number().int().min(5).max(45),
  accent: z.enum(["violet", "coral", "cyan", "lime"]),
};

const hiddenRoleSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(2).max(32),
    team: z.enum(["crew", "saboteur"]),
    objective: shortTextSchema,
  })
  .strict();

export const hiddenRolesGameSpecSchema = z
  .object({
    ...baseFields,
    template: z.literal("hidden_roles"),
    rounds: z.number().int().min(1).max(5),
    roles: z.array(hiddenRoleSchema).min(2).max(8),
    missionPrompt: shortTextSchema,
    discussionSeconds: z.number().int().min(15).max(180),
    scoring: z
      .object({
        crewMissionPoints: z.number().int().min(1).max(5),
        saboteurMissionPoints: z.number().int().min(1).max(5),
        correctVoteBonus: z.number().int().min(0).max(3),
      })
      .strict(),
  })
  .strict();

const triviaQuestionSchema = z
  .object({
    id: idSchema,
    type: z.literal("trivia"),
    prompt: shortTextSchema,
    options: z
      .array(
        z
          .object({
            id: idSchema,
            label: z.string().trim().min(1).max(90),
          })
          .strict(),
      )
      .min(2)
      .max(5),
    correctOptionId: idSchema,
    explanation: shortTextSchema,
  })
  .strict();

const playerVoteQuestionSchema = z
  .object({
    id: idSchema,
    type: z.literal("player_vote"),
    prompt: shortTextSchema,
    explanation: shortTextSchema,
  })
  .strict();

export const quizVoteGameSpecSchema = z
  .object({
    ...baseFields,
    template: z.literal("quiz_vote"),
    answerSeconds: z.number().int().min(10).max(120),
    questions: z
      .array(z.discriminatedUnion("type", [triviaQuestionSchema, playerVoteQuestionSchema]))
      .min(2)
      .max(12),
    scoring: z
      .object({
        correctAnswerPoints: z.number().int().min(1).max(10),
        popularVotePoints: z.number().int().min(0).max(10),
      })
      .strict(),
  })
  .strict();

export const gameSpecSchema = z.discriminatedUnion("template", [
  hiddenRolesGameSpecSchema,
  quizVoteGameSpecSchema,
]);

export type HiddenRolesGameSpec = z.infer<typeof hiddenRolesGameSpecSchema>;
export type QuizVoteGameSpec = z.infer<typeof quizVoteGameSpecSchema>;
export type QuizVoteQuestion = QuizVoteGameSpec["questions"][number];
export type GameSpec = z.infer<typeof gameSpecSchema>;
export type BoardGameSpec = GameSpec | ComposedGameSpec;

export type ValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type GameSpecValidation =
  | { ok: true; spec: GameSpec }
  | { ok: false; issues: ValidationIssue[] };

function semanticIssues(spec: GameSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (spec.minPlayers > spec.maxPlayers) {
    issues.push({
      code: "PLAYER_RANGE_INVALID",
      path: "minPlayers",
      message: "minPlayers must be less than or equal to maxPlayers.",
    });
  }

  if (spec.template === "hidden_roles") {
    const teams = new Set(spec.roles.map((role) => role.team));
    if (!teams.has("crew") || !teams.has("saboteur")) {
      issues.push({
        code: "MISSING_TEAM",
        path: "roles",
        message: "Hidden-role games require at least one crew and one saboteur role definition.",
      });
    }

    const roleIds = spec.roles.map((role) => role.id);
    if (new Set(roleIds).size !== roleIds.length) {
      issues.push({ code: "DUPLICATE_ROLE_ID", path: "roles", message: "Role IDs must be unique." });
    }
  } else {
    const questionIds = spec.questions.map((question) => question.id);
    if (new Set(questionIds).size !== questionIds.length) {
      issues.push({
        code: "DUPLICATE_QUESTION_ID",
        path: "questions",
        message: "Question IDs must be unique.",
      });
    }

    spec.questions.forEach((question, index) => {
      if (question.type === "trivia") {
        const optionIds = question.options.map((option) => option.id);
        if (new Set(optionIds).size !== optionIds.length) {
          issues.push({
            code: "DUPLICATE_OPTION_ID",
            path: `questions.${index}.options`,
            message: "Option IDs must be unique within a question.",
          });
        }
        if (!optionIds.includes(question.correctOptionId)) {
          issues.push({
            code: "UNKNOWN_CORRECT_OPTION",
            path: `questions.${index}.correctOptionId`,
            message: "The correct option must reference an option in the same question.",
          });
        }
      }
    });
  }

  return issues;
}

export function validateGameSpec(input: unknown): GameSpecValidation {
  const parsed = gameSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "SCHEMA_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const issues = semanticIssues(parsed.data);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, spec: parsed.data };
}

export const spaceHeistSpec: HiddenRolesGameSpec = {
  schemaVersion: 1,
  id: "space_heist",
  template: "hidden_roles",
  title: "Space Heist",
  description: "Un équipage prépare un casse spatial pendant que des saboteurs infiltrés font échouer les missions.",
  minPlayers: 2,
  maxPlayers: 8,
  durationMinutes: 15,
  accent: "violet",
  rounds: 3,
  roles: [
    {
      id: "crew",
      name: "Crewmate",
      team: "crew",
      objective: "Réussissez au moins deux missions et identifiez les saboteurs.",
    },
    {
      id: "saboteur",
      name: "Saboteur",
      team: "saboteur",
      objective: "Faites échouer au moins deux missions sans être identifié.",
    },
  ],
  missionPrompt: "Choisissez secrètement de sécuriser la mission ou, si vous êtes saboteur, de la compromettre.",
  discussionSeconds: 45,
  scoring: {
    crewMissionPoints: 1,
    saboteurMissionPoints: 1,
    correctVoteBonus: 1,
  },
};

export const partyPulseSpec: QuizVoteGameSpec = {
  schemaVersion: 1,
  id: "party_pulse",
  template: "quiz_vote",
  title: "Party Pulse",
  description: "Un quiz rapide mélange culture pop et votes sociaux pour révéler l'énergie du groupe.",
  minPlayers: 2,
  maxPlayers: 10,
  durationMinutes: 10,
  accent: "coral",
  answerSeconds: 30,
  questions: [
    {
      id: "mars_day",
      type: "trivia",
      prompt: "Combien de temps dure approximativement une journée sur Mars ?",
      options: [
        { id: "twenty_four", label: "24 h 39 min" },
        { id: "thirty", label: "30 heures" },
        { id: "forty_eight", label: "48 heures" },
      ],
      correctOptionId: "twenty_four",
      explanation: "Le sol martien dure environ 24 heures et 39 minutes.",
    },
    {
      id: "alien_diplomat",
      type: "player_vote",
      prompt: "Qui serait le meilleur diplomate face à une civilisation extraterrestre ?",
      explanation: "Le groupe vote pour la personne qui garderait le mieux son calme au premier contact.",
    },
    {
      id: "octopus_hearts",
      type: "trivia",
      prompt: "Combien de cœurs possède une pieuvre ?",
      options: [
        { id: "one", label: "Un" },
        { id: "two", label: "Deux" },
        { id: "three", label: "Trois" },
        { id: "eight", label: "Huit" },
      ],
      correctOptionId: "three",
      explanation: "Une pieuvre possède trois cœurs : deux branchiaux et un systémique.",
    },
  ],
  scoring: {
    correctAnswerPoints: 2,
    popularVotePoints: 1,
  },
};

export const demoGameSpecs = [spaceHeistSpec, partyPulseSpec] as const;

for (const fixture of demoGameSpecs) {
  const result = validateGameSpec(fixture);
  if (!result.ok) {
    throw new Error(`Invalid built-in GameSpec ${fixture.id}: ${JSON.stringify(result.issues)}`);
  }
}
