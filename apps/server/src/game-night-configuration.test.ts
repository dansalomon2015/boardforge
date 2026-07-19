import { describe, expect, it } from "vitest";
import {
  defaultDrawBattleSpec,
  defaultMovieMimeSpec,
  defaultSoundCheckSpec,
  defaultWordTrapSpec,
} from "@boardforge/game-spec";
import type { GameNightTeam } from "@boardforge/game-engine";
import {
  configureGameNightSpec,
  defaultGameNightConfiguration,
  gameNightConfigurationDefinition,
} from "./game-night-configuration";
import { adaptGameNightSpec } from "./game-night-spec";

const teams: GameNightTeam[] = ["Moon Club", "Wild Cards", "Neon Crew", "Waves"].map((name, index) => ({
  id: `team_${index + 1}`,
  name,
  playerIds: [],
}));

describe("Game Night game configuration", () => {
  it.each([
    [defaultMovieMimeSpec, "movie", "movies"],
    [defaultWordTrapSpec, "word", "words"],
    [defaultDrawBattleSpec, "prompt", "prompts"],
    [defaultSoundCheckSpec, "sound", "sounds"],
  ])("exposes fair bounded controls for %s", (spec, singular, plural) => {
    const adapted = adaptGameNightSpec(spec, teams);
    const definition = gameNightConfigurationDefinition(adapted, teams.length);
    expect(definition).toMatchObject({
      rounds: { min: 8, step: 4, unitSingular: singular, unitPlural: plural },
      turnSeconds: { min: 30, max: 120, step: 15 },
    });
    expect(defaultGameNightConfiguration(adapted, teams.length)).toEqual({
      rounds: definition?.rounds.defaultValue,
      turnSeconds: definition?.turnSeconds.defaultValue,
    });
  });

  it("compiles selected rounds and timer duration into a validated GameSpec", () => {
    const configured = configureGameNightSpec(defaultDrawBattleSpec, teams, { rounds: 8, turnSeconds: 45 });
    expect(configured.template).toBe("composed");
    if (configured.template !== "composed") throw new Error("Expected a composed game.");
    expect(configured.setup.rounds).toBe(8);
    expect(configured.components.find((component) => component.kind === "timer")).toMatchObject({ seconds: 45 });
    expect(
      configured.rules.flatMap((rule) => rule.conditions).filter((condition) => condition.kind === "round_at_least"),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ round: 9 })]));
  });

  it("rejects unfair round counts and out-of-range timers", () => {
    expect(() => configureGameNightSpec(defaultWordTrapSpec, teams, { rounds: 7, turnSeconds: 60 })).toThrow(
      "valid number of rounds",
    );
    expect(() => configureGameNightSpec(defaultWordTrapSpec, teams, { rounds: 8, turnSeconds: 25 })).toThrow(
      "valid turn duration",
    );
  });
});
