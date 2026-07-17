import { describe, expect, it } from "vitest";
import { validateComposedGameSpec } from "./composed";
import { createRandomWordTrapPack, createWordTrapPack, createWordTrapSpec, wordTrapCatalog } from "./word-trap";

describe("WordTrap game", () => {
  it("ships an audited catalogue with stable unique IDs and five traps per card", () => {
    expect(wordTrapCatalog.length).toBeGreaterThanOrEqual(50);
    expect(new Set(wordTrapCatalog.map((card) => card.id)).size).toBe(wordTrapCatalog.length);
    expect(wordTrapCatalog.every((card) => card.forbidden.length === 5)).toBe(true);
  });

  it("creates deterministic packs and rejects unsafe catalogue references", () => {
    const setup = { themeId: "disco" as const, cardCount: 10 };
    expect(createRandomWordTrapPack(setup, "same-party")).toEqual(createRandomWordTrapPack(setup, "same-party"));
    expect(() =>
      createWordTrapPack({ ...setup, cardCount: 6 }, ["pizza", "pizza", "coffee", "robot", "paris", "ghost"], "ai"),
    ).toThrow("duplicate");
    expect(() =>
      createWordTrapPack({ ...setup, cardCount: 6 }, ["pizza", "coffee", "robot", "paris", "ghost", "invented"], "ai"),
    ).toThrow("Unknown WordTrap card");
  });

  it("compiles a captain-led loop with an opponent buzzer", () => {
    const spec = createWordTrapSpec(createRandomWordTrapPack({ themeId: "cosmic", cardCount: 10 }, "compile"));
    expect(validateComposedGameSpec(spec).ok).toBe(true);
    expect(spec.phases.map((phase) => phase.actionIds)).toEqual([
      ["select_clue_giver"],
      ["draw_word"],
      ["word_guessed", "word_passed", "forbidden_called"],
    ]);
    expect(spec.actions.find((action) => action.id === "forbidden_called")?.actor).toBe("opponents");
  });
});
