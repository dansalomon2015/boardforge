import { describe, expect, it } from "vitest";
import { cinemaCharadesSpec, composedBalancePatchSchema, validateGameSpec } from "@boardforge/game-spec";
import {
  FakeLlmProvider,
  composedAdjustableParameters,
  composedGameCritiqueSchema,
  composedGameReviewSchema,
  createLlmProvider,
  type GameBrief,
} from "./index.js";

const provider = new FakeLlmProvider();

describe("procedural local GameSpec compiler", () => {
  it("selects providers explicitly without making a network request", () => {
    expect(createLlmProvider({ provider: "fake", apiKey: undefined, model: undefined }).name).toBe("procedural-local");
    expect(createLlmProvider({ provider: "openai", apiKey: "test-key", model: "gpt-5.6" }).name).toBe(
      "openai:gpt-5.6",
    );
    expect(() => createLlmProvider({ provider: "openai", apiKey: undefined, model: "gpt-5.6" })).toThrow(
      "OPENAI_API_KEY",
    );
  });

  it("produces the same validated spec for the same brief", async () => {
    const brief: GameBrief = {
      template: "hidden_roles",
      prompt: "Une enquête dans un manoir hanté avec un coupable infiltré",
      players: 6,
      durationMinutes: 20,
    };

    const first = await provider.generateGameSpec(brief);
    const second = await provider.generateGameSpec(brief);

    expect(second).toEqual(first);
    expect(validateGameSpec(first).ok).toBe(true);
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

  it("changes hidden-role content when the requested universe changes", async () => {
    const common = { template: "hidden_roles" as const, players: 6, durationMinutes: 20 };
    const pirate = await provider.generateGameSpec({ ...common, prompt: "Mutinerie pirate autour d'un trésor maudit" });
    const fantasy = await provider.generateGameSpec({ ...common, prompt: "Royaume fantasy protégé par des dragons et de la magie" });

    expect(pirate.title).not.toBe(fantasy.title);
    expect(pirate.template).toBe("hidden_roles");
    expect(fantasy.template).toBe("hidden_roles");
    if (pirate.template === "hidden_roles" && fantasy.template === "hidden_roles") {
      expect(pirate.roles.map((role) => role.name)).not.toEqual(fantasy.roles.map((role) => role.name));
      expect(pirate.missionPrompt).not.toBe(fantasy.missionPrompt);
    }
  });

  it("builds a prompt-themed quiz with a different deterministic question mix", async () => {
    const common = { template: "quiz_vote" as const, players: 5, durationMinutes: 18 };
    const cinema = await provider.generateGameSpec({ ...common, prompt: "Soirée cinéma et héros improbables" });
    const travel = await provider.generateGameSpec({ ...common, prompt: "Tour du monde entre amis et aventures de voyage" });

    expect(cinema.title).not.toBe(travel.title);
    expect(cinema.template).toBe("quiz_vote");
    expect(travel.template).toBe("quiz_vote");
    if (cinema.template === "quiz_vote" && travel.template === "quiz_vote") {
      expect(cinema.questions.map((question) => question.prompt)).not.toEqual(
        travel.questions.map((question) => question.prompt),
      );
      expect(cinema.questions.some((question) => question.type === "player_vote")).toBe(true);
      expect(cinema.questions.some((question) => question.type === "trivia")).toBe(true);
    }
  });

  it("returns one deterministic review bundle with an allowlisted patch", async () => {
    const evidence = {
      simulations: 24,
      completionRate: 1,
      averageActions: 14,
      failures: [],
    };
    const review = await provider.reviewComposedGameSpec(cinemaCharadesSpec, evidence);
    const patch = review.suggestedPatch;

    expect(composedGameReviewSchema.safeParse(review).success).toBe(true);
    expect(composedGameCritiqueSchema.safeParse(review.critique).success).toBe(true);
    expect(review.critique.verdict).toBe("release_ready");
    expect(composedBalancePatchSchema.safeParse(patch).success).toBe(true);
    expect(patch?.sourceSpecId).toBe(cinemaCharadesSpec.id);
    expect(patch?.changes).toEqual([
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
