import { describe, expect, it } from "vitest";
import {
  createMovieMimeSpec,
  createRandomMovieMimePack,
} from "@boardforge/game-spec";
import { runComposedPlaytest } from "./playtest";

describe("movie mime release gate", () => {
  it("completes every simulation without exposing resolution before a card is drawn", () => {
    const pack = createRandomMovieMimePack(
      { themeId: "noir", filmCount: 20, preferences: "grands classiques accessibles" },
      "release-gate",
    );
    const report = runComposedPlaytest(createMovieMimeSpec(pack), {
      simulations: 24,
      seed: "movie-mime-release",
    });

    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });
});
