import { describe, expect, it } from "vitest";
import { createSecondSenseSpec, defaultSecondSenseSpec, secondSenseRanges } from "./second-sense";

describe("Second Sense game", () => {
  it("builds every tempo as a strictly validated audited game", () => {
    for (const tempo of ["quickfire", "classic", "mindbreaker"] as const) {
      const spec = createSecondSenseSpec({ themeId: "cyberpunk", tempo });
      const board = spec.components.find((component) => component.kind === "second_sense");
      expect(board?.kind === "second_sense" ? { min: board.minTargetMs, max: board.maxTargetMs } : null).toEqual({
        min: secondSenseRanges[tempo].minTargetMs,
        max: secondSenseRanges[tempo].maxTargetMs,
      });
    }
  });

  it("supports a multiplayer elimination room without teams", () => {
    expect(defaultSecondSenseSpec.minPlayers).toBe(2);
    expect(defaultSecondSenseSpec.maxPlayers).toBe(12);
    expect(defaultSecondSenseSpec.setup.mode).toBe("individual");
    expect(defaultSecondSenseSpec.actions.map((action) => action.kind)).toEqual(["timing_start", "timing_stop", "timing_advance"]);
  });
});
