import { describe, expect, it } from "vitest";
import { validateComposedGameSpec } from "./composed";
import {
  createRandomSoundCheckPack,
  createSoundCheckPack,
  createSoundCheckSpec,
  soundCheckCatalog,
} from "./sound-check";

describe("SoundCheck game", () => {
  it("ships an English audited catalogue with stable unique IDs", () => {
    expect(soundCheckCatalog.length).toBeGreaterThanOrEqual(60);
    expect(new Set(soundCheckCatalog.map((prompt) => prompt.id)).size).toBe(soundCheckCatalog.length);
    expect(soundCheckCatalog.every((prompt) => /^[\x20-\x7E]+$/.test(prompt.answer))).toBe(true);
  });

  it("creates deterministic packs and rejects unknown or duplicate prompts", () => {
    const setup = { themeId: "retro" as const, promptCount: 6 };
    expect(createRandomSoundCheckPack(setup, "same-room")).toEqual(createRandomSoundCheckPack(setup, "same-room"));
    expect(() =>
      createSoundCheckPack(
        setup,
        ["cat_purring", "cat_purring", "doorbell", "thunderstorm", "race_car", "drum_solo"],
        "ai",
      ),
    ).toThrow("duplicate");
    expect(() =>
      createSoundCheckPack(
        setup,
        ["cat_purring", "dog_barking", "doorbell", "thunderstorm", "race_car", "invented"],
        "ai",
      ),
    ).toThrow("Unknown SoundCheck prompt");
  });

  it("compiles a captain-led private performance and open guessing loop", () => {
    const spec = createSoundCheckSpec(createRandomSoundCheckPack({ themeId: "cosmic", promptCount: 10 }, "compile"));
    expect(validateComposedGameSpec(spec).ok).toBe(true);
    expect(spec.phases.map((phase) => phase.actionIds)).toEqual([
      ["select_performer"],
      ["draw_sound"],
      ["pass_sound", "submit_guess"],
    ]);
    expect(spec.actions.find((action) => action.id === "submit_guess")?.answerDeckId).toBe("sounds");
  });
});
