import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  composedThemeIdSchema,
  createDrawBattleSpec,
  createMovieMimeSpec,
  createRandomDrawBattlePack,
  createRandomMovieMimePack,
  createRandomSoundCheckPack,
  createRandomWordTrapPack,
  createSecondSenseSpec,
  createSoundCheckSpec,
  createStoryChainSpec,
  createWordDuelSpec,
  createWordTrapSpec,
  defaultDrawBattleSpec,
  defaultMovieMimeSpec,
  defaultSecondSenseSpec,
  defaultSoundCheckSpec,
  defaultStoryChainSpec,
  defaultWordDuelSpec,
  defaultWordTrapSpec,
  drawBattleSetupSchema,
  movieMimeSetupSchema,
  secondSenseSetupSchema,
  soundCheckSetupSchema,
  storyChainSetupSchema,
  wordDuelSetupSchema,
  wordTrapSetupSchema,
} from "@boardforge/game-spec";
import { runComposedPlaytest } from "@boardforge/game-engine";
import type { LlmProvider } from "@boardforge/llm";
import type { BlueprintStore } from "./persistence";
import { gameSummary } from "./game-catalog";
import { aiProviderErrorMessage } from "./provider-error";

type GameRouteDependencies = {
  llm: LlmProvider;
  blueprintStore: BlueprintStore;
};

