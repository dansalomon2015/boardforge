import { validateComposedGameSpec, type BoardGameSpec, type ComposedGameSpec } from "@boardforge/game-spec";
import { GameNightRuleError, type GameNightTeam } from "@boardforge/game-engine";

const rankedExperienceIds = new Set(["movie_mime", "word_trap", "draw_battle", "sound_check"]);
const fallbackTeamColors = ["#ff5c5c", "#5b8cff", "#f4c84a", "#42c98b"];

export function isRankedGameNightSpec(spec: BoardGameSpec): spec is ComposedGameSpec {
  return spec.template === "composed" && rankedExperienceIds.has(spec.experienceId);
}

export function adaptGameNightSpec(spec: BoardGameSpec, teams: GameNightTeam[]): BoardGameSpec {
  if (!isRankedGameNightSpec(spec) || spec.setup.mode !== "teams" || !spec.setup.teamPolicy) return spec;
  if (teams.length < 2 || teams.length > 4) return spec;

  const originalRounds = spec.setup.rounds;
  const balancedRounds = Math.max(teams.length, originalRounds - (originalRounds % teams.length));
  const candidate: ComposedGameSpec = {
    ...structuredClone(spec),
    minPlayers: Math.max(spec.minPlayers, teams.length),
    ...(spec.suggestedDurationMinutes
      ? {
          suggestedDurationMinutes: Math.max(
            2,
            Math.round((spec.suggestedDurationMinutes * balancedRounds) / originalRounds),
          ),
        }
      : {}),
    setup: {
      ...structuredClone(spec.setup),
      rounds: balancedRounds,
      teamPolicy: {
        ...structuredClone(spec.setup.teamPolicy),
        teams: teams.map((team, index) => ({
          id: `game_team_${index + 1}`,
          name: `Team ${index + 1}`,
          color: team.color ?? fallbackTeamColors[index]!,
        })),
      },
    },
    rules: spec.rules.map((rule) => ({
      ...structuredClone(rule),
      conditions: rule.conditions.map((condition) =>
        condition.kind === "round_at_least" && condition.round === originalRounds + 1
          ? { ...condition, round: balancedRounds + 1 }
          : condition,
      ),
    })),
  };
  const validation = validateComposedGameSpec(candidate);
  if (!validation.ok) {
    throw new GameNightRuleError(
      `This game cannot be adapted to the current teams: ${validation.issues[0]?.message ?? "invalid GameSpec"}`,
    );
  }
  return validation.spec;
}
