import Fastify from "fastify";
import cors from "@fastify/cors";
import { config as loadEnv } from "dotenv";
import { Server as SocketServer } from "socket.io";
import {
  cinemaCharadesSpec,
  defaultMovieMimeSpec,
  defaultWordTrapSpec,
  defaultDrawBattleSpec,
  defaultSoundCheckSpec,
  defaultStoryChainSpec,
  defaultWordDuelSpec,
  defaultSecondSenseSpec,
  demoGameSpecs,
  partyPulseSpec,
  spaceHeistSpec,
  systemsLabSpec,
  type BoardGameSpec,
} from "@boardforge/game-spec";
import { runComposedPlaytest } from "@boardforge/game-engine";
import { createLlmProvider } from "@boardforge/llm";
import { createBlueprintStore, type BlueprintRecord } from "./persistence";
import { gameSummary } from "./game-catalog";
import { registerGameRoutes } from "./game-routes";
import { registerGameNightRoutes } from "./game-night-routes";
import { registerBalanceRoutes } from "./balance-routes";
import { allocateRoomCode, persistedRoom, type Room } from "./room-runtime";
import { roomBodySchema } from "./room-schemas";
import { registerRealtimeGateway } from "./realtime-gateway";

export type BoardForgeServerOptions = {
  port?: number;
  webOrigin?: string;
  llmProvider?: string;
  databaseUrl?: string | null;
  requireDatabase?: boolean;
  logger?: boolean;
  restoreRooms?: boolean;
};

export async function createBoardForgeServer(options: BoardForgeServerOptions = {}) {
  loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

  const config = {
    port: options.port ?? Number(process.env.PORT ?? 4000),
    webOrigin: options.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:3000",
    llmProvider: options.llmProvider ?? process.env.LLM_PROVIDER,
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL,
    openAiReviewModel: process.env.OPENAI_REVIEW_MODEL,
    databaseUrl: options.databaseUrl === null ? undefined : (options.databaseUrl ?? process.env.DATABASE_URL),
    requireDatabase: options.requireDatabase ?? process.env.DATABASE_REQUIRED === "true",
  };

  const app = Fastify({ logger: options.logger ?? true });
  await app.register(cors, { origin: config.webOrigin, credentials: false });

  const io = new SocketServer(app.server, {
    cors: { origin: config.webOrigin },
    maxHttpBufferSize: 64_000,
  });

  const rooms = new Map<string, Room>();
  const availableDemoSpecs: BoardGameSpec[] = [
    ...demoGameSpecs,
    cinemaCharadesSpec,
    defaultMovieMimeSpec,
    defaultWordTrapSpec,
    defaultDrawBattleSpec,
    defaultSoundCheckSpec,
    defaultStoryChainSpec,
    defaultWordDuelSpec,
    defaultSecondSenseSpec,
    systemsLabSpec,
  ];
  const llm = createLlmProvider({
    provider: config.llmProvider,
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    reviewModel: config.openAiReviewModel,
    onTelemetry: (telemetry) => app.log.info({ llmUsage: telemetry }, "OpenAI workflow usage"),
  });
  const seededBlueprints: BlueprintRecord[] = availableDemoSpecs.map((spec) => {
    const playtest =
      spec.template === "composed"
        ? runComposedPlaytest(spec, { simulations: 24, seed: `release:${spec.id}` })
        : undefined;
    return {
      id: spec.id,
      spec,
      status: playtest && playtest.status !== "passed" ? "needs_review" : "release_ready",
      provider: "internal-fixture",
      ...(playtest ? { playtest } : {}),
    };
  });

  const blueprintStore = await createBlueprintStore({
    databaseUrl: config.databaseUrl,
    requireDatabase: config.requireDatabase,
    seed: seededBlueprints,
    onFallback: (error) => app.log.warn({ error }, "PostgreSQL unavailable; blueprint persistence is using memory"),
  });

  const createRoomCode = () => allocateRoomCode(rooms);

  app.get("/health", async () => ({
    status: "ok",
    rooms: rooms.size,
    provider: llm.name,
    persistence: blueprintStore.mode,
    databaseReady: blueprintStore.mode === "postgres" && (await blueprintStore.health().catch(() => false)),
  }));

  registerGameRoutes(app, { llm, blueprintStore });

  registerBalanceRoutes(app, { llm, blueprintStore });

  const gameNights = await registerGameNightRoutes(app, {
    blueprintStore,
    rooms,
    createRoomCode,
    gameNightCatalog: [defaultMovieMimeSpec, defaultWordTrapSpec, defaultDrawBattleSpec, defaultSoundCheckSpec],
  });

  app.post("/api/rooms", async (request, reply) => {
    const parsed = roomBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid room request." });
    }
    const blueprint = parsed.data.blueprintId ? await blueprintStore.get(parsed.data.blueprintId) : undefined;
    if (parsed.data.blueprintId && !blueprint) {
      return reply.code(404).send({ error: "Game blueprint not found." });
    }
    if (blueprint && blueprint.status !== "release_ready") {
      return reply.code(409).send({
        error: "This game has not passed its virtual-agent release gate.",
        releaseStatus: blueprint.status,
      });
    }
    const spec = blueprint
      ? blueprint.spec
      : parsed.data.template === "hidden_roles"
        ? spaceHeistSpec
        : parsed.data.template === "composed"
          ? cinemaCharadesSpec
          : partyPulseSpec;
    const blueprintId = blueprint?.id ?? spec?.id;

    if (!spec || !blueprintId) {
      return reply.code(404).send({ error: "Game blueprint not found." });
    }

    const code = createRoomCode();
    const room: Room = {
      code,
      blueprintId,
      gameNightId: null,
      gameInstanceId: null,
      gameNightTeamByGameTeam: new Map(),
      spec,
      players: new Map(),
      socketByPlayer: new Map(),
      reconnectTokenHashes: new Map(),
      lobbyTeamByPlayer: new Map(),
      lobbyCaptainByTeam: new Map(),
      seed: null,
      eventSequence: 0,
      operationQueue: Promise.resolve(),
      timingStartedAtByPlayer: new Map(),
      state: null,
    };
    await blueprintStore.saveRoom(persistedRoom(room));
    rooms.set(code, room);
    return reply.code(201).send({ code, game: gameSummary(spec) });
  });

  app.get<{ Params: { code: string } }>("/api/rooms/:code", async (request, reply) => {
    const room = rooms.get(request.params.code.toUpperCase());
    if (!room) return reply.code(404).send({ error: "Room not found." });
    return {
      code: room.code,
      game: gameSummary(room.spec),
      playerCount: room.players.size,
      started: Boolean(room.state),
    };
  });

  await registerRealtimeGateway({
    app,
    io,
    rooms,
    gameNights,
    blueprintStore,
    restoreRooms: options.restoreRooms !== false,
  });

  app.addHook("onClose", async () => {
    await blueprintStore.close();
  });

  return { app, io, port: config.port };
}