export function registerGameRoutes(app: FastifyInstance, { llm, blueprintStore }: GameRouteDependencies): void {
  app.get("/api/games", async () => ({
    games: [
      defaultMovieMimeSpec,
      defaultWordTrapSpec,
      defaultDrawBattleSpec,
      defaultSoundCheckSpec,
      defaultStoryChainSpec,
      defaultWordDuelSpec,
      defaultSecondSenseSpec,
    ].map((spec) => ({ id: spec.id, ...gameSummary(spec) })),
    provider: llm.name,
  }));

  const movieMimeBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("noir"),
      filmCount: z.number().int().min(6).max(40).default(20),
      teams: z
        .array(
          z
            .object({
              name: z.string().trim().min(2).max(24),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            })
            .strict(),
        )
        .min(2)
        .max(4)
        .optional(),
      preferences: z.string().trim().max(240).optional(),
    })
    .strict();

  app.post("/api/movie-mime/blueprints", async (request, reply) => {
    const parsed = movieMimeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid movie mime setup.", issues: parsed.error.issues });
    }
    const setupResult = movieMimeSetupSchema.safeParse({
      themeId: parsed.data.themeId,
      filmCount: parsed.data.filmCount,
      ...(parsed.data.teams ? { teams: parsed.data.teams } : {}),
      ...(parsed.data.preferences ? { preferences: parsed.data.preferences } : {}),
    });
    if (!setupResult.success) {
      return reply.code(400).send({ error: "Invalid movie mime setup.", issues: setupResult.error.issues });
    }
    const setup = setupResult.data;

    try {
      const pack = setup.preferences
        ? await llm.generateMovieMimePack(setup)
        : createRandomMovieMimePack(setup, crypto.randomUUID());
      const spec = createMovieMimeSpec(pack);
      const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
      await blueprintStore.saveBlueprint({
        id: blueprintId,
        spec,
        status: "playtesting",
        provider: setup.preferences ? llm.name : "catalog-random",
        ...(setup.preferences ? { prompt: setup.preferences } : {}),
      });
      const playtest = runComposedPlaytest(spec, {
        simulations: 24,
        seed: `release:${blueprintId}`,
      });
      const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
      await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
      return reply.code(201).send({
        blueprintId,
        releaseStatus,
        source: pack.source,
        themeId: pack.themeId,
        filmCount: pack.films.length,
        game: gameSummary(spec),
        playtest: {
          status: playtest.status,
          simulations: playtest.simulations,
          completedSimulations: playtest.completedSimulations,
        },
      });
    } catch (error) {
      app.log.warn(
        { message: error instanceof Error ? error.message : "Unknown movie selection error" },
        "Movie mime preparation failed",
      );
      return reply.code(502).send({
        error: aiProviderErrorMessage(error),
        provider: llm.name,
      });
    }
  });

  const wordTrapBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("disco"),
      cardCount: z.number().int().min(6).max(40).default(20),
      teams: z
        .array(
          z
            .object({
              name: z.string().trim().min(2).max(24),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            })
            .strict(),
        )
        .min(2)
        .max(4)
        .optional(),
      preferences: z.string().trim().max(240).optional(),
    })
    .strict();

  app.post("/api/word-trap/blueprints", async (request, reply) => {
    const parsed = wordTrapBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid WordTrap setup.", issues: parsed.error.issues });
    const setupResult = wordTrapSetupSchema.safeParse({
      themeId: parsed.data.themeId,
      cardCount: parsed.data.cardCount,
      ...(parsed.data.teams ? { teams: parsed.data.teams } : {}),
      ...(parsed.data.preferences ? { preferences: parsed.data.preferences } : {}),
    });
    if (!setupResult.success)
      return reply.code(400).send({ error: "Invalid WordTrap setup.", issues: setupResult.error.issues });
    const setup = setupResult.data;

    try {
      const pack = setup.preferences
        ? await llm.generateWordTrapPack(setup)
        : createRandomWordTrapPack(setup, crypto.randomUUID());
      const spec = createWordTrapSpec(pack);
      const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
      await blueprintStore.saveBlueprint({
        id: blueprintId,
        spec,
        status: "playtesting",
        provider: setup.preferences ? llm.name : "catalog-random",
        ...(setup.preferences ? { prompt: setup.preferences } : {}),
      });
      const playtest = runComposedPlaytest(spec, { simulations: 24, seed: `release:${blueprintId}` });
      const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
      await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
      return reply.code(201).send({
        blueprintId,
        releaseStatus,
        source: pack.source,
        themeId: pack.themeId,
        cardCount: pack.cards.length,
        game: gameSummary(spec),
        playtest: {
          status: playtest.status,
          simulations: playtest.simulations,
          completedSimulations: playtest.completedSimulations,
        },
      });
    } catch (error) {
      app.log.warn(
        { message: error instanceof Error ? error.message : "Unknown WordTrap selection error" },
        "WordTrap preparation failed",
      );
      return reply.code(502).send({ error: aiProviderErrorMessage(error), provider: llm.name });
    }
  });

  const drawBattleBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("arcade"),
      promptCount: z.number().int().min(6).max(30).default(18),
      teams: z
        .array(
          z
            .object({
              name: z.string().trim().min(2).max(24),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            })
            .strict(),
        )
        .min(2)
        .max(4)
        .optional(),
      preferences: z.string().trim().max(240).optional(),
    })
    .strict();

  app.post("/api/draw-battle/blueprints", async (request, reply) => {
    const parsed = drawBattleBodySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid DrawBattle setup.", issues: parsed.error.issues });
    const setupResult = drawBattleSetupSchema.safeParse({
      themeId: parsed.data.themeId,
      promptCount: parsed.data.promptCount,
      ...(parsed.data.teams ? { teams: parsed.data.teams } : {}),
      ...(parsed.data.preferences ? { preferences: parsed.data.preferences } : {}),
    });
    if (!setupResult.success)
      return reply.code(400).send({ error: "Invalid DrawBattle setup.", issues: setupResult.error.issues });
    const setup = setupResult.data;

    try {
      const pack = setup.preferences
        ? await llm.generateDrawBattlePack(setup)
        : createRandomDrawBattlePack(setup, crypto.randomUUID());
      const spec = createDrawBattleSpec(pack);
      const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
      await blueprintStore.saveBlueprint({
        id: blueprintId,
        spec,
        status: "playtesting",
        provider: setup.preferences ? llm.name : "catalog-random",
        ...(setup.preferences ? { prompt: setup.preferences } : {}),
      });
      const playtest = runComposedPlaytest(spec, { simulations: 24, seed: `release:${blueprintId}` });
      const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
      await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
      return reply.code(201).send({
        blueprintId,
        releaseStatus,
        source: pack.source,
        themeId: pack.themeId,
        promptCount: pack.prompts.length,
        game: gameSummary(spec),
        playtest: {
          status: playtest.status,
          simulations: playtest.simulations,
          completedSimulations: playtest.completedSimulations,
        },
      });
    } catch (error) {
      app.log.warn(
        { message: error instanceof Error ? error.message : "Unknown DrawBattle selection error" },
        "DrawBattle preparation failed",
      );
      return reply.code(502).send({ error: aiProviderErrorMessage(error), provider: llm.name });
    }
  });

  const soundCheckBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("retro"),
      promptCount: z.number().int().min(6).max(30).default(18),
      teams: z
        .array(
          z
            .object({
              name: z.string().trim().min(2).max(24),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            })
            .strict(),
        )
        .min(2)
        .max(4)
        .optional(),
      preferences: z.string().trim().max(240).optional(),
    })
    .strict();

  app.post("/api/sound-check/blueprints", async (request, reply) => {
    const parsed = soundCheckBodySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid SoundCheck setup.", issues: parsed.error.issues });
    const setupResult = soundCheckSetupSchema.safeParse({
      themeId: parsed.data.themeId,
      promptCount: parsed.data.promptCount,
      ...(parsed.data.teams ? { teams: parsed.data.teams } : {}),
      ...(parsed.data.preferences ? { preferences: parsed.data.preferences } : {}),
    });
    if (!setupResult.success)
      return reply.code(400).send({ error: "Invalid SoundCheck setup.", issues: setupResult.error.issues });
    const setup = setupResult.data;

    try {
      const pack = setup.preferences
        ? await llm.generateSoundCheckPack(setup)
        : createRandomSoundCheckPack(setup, crypto.randomUUID());
      const spec = createSoundCheckSpec(pack);
      const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
      await blueprintStore.saveBlueprint({
        id: blueprintId,
        spec,
        status: "playtesting",
        provider: setup.preferences ? llm.name : "catalog-random",
        ...(setup.preferences ? { prompt: setup.preferences } : {}),
      });
      const playtest = runComposedPlaytest(spec, { simulations: 24, seed: `release:${blueprintId}` });
      const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
      await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
      return reply.code(201).send({
        blueprintId,
        releaseStatus,
        source: pack.source,
        themeId: pack.themeId,
        promptCount: pack.prompts.length,
        game: gameSummary(spec),
        playtest: {
          status: playtest.status,
          simulations: playtest.simulations,
          completedSimulations: playtest.completedSimulations,
        },
      });
    } catch (error) {
      app.log.warn(
        { message: error instanceof Error ? error.message : "Unknown SoundCheck selection error" },
        "SoundCheck preparation failed",
      );
      return reply.code(502).send({ error: aiProviderErrorMessage(error), provider: llm.name });
    }
  });

  const storyChainBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("cozy"),
      mood: z.enum(["chaotic", "mystery", "fantasy", "spooky", "romantic", "family"]).default("chaotic"),
      length: z.enum(["quick", "full", "epic"]).default("full"),
      preferences: z.string().trim().max(240).optional(),
    })
    .strict();

  app.post("/api/story-chain/blueprints", async (request, reply) => {
    const parsed = storyChainBodySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid StoryChain setup.", issues: parsed.error.issues });
    const setupResult = storyChainSetupSchema.safeParse(parsed.data);
    if (!setupResult.success)
      return reply.code(400).send({ error: "Invalid StoryChain setup.", issues: setupResult.error.issues });
    const setup = setupResult.data;

    try {
      const pack = await llm.generateStoryChainPack(setup);
      const spec = createStoryChainSpec(pack);
      const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
      await blueprintStore.saveBlueprint({
        id: blueprintId,
        spec,
        status: "playtesting",
        provider: llm.name,
        ...(setup.preferences ? { prompt: setup.preferences } : {}),
      });
      const playtest = runComposedPlaytest(spec, { simulations: 24, seed: `release:${blueprintId}` });
      const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
      await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
      return reply.code(201).send({
        blueprintId,
        releaseStatus,
        source: pack.source,
        themeId: pack.themeId,
        mood: pack.mood,
        length: pack.length,
        title: pack.title,
        twistCount: pack.twists.length,
        game: gameSummary(spec),
        playtest: {
          status: playtest.status,
          simulations: playtest.simulations,
          completedSimulations: playtest.completedSimulations,
        },
      });
    } catch (error) {
      app.log.warn(
        { message: error instanceof Error ? error.message : "Unknown StoryChain generation error" },
        "StoryChain preparation failed",
      );
      return reply.code(502).send({ error: aiProviderErrorMessage(error), provider: llm.name });
    }
  });

  const wordDuelBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("minimal"),
      difficulty: z.enum(["easy", "classic", "expert"]).default("classic"),
    })
    .strict();

  app.post("/api/word-duel/blueprints", async (request, reply) => {
    const parsed = wordDuelBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid WordDuel setup.", issues: parsed.error.issues });
    const setupResult = wordDuelSetupSchema.safeParse(parsed.data);
    if (!setupResult.success)
      return reply.code(400).send({ error: "Invalid WordDuel setup.", issues: setupResult.error.issues });
    const spec = createWordDuelSpec(setupResult.data);
    const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
    await blueprintStore.saveBlueprint({ id: blueprintId, spec, status: "playtesting", provider: "boardforge-rules" });
    const playtest = runComposedPlaytest(spec, { simulations: 24, seed: `release:${blueprintId}` });
    const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
    await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
    return reply.code(201).send({
      blueprintId,
      releaseStatus,
      themeId: setupResult.data.themeId,
      difficulty: setupResult.data.difficulty,
      game: gameSummary(spec),
      playtest: {
        status: playtest.status,
        simulations: playtest.simulations,
        completedSimulations: playtest.completedSimulations,
      },
    });
  });

  const secondSenseBodySchema = z
    .object({
      themeId: composedThemeIdSchema.default("cyberpunk"),
      tempo: z.enum(["quickfire", "classic", "mindbreaker"]).default("classic"),
    })
    .strict();

  app.post("/api/second-sense/blueprints", async (request, reply) => {
    const parsed = secondSenseBodySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid Second Sense setup.", issues: parsed.error.issues });
    const setupResult = secondSenseSetupSchema.safeParse(parsed.data);
    if (!setupResult.success)
      return reply.code(400).send({ error: "Invalid Second Sense setup.", issues: setupResult.error.issues });
    const spec = createSecondSenseSpec(setupResult.data);
    const blueprintId = `${spec.id}-${crypto.randomUUID().slice(0, 8)}`;
    await blueprintStore.saveBlueprint({ id: blueprintId, spec, status: "playtesting", provider: "boardforge-rules" });
    const playtest = runComposedPlaytest(spec, { simulations: 24, seed: `release:${blueprintId}` });
    const releaseStatus = playtest.status === "passed" ? "release_ready" : "needs_review";
    await blueprintStore.savePlaytest(blueprintId, releaseStatus, playtest);
    return reply.code(201).send({
      blueprintId,
      releaseStatus,
      themeId: setupResult.data.themeId,
      tempo: setupResult.data.tempo,
      game: gameSummary(spec),
      playtest: {
        status: playtest.status,
        simulations: playtest.simulations,
        completedSimulations: playtest.completedSimulations,
      },
    });
  });
}
