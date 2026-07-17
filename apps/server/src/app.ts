import Fastify from "fastify";
import cors from "@fastify/cors";
import { config as loadEnv } from "dotenv";
import { Server as SocketServer, type Socket } from "socket.io";
import { z } from "zod";
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
import {
  ComposedGameRuleError,
  GameRuleError,
  initializeComposedGame,
  initializeGame,
  projectComposedGameState,
  projectGameState,
  replayGame,
  reduceComposedGame,
  reduceGame,
  runComposedPlaytest,
  stateChecksum,
  validateComposedTeamSelection,
  type ComposedGameState,
  type GameState,
} from "@boardforge/game-engine";
import { createLlmProvider } from "@boardforge/llm";
import type {
  GameAction,
  GameActionEnvelope,
  JoinRoomPayload,
  JoinRoomResult,
  LobbyView,
  PublicPlayer,
  RoomView,
  SocketAck,
} from "@boardforge/shared";
import {
  createBlueprintStore,
  type BlueprintRecord,
  type RoomEventRecord,
  type RoomSessionRecord,
} from "./persistence";
import { issueReconnectToken, reconnectTokenMatches } from "./session-token";
import { gameSummary } from "./game-catalog";
import { registerGameRoutes } from "./game-routes";
import { registerBalanceRoutes } from "./balance-routes";

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

  type Room = {
    code: string;
    blueprintId: string;
    spec: BoardGameSpec;
    players: Map<string, PublicPlayer>;
    socketByPlayer: Map<string, string>;
    reconnectTokenHashes: Map<string, string>;
    lobbyTeamByPlayer: Map<string, string>;
    lobbyCaptainByTeam: Map<string, string>;
    seed: string | null;
    eventSequence: number;
    operationQueue: Promise<void>;
    timingStartedAtByPlayer: Map<string, number>;
    state: GameState | ComposedGameState | null;
  };

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

  type TimingActionKind = "timing_start" | "timing_stop" | "timing_advance";

  function timingActionKind(spec: BoardGameSpec, action: GameAction): TimingActionKind | null {
    if (spec.template !== "composed" || action.type !== "COMPOSED_ACTION") return null;
    const kind = spec.actions.find((candidate) => candidate.id === action.actionId)?.kind;
    return kind === "timing_start" || kind === "timing_stop" || kind === "timing_advance" ? kind : null;
  }

  function actionWithoutServerTiming(spec: BoardGameSpec, action: GameAction): GameAction {
    if (timingActionKind(spec, action) !== "timing_stop" || action.type !== "COMPOSED_ACTION") return action;
    const { elapsedMs: _elapsedMs, ...clientPayload } = action.payload ?? {};
    return {
      ...action,
      ...(Object.keys(clientPayload).length > 0 ? { payload: clientPayload } : { payload: undefined }),
    };
  }

  function sameRequestedAction(spec: BoardGameSpec, received: GameAction, persisted: GameAction): boolean {
    return (
      JSON.stringify(actionWithoutServerTiming(spec, received)) ===
      JSON.stringify(actionWithoutServerTiming(spec, persisted))
    );
  }

  function restoreTimingStarts(spec: BoardGameSpec, events: RoomEventRecord[]): Map<string, number> {
    const starts = new Map<string, number>();
    for (const event of events) {
      const kind = timingActionKind(spec, event.action);
      if (kind === "timing_start") starts.set(event.actorId, Date.parse(event.createdAt));
      if (kind === "timing_stop") starts.delete(event.actorId);
      if (kind === "timing_advance") starts.clear();
    }
    return starts;
  }

  function checkpointChecksumMatches(
    state: GameState | ComposedGameState,
    storedCheckpoint: unknown,
    storedChecksum: string,
  ): boolean {
    if (stateChecksum(state) === storedChecksum) return true;
    if (typeof storedCheckpoint !== "object" || storedCheckpoint === null || Array.isArray(storedCheckpoint))
      return false;
    // Preserve checksum protection while allowing newer engines to add top-level state buckets.
    const current = state as unknown as Record<string, unknown>;
    const legacyProjection: Record<string, unknown> = {};
    for (const key of Object.keys(storedCheckpoint)) {
      if (!(key in current)) return false;
      legacyProjection[key] = current[key];
    }
    return stateChecksum(legacyProjection as unknown as GameState) === storedChecksum;
  }
  const blueprintStore = await createBlueprintStore({
    databaseUrl: config.databaseUrl,
    requireDatabase: config.requireDatabase,
    seed: seededBlueprints,
    onFallback: (error) => app.log.warn({ error }, "PostgreSQL unavailable; blueprint persistence is using memory"),
  });

  function createRoomCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = "";
      for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (!rooms.has(code)) return code;
    }
    throw new Error("Could not allocate a unique room code.");
  }

  function publicPlayers(room: Room): PublicPlayer[] {
    return [...room.players.values()];
  }

  function persistedRoom(room: Room, state: Room["state"] = room.state): Omit<RoomSessionRecord, "events"> {
    return {
      code: room.code,
      blueprintId: room.blueprintId,
      players: publicPlayers(room),
      reconnectTokenHashes: Object.fromEntries(room.reconnectTokenHashes),
      lobbyTeamByPlayer: Object.fromEntries(room.lobbyTeamByPlayer),
      lobbyCaptainByTeam: Object.fromEntries(room.lobbyCaptainByTeam),
      seed: room.seed,
      checkpoint: state,
      checkpointChecksum: state ? stateChecksum(state) : null,
      checkpointRevision: state?.revision ?? null,
    };
  }

  function enqueueRoom<T>(room: Room, operation: () => Promise<T>): Promise<T> {
    const result = room.operationQueue.then(operation, operation);
    room.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function viewFor(room: Room, playerId: string): RoomView {
    const players = publicPlayers(room);
    if (!room.state) {
      const playerIds = players.map((player) => player.id);
      const selectedTeams = Object.fromEntries(
        [...room.lobbyTeamByPlayer.entries()].filter(([id]) => room.players.has(id)),
      );
      const composedStart =
        room.spec.template === "composed" ? validateComposedTeamSelection(room.spec, playerIds, selectedTeams) : null;
      const teamPolicy =
        room.spec.template === "composed" && room.spec.setup.mode === "teams" ? room.spec.setup.teamPolicy : undefined;
      const requiresCaptains =
        room.spec.template === "composed" && room.spec.actions.some((action) => action.actor === "team_captain");
      const missingCaptainTeam = requiresCaptains
        ? teamPolicy?.teams.find((team) => {
            const captainId = room.lobbyCaptainByTeam.get(team.id);
            return !captainId || selectedTeams[captainId] !== team.id;
          })
        : undefined;
      const teamSelectionReady = composedStart
        ? composedStart.ok
        : players.length >= room.spec.minPlayers && players.length <= room.spec.maxPlayers;
      const canStart = teamSelectionReady && !missingCaptainTeam;
      const view: LobbyView = {
        kind: "lobby",
        code: room.code,
        game: gameSummary(room.spec),
        players,
        selfPlayerId: playerId,
        canStart,
        ...(!canStart
          ? {
              startBlockReason:
                composedStart && !composedStart.ok
                  ? composedStart.reason
                  : missingCaptainTeam
                    ? `Choose a captain for ${missingCaptainTeam.name}.`
                    : `${Math.max(0, room.spec.minPlayers - players.length)} more player(s) required.`,
            }
          : {}),
        ...(teamPolicy
          ? {
              teamSetup: {
                teams: teamPolicy.teams.map((team) => ({
                  ...team,
                  playerIds: players
                    .filter((player) => selectedTeams[player.id] === team.id)
                    .map((player) => player.id),
                  ...(room.lobbyCaptainByTeam.get(team.id)
                    ? { captainPlayerId: room.lobbyCaptainByTeam.get(team.id) }
                    : {}),
                  ...(teamPolicy.maxMembersPerTeam ? { maxMembers: teamPolicy.maxMembersPerTeam } : {}),
                })),
                ...(selectedTeams[playerId] ? { selfTeamId: selectedTeams[playerId] } : {}),
                allowUnevenTeams: teamPolicy.allowUnevenTeams,
              },
            }
          : {}),
      };
      return view;
    }
    if (room.state.template === "composed" && room.spec.template === "composed") {
      return projectComposedGameState(room.state, room.spec, players, room.code, playerId);
    }
    if (room.state.template !== "composed" && room.spec.template !== "composed") {
      return projectGameState(room.state, room.spec, players, room.code, playerId);
    }
    throw new GameRuleError("State and GameSpec templates do not match.");
  }

  function emitRoom(room: Room): void {
    for (const [playerId, socketId] of room.socketByPlayer.entries()) {
      if (!room.players.get(playerId)?.connected) continue;
      io.to(socketId).emit("room:state", viewFor(room, playerId));
    }
  }

  function acknowledge<T>(ack: ((response: SocketAck<T>) => void) | undefined, response: SocketAck<T>): void {
    ack?.(response);
  }

  app.get("/health", async () => ({
    status: "ok",
    rooms: rooms.size,
    provider: llm.name,
    persistence: blueprintStore.mode,
    databaseReady: blueprintStore.mode === "postgres" && (await blueprintStore.health().catch(() => false)),
  }));

  registerGameRoutes(app, { llm, blueprintStore });

  registerBalanceRoutes(app, { llm, blueprintStore });

  const roomBodySchema = z
    .object({
      blueprintId: z.string().trim().min(1).optional(),
      template: z.enum(["hidden_roles", "quiz_vote", "composed"]).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.blueprintId || value.template), {
      message: "blueprintId or template is required",
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

  const joinSchema = z
    .object({
      code: z
        .string()
        .trim()
        .length(6)
        .transform((value) => value.toUpperCase()),
      name: z.string().trim().min(1).max(24),
      playerId: z.string().uuid().optional(),
      reconnectToken: z
        .string()
        .regex(/^[A-Za-z0-9_-]{40,64}$/)
        .optional(),
    })
    .strict()
    .refine((value) => Boolean(value.playerId) === Boolean(value.reconnectToken), {
      message: "playerId and reconnectToken must be provided together",
    });

  const actionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("SUBMIT_MISSION"), choice: z.enum(["success", "sabotage"]) }).strict(),
    z.object({ type: z.literal("CAST_VOTE"), targetPlayerId: z.string().uuid() }).strict(),
    z.object({ type: z.literal("SUBMIT_ANSWER"), optionId: z.string().min(1).max(48) }).strict(),
    z.object({ type: z.literal("CAST_PLAYER_VOTE"), targetPlayerId: z.string().uuid() }).strict(),
    z.object({ type: z.literal("ADVANCE") }).strict(),
    z
      .object({
        type: z.literal("COMPOSED_ACTION"),
        actionId: z
          .string()
          .regex(/^[a-z][a-z0-9_]*$/)
          .max(48),
        payload: z
          .object({
            choiceId: z.string().max(48).optional(),
            text: z.string().max(600).optional(),
            cardId: z.string().max(48).optional(),
            tokenId: z.string().max(96).optional(),
            spaceId: z.string().max(48).optional(),
            orderedIds: z.array(z.string().max(48)).max(24).optional(),
            pairs: z
              .array(z.object({ leftId: z.string().max(48), rightId: z.string().max(48) }).strict())
              .max(12)
              .optional(),
            targetPlayerId: z.string().uuid().optional(),
            stroke: z
              .object({
                id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
                points: z
                  .array(z.object({ x: z.number().min(0).max(600), y: z.number().min(0).max(340) }).strict())
                  .min(2)
                  .max(160),
              })
              .strict()
              .optional(),
            clear: z.boolean().optional(),
            elapsedMs: z.number().int().min(100).max(30_000).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  ]);

  const actionEnvelopeSchema = z
    .object({
      code: z
        .string()
        .trim()
        .length(6)
        .transform((value) => value.toUpperCase()),
      playerId: z.string().uuid(),
      expectedRevision: z.number().int().min(1),
      idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
      action: actionSchema,
    })
    .strict();

  const persistedPlayersSchema = z
    .array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(24),
          isHost: z.boolean(),
          connected: z.boolean(),
        })
        .strict(),
    )
    .max(12);
  const persistedStringMapSchema = z.record(z.string(), z.string());
  const persistedEventSchema = z
    .object({
      id: z.string().uuid(),
      roomCode: z.string().regex(/^[A-Z2-9]{6}$/),
      createdAt: z.string().datetime(),
      sequence: z.number().int().positive(),
      actorId: z.string().uuid(),
      actorIsHost: z.boolean(),
      expectedRevision: z.number().int().positive(),
      resultingRevision: z.number().int().positive(),
      idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
      action: actionSchema,
    })
    .strict();

  const teamSelectionSchema = z
    .object({
      code: z
        .string()
        .trim()
        .length(6)
        .transform((value) => value.toUpperCase()),
      playerId: z.string().uuid(),
      teamId: z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/)
        .max(48),
    })
    .strict();

  const captainSelectionSchema = z
    .object({
      code: z
        .string()
        .trim()
        .length(6)
        .transform((value) => value.toUpperCase()),
      playerId: z.string().uuid(),
      teamId: z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/)
        .max(48),
      captainPlayerId: z.string().uuid(),
    })
    .strict();

  function socketError(error: unknown): string {
    if (error instanceof GameRuleError || error instanceof ComposedGameRuleError) return error.message;
    app.log.error(error);
    return "Unexpected server error.";
  }

  function assertSocketOwnsPlayer(socket: Socket, room: Room, code: string, playerId: string): void {
    if (
      socket.data.roomCode !== code ||
      socket.data.playerId !== playerId ||
      room.socketByPlayer.get(playerId) !== socket.id
    ) {
      throw new GameRuleError("This connection is not authorized for that player.");
    }
  }

  async function restorePersistedRooms(): Promise<void> {
    for (const record of await blueprintStore.loadRooms()) {
      try {
        const blueprint = await blueprintStore.get(record.blueprintId);
        if (blueprint?.status !== "release_ready") throw new Error(`Blueprint ${record.blueprintId} is unavailable.`);
        const players = persistedPlayersSchema.parse(record.players).map((player) => ({ ...player, connected: false }));
        const reconnectTokenHashes = persistedStringMapSchema.parse(record.reconnectTokenHashes);
        const lobbyTeamByPlayer = persistedStringMapSchema.parse(record.lobbyTeamByPlayer);
        const lobbyCaptainByTeam = persistedStringMapSchema.parse(record.lobbyCaptainByTeam);
        const events = record.events.map((event) => persistedEventSchema.parse(event));
        if (!record.seed && events.length) throw new Error("A lobby room cannot contain game events.");
        const state = record.seed
          ? replayGame({
              spec: blueprint.spec,
              players,
              seed: record.seed,
              teamByPlayer: lobbyTeamByPlayer,
              captainByTeam: lobbyCaptainByTeam,
              events: events.map((event) => ({
                sequence: event.sequence,
                actorId: event.actorId,
                isHost: event.actorIsHost,
                expectedRevision: event.expectedRevision,
                resultingRevision: event.resultingRevision,
                idempotencyKey: event.idempotencyKey,
                action: event.action,
              })),
            })
          : null;
        if (state && record.checkpointRevision !== null && state.revision !== record.checkpointRevision) {
          throw new Error(
            `Checkpoint revision mismatch: replay=${state.revision}, stored=${record.checkpointRevision}.`,
          );
        }
        if (
          state &&
          record.checkpointChecksum &&
          !checkpointChecksumMatches(state, record.checkpoint, record.checkpointChecksum)
        ) {
          throw new Error("Checkpoint checksum does not match deterministic replay.");
        }
        const room: Room = {
          code: record.code,
          blueprintId: record.blueprintId,
          spec: blueprint.spec,
          players: new Map(players.map((player) => [player.id, player])),
          socketByPlayer: new Map(),
          reconnectTokenHashes: new Map(Object.entries(reconnectTokenHashes)),
          lobbyTeamByPlayer: new Map(Object.entries(lobbyTeamByPlayer)),
          lobbyCaptainByTeam: new Map(Object.entries(lobbyCaptainByTeam)),
          seed: record.seed,
          eventSequence: events.length,
          operationQueue: Promise.resolve(),
          timingStartedAtByPlayer: restoreTimingStarts(blueprint.spec, events),
          state,
        };
        rooms.set(room.code, room);
        await blueprintStore.saveRoom(persistedRoom(room));
      } catch (error) {
        app.log.error({ roomCode: record.code, err: error }, "Persisted room failed validation and was not restored");
      }
    }
  }

  if (options.restoreRooms !== false) await restorePersistedRooms();

  io.on("connection", (socket: Socket) => {
    socket.on("room:join", async (payload: JoinRoomPayload, ack?: (response: SocketAck<JoinRoomResult>) => void) => {
      try {
        const parsed = joinSchema.parse(payload);
        const room = rooms.get(parsed.code);
        if (!room) throw new GameRuleError("Room not found.");

        let playerId = parsed.playerId;
        let player = playerId ? room.players.get(playerId) : undefined;
        if (playerId) {
          const expectedHash = room.reconnectTokenHashes.get(playerId);
          if (
            !player ||
            !parsed.reconnectToken ||
            !expectedHash ||
            !reconnectTokenMatches(parsed.reconnectToken, expectedHash)
          ) {
            throw new GameRuleError("This reconnect session is no longer valid.");
          }
        } else if (room.state) {
          throw new GameRuleError("This game has already started.");
        }
        if (!player) {
          if (room.players.size >= room.spec.maxPlayers) {
            throw new GameRuleError("This room is full.");
          }
          playerId = crypto.randomUUID();
          player = {
            id: playerId,
            name: parsed.name,
            isHost: room.players.size === 0,
            connected: true,
          };
          room.players.set(playerId, player);
        } else {
          player.name = parsed.name;
          player.connected = true;
        }

        const resolvedPlayerId = player.id;
        const previousSocketId = room.socketByPlayer.get(resolvedPlayerId);
        const reconnectCredential = issueReconnectToken();
        room.reconnectTokenHashes.set(resolvedPlayerId, reconnectCredential.hash);
        room.socketByPlayer.set(resolvedPlayerId, socket.id);
        socket.data.roomCode = room.code;
        socket.data.playerId = resolvedPlayerId;
        void socket.join(room.code);
        if (previousSocketId && previousSocketId !== socket.id) {
          io.to(previousSocketId).emit("session:replaced");
          io.sockets.sockets.get(previousSocketId)?.disconnect(true);
        }

        await blueprintStore.saveRoom(persistedRoom(room));
        const view = viewFor(room, resolvedPlayerId);
        acknowledge(ack, {
          ok: true,
          data: { playerId: resolvedPlayerId, reconnectToken: reconnectCredential.token, view },
        });
        emitRoom(room);
      } catch (error) {
        acknowledge(ack, { ok: false, error: socketError(error) });
      }
    });

    socket.on(
      "room:team:select",
      async (payload: unknown, ack?: (response: SocketAck<{ view: LobbyView }>) => void) => {
        try {
          const parsed = teamSelectionSchema.parse(payload);
          const room = rooms.get(parsed.code);
          if (!room) throw new GameRuleError("Room not found.");
          if (room.state) throw new GameRuleError("Teams are locked after the game starts.");
          assertSocketOwnsPlayer(socket, room, parsed.code, parsed.playerId);
          if (!room.players.has(parsed.playerId)) throw new GameRuleError("Unknown player.");
          if (room.spec.template !== "composed" || room.spec.setup.mode !== "teams" || !room.spec.setup.teamPolicy) {
            throw new GameRuleError("This game does not use player-selected teams.");
          }
          const policy = room.spec.setup.teamPolicy;
          if (!policy.teams.some((team) => team.id === parsed.teamId)) throw new GameRuleError("Unknown team.");
          const currentTeamId = room.lobbyTeamByPlayer.get(parsed.playerId);
          const targetSize = [...room.lobbyTeamByPlayer.entries()].filter(
            ([id, teamId]) => id !== parsed.playerId && room.players.has(id) && teamId === parsed.teamId,
          ).length;
          if (currentTeamId !== parsed.teamId && policy.maxMembersPerTeam && targetSize >= policy.maxMembersPerTeam) {
            throw new GameRuleError("This team is full.");
          }
          room.lobbyTeamByPlayer.set(parsed.playerId, parsed.teamId);
          if (
            currentTeamId &&
            currentTeamId !== parsed.teamId &&
            room.lobbyCaptainByTeam.get(currentTeamId) === parsed.playerId
          ) {
            room.lobbyCaptainByTeam.delete(currentTeamId);
          }
          await blueprintStore.saveRoom(persistedRoom(room));
          emitRoom(room);
          acknowledge(ack, { ok: true, data: { view: viewFor(room, parsed.playerId) as LobbyView } });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "room:captain:select",
      async (payload: unknown, ack?: (response: SocketAck<{ view: LobbyView }>) => void) => {
        try {
          const parsed = captainSelectionSchema.parse(payload);
          const room = rooms.get(parsed.code);
          if (!room) throw new GameRuleError("Room not found.");
          if (room.state) throw new GameRuleError("Captains are locked after the game starts.");
          assertSocketOwnsPlayer(socket, room, parsed.code, parsed.playerId);
          if (!room.players.get(parsed.playerId)?.isHost)
            throw new GameRuleError("Only the host can choose team captains.");
          if (room.spec.template !== "composed" || room.spec.setup.mode !== "teams" || !room.spec.setup.teamPolicy) {
            throw new GameRuleError("This game does not use teams.");
          }
          if (!room.spec.actions.some((action) => action.actor === "team_captain")) {
            throw new GameRuleError("This game does not use team captains.");
          }
          if (!room.spec.setup.teamPolicy.teams.some((team) => team.id === parsed.teamId)) {
            throw new GameRuleError("Unknown team.");
          }
          if (
            !room.players.has(parsed.captainPlayerId) ||
            room.lobbyTeamByPlayer.get(parsed.captainPlayerId) !== parsed.teamId
          ) {
            throw new GameRuleError("The captain must belong to the selected team.");
          }
          room.lobbyCaptainByTeam.set(parsed.teamId, parsed.captainPlayerId);
          await blueprintStore.saveRoom(persistedRoom(room));
          emitRoom(room);
          acknowledge(ack, { ok: true, data: { view: viewFor(room, parsed.playerId) as LobbyView } });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "room:start",
      async (payload: { code: string; playerId: string }, ack?: (response: SocketAck<{ view: RoomView }>) => void) => {
        try {
          const code = payload.code.toUpperCase();
          const room = rooms.get(code);
          if (!room) throw new GameRuleError("Room not found.");
          assertSocketOwnsPlayer(socket, room, code, payload.playerId);
          const player = room.players.get(payload.playerId);
          if (!player?.isHost) throw new GameRuleError("Only the host can start the game.");
          if (room.state) throw new GameRuleError("The game has already started.");
          const lobbyView = viewFor(room, payload.playerId);
          if (lobbyView.kind !== "lobby" || !lobbyView.canStart) {
            throw new GameRuleError(
              lobbyView.kind === "lobby"
                ? (lobbyView.startBlockReason ?? "The room is not ready.")
                : "The game has already started.",
            );
          }
          const seed = `${room.code}-seed`;
          const nextState =
            room.spec.template === "composed"
              ? initializeComposedGame(
                  room.spec,
                  publicPlayers(room),
                  seed,
                  Object.fromEntries(room.lobbyTeamByPlayer),
                  Object.fromEntries(room.lobbyCaptainByTeam),
                )
              : initializeGame(room.spec, publicPlayers(room), seed);
          await blueprintStore.saveRoom({ ...persistedRoom(room, nextState), seed });
          room.seed = seed;
          room.state = nextState;
          emitRoom(room);
          acknowledge(ack, { ok: true, data: { view: viewFor(room, payload.playerId) } });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game:action",
      async (payload: GameActionEnvelope, ack?: (response: SocketAck<{ revision: number }>) => void) => {
        try {
          const receivedAt = Date.now();
          const parsed = actionEnvelopeSchema.parse(payload);
          const code = parsed.code;
          const room = rooms.get(code);
          if (!room?.state) throw new GameRuleError("The game has not started.");
          assertSocketOwnsPlayer(socket, room, code, parsed.playerId);
          const player = room.players.get(parsed.playerId);
          if (!player) throw new GameRuleError("Unknown player.");
          const result = await enqueueRoom(room, async () => {
            const duplicate = await blueprintStore.findRoomEvent(room.code, parsed.idempotencyKey);
            if (duplicate) {
              if (duplicate.actorId !== player.id || !sameRequestedAction(room.spec, parsed.action, duplicate.action)) {
                throw new GameRuleError("This idempotency key belongs to a different action.");
              }
              return { revision: duplicate.resultingRevision, changed: false };
            }
            const currentState = room.state;
            if (!currentState) throw new GameRuleError("The game has not started.");
            if (currentState.revision !== parsed.expectedRevision) {
              throw new GameRuleError(`Stale room revision. Expected ${currentState.revision}.`);
            }
            const timingKind = timingActionKind(room.spec, parsed.action);
            let effectiveAction = parsed.action;
            if (timingKind === "timing_stop" && parsed.action.type === "COMPOSED_ACTION") {
              const startedAt = room.timingStartedAtByPlayer.get(player.id);
              if (startedAt === undefined) throw new GameRuleError("Start the server clock before stopping it.");
              const elapsedMs = Math.max(100, Math.min(30_000, receivedAt - startedAt));
              effectiveAction = { ...parsed.action, payload: { elapsedMs } };
            }
            let nextState: GameState | ComposedGameState;
            if (currentState.template === "composed" && room.spec.template === "composed") {
              if (effectiveAction.type !== "COMPOSED_ACTION")
                throw new ComposedGameRuleError("This action is not supported by the composed engine.");
              nextState = reduceComposedGame(
                currentState,
                { ...effectiveAction, idempotencyKey: parsed.idempotencyKey },
                player.id,
                player.isHost,
                room.spec,
              );
            } else if (currentState.template !== "composed" && room.spec.template !== "composed") {
              if (parsed.action.type === "COMPOSED_ACTION")
                throw new GameRuleError("This action is not supported by the legacy engine.");
              nextState = reduceGame(currentState, parsed.action, player.id, player.isHost, room.spec);
            } else {
              throw new GameRuleError("State and GameSpec templates do not match.");
            }
            const event: RoomEventRecord = {
              id: crypto.randomUUID(),
              roomCode: room.code,
              createdAt: new Date(receivedAt).toISOString(),
              sequence: room.eventSequence + 1,
              actorId: player.id,
              actorIsHost: player.isHost,
              expectedRevision: parsed.expectedRevision,
              resultingRevision: nextState.revision,
              idempotencyKey: parsed.idempotencyKey,
              action: effectiveAction,
            };
            await blueprintStore.appendRoomEvent(persistedRoom(room, nextState), event);
            room.state = nextState;
            room.eventSequence = event.sequence;
            if (timingKind === "timing_start") room.timingStartedAtByPlayer.set(player.id, receivedAt);
            if (timingKind === "timing_stop") room.timingStartedAtByPlayer.delete(player.id);
            if (timingKind === "timing_advance") room.timingStartedAtByPlayer.clear();
            return { revision: nextState.revision, changed: true };
          });
          if (result.changed) emitRoom(room);
          acknowledge(ack, { ok: true, data: { revision: result.revision } });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on("disconnect", () => {
      const code = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!code || !playerId) return;
      const room = rooms.get(code);
      const player = room?.players.get(playerId);
      if (!room || !player) return;
      if (room.socketByPlayer.get(playerId) !== socket.id) return;
      void enqueueRoom(room, async () => {
        if (room.socketByPlayer.get(playerId) !== socket.id) return;
        player.connected = false;
        room.socketByPlayer.delete(playerId);
        await blueprintStore.saveRoom(persistedRoom(room));
        emitRoom(room);
      }).catch((error) => app.log.error({ error, roomCode: room.code }, "Failed to persist disconnect"));
    });
  });

  app.addHook("onClose", async () => {
    await blueprintStore.close();
  });

  return { app, io, port: config.port };
}
