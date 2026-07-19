import { describe, expect, it } from "vitest";
import {
  defaultDrawBattleSpec,
  defaultMovieMimeSpec,
  defaultSecondSenseSpec,
  defaultSoundCheckSpec,
  defaultWordTrapSpec,
  validateComposedGameSpec,
  type ComposedGameSpec,
} from "@boardforge/game-spec";
import { runComposedPlaytest, type GameNightTeam } from "@boardforge/game-engine";
import { adaptGameNightSpec } from "./game-night-spec";

const rankedSpecs = [defaultMovieMimeSpec, defaultWordTrapSpec, defaultDrawBattleSpec, defaultSoundCheckSpec];

function teams(count: number): GameNightTeam[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `night_team_${index + 1}`,
    name: `Night team ${index + 1}`,
    color: ["#ff5c5c", "#5b8cff", "#f4c84a", "#42c98b"][index],
    playerIds: [`player_${index + 1}`],
    captainPlayerId: `player_${index + 1}`,
  }));
}

describe("Game Night GameSpec adaptation", () => {
  for (const teamCount of [3, 4]) {
    it(`builds valid and playable ranked specs for ${teamCount} teams`, () => {
      for (const source of rankedSpecs) {
        const adapted = adaptGameNightSpec(source, teams(teamCount)) as ComposedGameSpec;
        const validation = validateComposedGameSpec(adapted);
        const roundConditions = adapted.rules.flatMap((rule) =>
          rule.conditions.filter((condition) => condition.kind === "round_at_least"),
        );
        const report = runComposedPlaytest(adapted, {
          simulations: 2,
          maxActions: 500,
          seed: `game-night-${source.experienceId}-${teamCount}`,
        });

        expect(validation.ok).toBe(true);
        expect(adapted.setup.teamPolicy?.teams).toHaveLength(teamCount);
        expect(adapted.setup.rounds % teamCount).toBe(0);
        expect(adapted.minPlayers).toBe(teamCount);
        expect(roundConditions.every((condition) => condition.round === adapted.setup.rounds + 1)).toBe(true);
        expect(report).toMatchObject({ status: "passed", completionRate: 1 });
      }
    });
  }

  it("does not mutate the stored blueprint or adapt an unsupported game", () => {
    const original = structuredClone(defaultMovieMimeSpec);

    adaptGameNightSpec(defaultMovieMimeSpec, teams(4));

    expect(defaultMovieMimeSpec).toEqual(original);
    expect(adaptGameNightSpec(defaultSecondSenseSpec, teams(4))).toBe(defaultSecondSenseSpec);
  });
});
