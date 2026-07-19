import type { GameNightView } from "@boardforge/shared";

type GameNightTeam = GameNightView["teams"][number];

export type RankedGameNightTeam = GameNightTeam & { rank: number };

export function rankGameNightTeams(teams: GameNightTeam[]): RankedGameNightTeam[] {
  const sorted = [...teams].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  return sorted.map((team) => ({
    ...team,
    rank: sorted.findIndex((candidate) => candidate.score === team.score) + 1,
  }));
}
