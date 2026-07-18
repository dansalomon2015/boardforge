export type GameNightTeamDraft = { id: string; name: string; color: string };

export function validateGameNightDraft(hostName: string, teams: GameNightTeamDraft[]): string | null {
  if (!hostName.trim()) return "Tell us what your friends call you.";
  if (teams.length < 2 || teams.length > 4) return "A Game Night needs between two and four teams.";
  if (teams.some((team) => team.name.trim().length < 2)) return "Every team needs a name with at least two characters.";
  const names = teams.map((team) => team.name.trim().toLocaleLowerCase("en"));
  if (new Set(names).size !== names.length) return "Give every team a different name.";
  if (teams.some((team) => !/^#[0-9a-fA-F]{6}$/.test(team.color))) return "Every team needs a valid color.";
  if (new Set(teams.map((team) => team.color.toLowerCase())).size !== teams.length)
    return "Give every team its own color.";
  return null;
}
