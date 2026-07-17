import { describe, expect, it } from "vitest";
import { createRandomStoryChainPack, createStoryChainPack, createStoryChainSpec, storyRounds } from "./story-chain";

describe("StoryChain game", () => {
  it("creates deterministic, bounded packs for every story length", () => {
    for (const length of ["quick", "full", "epic"] as const) {
      const setup = { themeId: "cozy" as const, mood: "mystery" as const, length };
      const first = createRandomStoryChainPack(setup, "same-table");
      expect(first).toEqual(createRandomStoryChainPack(setup, "same-table"));
      expect(first.twists).toHaveLength(storyRounds[length]);
      expect(new Set(first.twists.map((twist) => twist.requiredWord.toLowerCase())).size).toBe(first.twists.length);
    }
  });

  it("rejects repeated constraints and compiles a cooperative spec", () => {
    const setup = { themeId: "mystery" as const, mood: "spooky" as const, length: "quick" as const };
    const random = createRandomStoryChainPack(setup, "compile");
    expect(() =>
      createStoryChainPack(
        setup,
        {
          title: random.title,
          opening: random.opening,
          twists: random.twists.map((twist) => ({ ...twist, requiredWord: "echo" })),
        },
        "ai",
      ),
    ).toThrow("repeat");
    const spec = createStoryChainSpec(random);
    expect(spec.setup.mode).toBe("cooperative");
    expect(spec.minPlayers).toBe(2);
    expect(spec.actions.find((action) => action.id === "continue_story")?.requiredWordDeckId).toBe("twists");
  });

  it("rejects a secret word that is already visible in the premise", () => {
    const setup = { themeId: "cozy" as const, mood: "family" as const, length: "quick" as const };
    const random = createRandomStoryChainPack(setup, "public-premise");
    const exposed = random.twists.map((twist, index) => (index === 0 ? { ...twist, requiredWord: "birthday" } : twist));
    expect(() =>
      createStoryChainPack(setup, { title: "The Birthday Surprise", opening: random.opening, twists: exposed }, "ai"),
    ).toThrow("already visible");
  });
});
