import { validateComposedGameSpec, type BoardGameSpec, type ComposedGameSpec } from "@boardforge/game-spec";
import { GameNightRuleError, type GameNightGameConfiguration, type GameNightTeam } from "@boardforge/game-engine";
import type { GameNightGameConfigurationDefinition } from "@boardforge/shared";
import { adaptGameNightSpec } from "./game-night-spec";

const contentLabels: Record<string, { label: string; singular: string; plural: string }> = {
  movie_mime: { label: "Movies in this game", singular: "movie", plural: "movies" },
  word_trap: { label: "Words in this game", singular: "word", plural: "words" },
  draw_battle: { label: "Prompts in this game", singular: "prompt", plural: "prompts" },
  sound_check: { label: "Sounds in this game", singular: "sound", plural: "sounds" },
};

function timerSeconds(spec: ComposedGameSpec): number | null {
  const timer = spec.components.find((component) => component.kind === "timer");
  return timer?.kind === "timer" ? timer.seconds : null;
}

export function gameNightConfigurationDefinition(
  spec: BoardGameSpec,
  teamCount: number,
): GameNightGameConfigurationDefinition | null {
  if (spec.template !== "composed" || teamCount < 2) return null;
  const seconds = timerSeconds(spec);
  const labels = contentLabels[spec.experienceId];
  if (!seconds || !labels) return null;
  const maxRounds = spec.setup.rounds - (spec.setup.rounds % teamCount);
  const minRounds = Math.min(maxRounds, teamCount * 2);
  return {
    rounds: {
      label: labels.label,
      unitSingular: labels.singular,
      unitPlural: labels.plural,
      min: minRounds,
      max: maxRounds,
      step: teamCount,
      defaultValue: maxRounds,
    },
    turnSeconds: {
      label: "Time per turn",
      min: 30,
      max: 120,
      step: 15,
      defaultValue: seconds,
    },
  };
}

export function defaultGameNightConfiguration(
  spec: BoardGameSpec,
  teamCount: number,
): GameNightGameConfiguration | null {
  const definition = gameNightConfigurationDefinition(spec, teamCount);
  return definition
    ? { rounds: definition.rounds.defaultValue, turnSeconds: definition.turnSeconds.defaultValue }
    : null;
}

export function validateGameNightConfiguration(
  definition: GameNightGameConfigurationDefinition,
  configuration: GameNightGameConfiguration,
): GameNightGameConfiguration {
  const validRounds =
    Number.isInteger(configuration.rounds) &&
    configuration.rounds >= definition.rounds.min &&
    configuration.rounds <= definition.rounds.max &&
    (configuration.rounds - definition.rounds.min) % definition.rounds.step === 0;
  if (!validRounds) throw new GameNightRuleError("Choose a valid number of rounds for this Game Night.");
  const validTurnSeconds =
    Number.isInteger(configuration.turnSeconds) &&
    configuration.turnSeconds >= definition.turnSeconds.min &&
    configuration.turnSeconds <= definition.turnSeconds.max &&
    (configuration.turnSeconds - definition.turnSeconds.min) % definition.turnSeconds.step === 0;
  if (!validTurnSeconds) throw new GameNightRuleError("Choose a valid turn duration for this game.");
  return structuredClone(configuration);
}

export function configureGameNightSpec(
  spec: BoardGameSpec,
  teams: GameNightTeam[],
  configuration?: GameNightGameConfiguration | undefined,
): BoardGameSpec {
  const adapted = adaptGameNightSpec(spec, teams);
  const definition = gameNightConfigurationDefinition(adapted, teams.length);
  if (!definition || adapted.template !== "composed") return adapted;
  const selected = validateGameNightConfiguration(
    definition,
    configuration ?? {
      rounds: definition.rounds.defaultValue,
      turnSeconds: definition.turnSeconds.defaultValue,
    },
  );
  const previousRounds = adapted.setup.rounds;
  const previousSeconds = definition.turnSeconds.defaultValue;
  const candidate: ComposedGameSpec = {
    ...structuredClone(adapted),
    ...(adapted.suggestedDurationMinutes
      ? {
          suggestedDurationMinutes: Math.max(
            2,
            Math.round(
              adapted.suggestedDurationMinutes *
                (selected.rounds / previousRounds) *
                (selected.turnSeconds / previousSeconds),
            ),
          ),
        }
      : {}),
    setup: { ...structuredClone(adapted.setup), rounds: selected.rounds },
    components: adapted.components.map((component) =>
      component.kind === "timer"
        ? { ...structuredClone(component), seconds: selected.turnSeconds }
        : structuredClone(component),
    ),
    rules: adapted.rules.map((rule) => ({
      ...structuredClone(rule),
      conditions: rule.conditions.map((condition) =>
        condition.kind === "round_at_least" && condition.round === previousRounds + 1
          ? { ...condition, round: selected.rounds + 1 }
          : condition,
      ),
    })),
  };
  const validation = validateComposedGameSpec(candidate);
  if (!validation.ok) {
    throw new GameNightRuleError(
      `This game configuration is invalid: ${validation.issues[0]?.message ?? "invalid GameSpec"}`,
    );
  }
  return validation.spec;
}
