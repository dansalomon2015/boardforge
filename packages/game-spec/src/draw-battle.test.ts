import { describe, expect, it } from "vitest";
import { validateComposedGameSpec } from "./composed";
import {
  createDrawBattlePack,
  createDrawBattleSpec,
  createRandomDrawBattlePack,
  drawBattleCatalog,
} from "./draw-battle";

describe("DrawBattle game", () => {
  it("ships an English audited catalogue with stable unique IDs", () => {
    expect(drawBattleCatalog.length).toBeGreaterThanOrEqual(60);
    expect(new Set(drawBattleCatalog.map((prompt) => prompt.id)).size).toBe(drawBattleCatalog.length);
    expect(drawBattleCatalog.every((prompt) => /^[\x20-\x7E]+$/.test(prompt.prompt))).toBe(true);
  });

  it("creates deterministic packs and rejects unknown or duplicate prompts", () => {
    const setup = { themeId: "arcade" as const, promptCount: 10 };
    expect(createRandomDrawBattlePack(setup, "same-table")).toEqual(createRandomDrawBattlePack(setup, "same-table"));
    expect(() =>
      createDrawBattlePack(
        { ...setup, promptCount: 6 },
        ["bicycle", "bicycle", "pizza", "dragon", "robot", "volcano"],
        "ai",
      ),
    ).toThrow("duplicate");
    expect(() =>
      createDrawBattlePack(
        { ...setup, promptCount: 6 },
        ["bicycle", "umbrella", "pizza", "dragon", "robot", "invented"],
        "ai",
      ),
    ).toThrow("Unknown DrawBattle prompt");
  });

  it("compiles a captain-led private prompt and live sketch loop", () => {
    const spec = createDrawBattleSpec(createRandomDrawBattlePack({ themeId: "candy", promptCount: 10 }, "compile"));
    expect(validateComposedGameSpec(spec).ok).toBe(true);
    expect(spec.phases.map((phase) => phase.actionIds)).toEqual([
      ["select_artist"],
      ["draw_prompt"],
      ["pass_prompt", "submit_guess", "draw_stroke"],
    ]);
    expect(spec.actions.find((action) => action.id === "submit_guess")?.answerDeckId).toBe("prompts");
  });
});
