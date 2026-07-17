import { describe, expect, it } from "vitest";
import { createWordDuelSpec, defaultWordDuelSpec, wordDuelRanges } from "./word-duel";

describe("WordDuel game", () => {
  it("compiles every bounded difficulty as an exact two-player game", () => {
    for (const difficulty of ["easy", "classic", "expert"] as const) {
      const spec = createWordDuelSpec({ themeId: "minimal", difficulty });
      const board = spec.components.find((component) => component.kind === "word_duel");
      expect(spec.minPlayers).toBe(2);
      expect(spec.maxPlayers).toBe(2);
      expect(board?.kind === "word_duel" ? { min: board.minLength, max: board.maxLength } : null).toEqual({ min: wordDuelRanges[difficulty].min, max: wordDuelRanges[difficulty].max });
    }
  });

  it("uses only audited secret-word, letter and full-word actions", () => {
    expect(defaultWordDuelSpec.actions.map((action) => action.kind)).toEqual(["secret_word", "letter_guess", "word_guess"]);
    expect(defaultWordDuelSpec.setup.mode).toBe("individual");
  });
});
