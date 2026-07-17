import { z } from "zod";
import { composedThemeIdSchema, validateComposedGameSpec, type ComposedGameSpec, type ComposedTheme } from "./composed";

export const secondSenseTempoSchema = z.enum(["quickfire", "classic", "mindbreaker"]);
export const secondSenseSetupSchema = z
  .object({
    themeId: composedThemeIdSchema.default("cyberpunk"),
    tempo: secondSenseTempoSchema.default("classic"),
  })
  .strict();

export type SecondSenseTempo = z.infer<typeof secondSenseTempoSchema>;
export type SecondSenseSetupInput = z.input<typeof secondSenseSetupSchema>;

export const secondSenseRanges: Record<SecondSenseTempo, { minTargetMs: number; maxTargetMs: number; label: string }> =
  {
    quickfire: { minTargetMs: 800, maxTargetMs: 3_000, label: "Quickfire" },
    classic: { minTargetMs: 1_200, maxTargetMs: 6_000, label: "Classic pulse" },
    mindbreaker: { minTargetMs: 2_000, maxTargetMs: 9_000, label: "Mindbreaker" },
  };

function numberHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function createSecondSenseSpec(setupInput: SecondSenseSetupInput): ComposedGameSpec {
  const setup = secondSenseSetupSchema.parse(setupInput);
  const range = secondSenseRanges[setup.tempo];
  const theme: ComposedTheme = setup.themeId;
  const suffix = numberHash(`second-sense-v1:${setup.themeId}:${setup.tempo}`).toString(36);
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `second_sense_${suffix}`.slice(0, 48),
    template: "composed",
    title: "Second Sense",
    description:
      "Feel the target time without a clock, stop on instinct, and survive the cut until only one player remains.",
    theme,
    minPlayers: 2,
    maxPlayers: 12,
    suggestedDurationMinutes: 8,
    setup: { mode: "individual", rounds: 12, startingPhaseId: "sense", startingPlayer: "first" },
    variables: [],
    choices: [],
    clues: [],
    reveals: [],
    orderingItems: [],
    matchingItems: [],
    decks: [],
    boards: [],
    resources: [],
    randomizers: [],
    media: [],
    components: [
      {
        id: "game_header",
        kind: "header",
        audience: "public",
        eyebrow: "BoardForge Original",
        title: { kind: "literal", value: "Second Sense" },
        description: { kind: "literal", value: "No countdown. No second chance. Just your sense of time." },
        icon: "◉",
      },
      {
        id: "sense_board",
        kind: "second_sense",
        audience: "public",
        minTargetMs: range.minTargetMs,
        maxTargetMs: range.maxTargetMs,
        precisionMs: 10,
      },
      { id: "players", kind: "players", audience: "public" },
      {
        id: "outcome",
        kind: "outcome",
        audience: "public",
        title: { kind: "literal", value: "Time champion" },
        description: { kind: "literal", value: "The final pulse belongs to one player." },
      },
    ],
    actions: [
      {
        id: "start_clock",
        label: "Start",
        kind: "timing_start",
        actor: "any_player",
        oncePerPhase: false,
        secondSenseId: "sense_board",
        effects: [{ kind: "start_timing", secondSenseId: "sense_board" }],
      },
      {
        id: "stop_clock",
        label: "Stop",
        kind: "timing_stop",
        actor: "any_player",
        oncePerPhase: false,
        secondSenseId: "sense_board",
        effects: [{ kind: "stop_timing", secondSenseId: "sense_board" }],
      },
      {
        id: "next_stage",
        label: "Next target",
        kind: "timing_advance",
        actor: "host",
        oncePerPhase: false,
        secondSenseId: "sense_board",
        effects: [{ kind: "advance_timing_round", secondSenseId: "sense_board" }],
      },
    ],
    rules: [],
    phases: [
      {
        id: "sense",
        title: "Trust your internal clock",
        componentIds: ["game_header", "sense_board", "players", "outcome"],
        actionIds: ["start_clock", "stop_clock", "next_stage"],
        completionMode: "manual",
        completionConditions: [],
        onComplete: [],
      },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new Error(
      `Invalid Second Sense GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`,
    );
  return validation.spec;
}

export const defaultSecondSenseSpec = createSecondSenseSpec({ themeId: "cyberpunk", tempo: "classic" });
