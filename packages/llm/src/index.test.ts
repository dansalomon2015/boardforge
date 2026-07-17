import { describe, expect, it } from "vitest";
import { cinemaCharadesSpec, composedBalancePatchSchema } from "@boardforge/game-spec";
import {
  FakeLlmProvider,
  composedAdjustableParameters,
  composedGameCritiqueSchema,
  createLlmProvider,
} from "./index.js";

const provider = new FakeLlmProvider();

describe("bounded AI content provider", () => {
  it("selects providers explicitly without making a network request", () => {
    expect(createLlmProvider({ provider: "fake", apiKey: undefined, model: undefined }).name).toBe("procedural-local");
    expect(createLlmProvider({ provider: "openai", apiKey: "test-key", model: "gpt-5.6" }).name).toBe(
      "openai:gpt-5.6",
    );
    expect(() => createLlmProvider({ provider: "openai", apiKey: undefined, model: "gpt-5.6" })).toThrow(
      "OPENAI_API_KEY",
    );
  });

  it("selects a bounded movie mime pack from the audited catalog", async () => {
    const pack = await provider.generateMovieMimePack({
      themeId: "noir",
      filmCount: 8,
      preferences: "family comedies from the 1990s",
    });

    expect(pack.source).toBe("ai");
    expect(pack.films).toHaveLength(8);
    expect(new Set(pack.films.map((film) => film.id)).size).toBe(8);
    expect(pack.films.some((film) => film.genres.includes("comedy"))).toBe(true);
  });

  it("selects a bounded WordTrap pack from the audited catalog", async () => {
    const pack = await provider.generateWordTrapPack({ themeId: "disco", cardCount: 8, preferences: "food and travel" });
    expect(pack.source).toBe("ai");
    expect(pack.cards).toHaveLength(8);
    expect(new Set(pack.cards.map((card) => card.id)).size).toBe(8);
    expect(pack.cards.some((card) => card.category === "food" || card.category === "places")).toBe(true);
  });

  it("selects a bounded DrawBattle pack from the audited catalog", async () => {
    const pack = await provider.generateDrawBattlePack({ themeId: "arcade", promptCount: 8, preferences: "animals and fantasy" });
    expect(pack.source).toBe("ai");
    expect(pack.prompts).toHaveLength(8);
    expect(new Set(pack.prompts.map((prompt) => prompt.id)).size).toBe(8);
    expect(pack.prompts.some((prompt) => prompt.category === "animals" || prompt.category === "fantasy")).toBe(true);
  });

  it("selects a bounded SoundCheck pack from the audited catalog", async () => {
    const pack = await provider.generateSoundCheckPack({ themeId: "retro", promptCount: 8, preferences: "animals and music" });
    expect(pack.source).toBe("ai");
    expect(pack.prompts).toHaveLength(8);
    expect(new Set(pack.prompts.map((prompt) => prompt.id)).size).toBe(8);
    expect(pack.prompts.some((prompt) => prompt.category === "animals" || prompt.category === "music")).toBe(true);
  });

  it("generates a strictly bounded StoryChain content pack", async () => {
    const pack = await provider.generateStoryChainPack({ themeId: "cozy", mood: "mystery", length: "full", preferences: "a missing birthday cake at a grand hotel" });
    expect(pack.source).toBe("ai");
    expect(pack.twists).toHaveLength(12);
    expect(new Set(pack.twists.map((twist) => twist.requiredWord.toLowerCase())).size).toBe(12);
  });

  it("returns an allowlisted critique and balance patch", async () => {
    const evidence = {
      simulations: 24,
      completionRate: 1,
      averageActions: 14,
      failures: [],
    };
    const critique = await provider.critiqueComposedGameSpec(cinemaCharadesSpec, evidence);
    const patch = await provider.proposeComposedBalancePatch(cinemaCharadesSpec, evidence, critique);

    expect(composedGameCritiqueSchema.safeParse(critique).success).toBe(true);
    expect(critique.verdict).toBe("release_ready");
    expect(composedBalancePatchSchema.safeParse(patch).success).toBe(true);
    expect(patch.sourceSpecId).toBe(cinemaCharadesSpec.id);
    expect(patch.changes).toEqual([
      { kind: "set_timer_seconds", componentId: "mime_timer", seconds: 55 },
    ]);
    expect(composedAdjustableParameters(cinemaCharadesSpec)).toContainEqual({
      kind: "timer",
      componentId: "mime_timer",
      current: 60,
      min: 5,
      max: 900,
    });
  });
});
