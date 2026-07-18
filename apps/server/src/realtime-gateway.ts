import type { FastifyInstance } from "fastify";
import type { Server as SocketServer, Socket } from "socket.io";
import {
  ComposedGameRuleError,
  GameNightRuleError,
  GameRuleError,
  initializeComposedGame,
  initializeGame,
  replayGame,
  reduceComposedGame,
  reduceGame,
  type ComposedGameState,
  type GameState,
} from "@boardforge/game-engine";
import type {
  GameActionEnvelope,
  GameNightView,
  JoinRoomPayload,
  JoinRoomResult,
  LobbyView,
  RoomView,
  SocketAck,
} from "@boardforge/shared";
import type { RealtimeRoomStore, RoomEventRecord } from "./persistence";
import {
  assertGameNightCredential,
  enqueueGameNight,
  viewForGameNight,
  type GameNightRuntime,
  type GameNightRuntimeMap,
} from "./game-night-routes";
import {
  endGameNight,
  configureGameNightGame,
  openGameNightBoard,
  recordCompletedChildGame,
  selectGameNightCaptain,
  selectGameNightGame,
  selectGameNightTeam,
} from "./game-night-runtime";
import { launchGameNightGame } from "./game-night-launch";
import {
  gameNightSocketBoardOpenSchema,
  gameNightSocketCaptainSelectionSchema,
  gameNightSocketCompleteSchema,
  gameNightSocketGameLaunchSchema,
  gameNightSocketGameConfigurationSchema,
  gameNightSocketGameSelectionSchema,
  gameNightSocketSessionSchema,
  gameNightSocketTeamSelectionSchema,
} from "./game-night-schemas";
import {
  defaultGameNightConfiguration,
  gameNightConfigurationDefinition,
  validateGameNightConfiguration,
} from "./game-night-configuration";
import { adaptGameNightSpec } from "./game-night-spec";
import { issueReconnectToken, reconnectTokenMatches } from "./session-token";
import { systemCountdownClock, type CountdownClock } from "./countdown-clock";
import {
  checkpointChecksumMatches,
  emitRoom as broadcastRoom,
  enqueueRoom,
  persistedRoom,
  publicPlayers,
  refreshRoomCountdown,
  restoreRoomCountdown,
  restoreTimingStarts,
  sameRequestedAction,
  timingActionKind,
  viewFor,
  type Room,
} from "./room-runtime";
import {
  actionEnvelopeSchema,
  captainSelectionSchema,
  joinSchema,
  persistedEventSchema,
  persistedPlayersSchema,
  persistedStringMapSchema,
  persistedTeamPresentationMapSchema,
  teamSelectionSchema,
} from "./room-schemas";

type RealtimeGatewayDependencies = {
  app: FastifyInstance;
  io: SocketServer;
  rooms: Map<string, Room>;
  gameNights: GameNightRuntimeMap;
  gameNightCatalogIds: ReadonlySet<string>;
  createRoomCode: () => string;
  blueprintStore: RealtimeRoomStore;
  restoreRooms: boolean;
  countdownClock?: CountdownClock;
};

export async function registerRealtimeGateway({
  app,
  io,
  rooms,
  gameNights,
  gameNightCatalogIds,
  createRoomCode,
  blueprintStore,
  restoreRooms,
  countdownClock,
}: RealtimeGatewayDependencies): Promise<void> {
  const clock = countdownClock ?? systemCountdownClock;
  const countdownCancels = new Map<string, () => void>();
  const emitRoom = (room: Room) => broadcastRoom(io, room, clock.now());

  const gameNightForRoom = (room: Room) =>
    room.gameNightId ? [...gameNights.values()].find((runtime) => runtime.record.id === room.gameNightId) : undefined;

  function emitGameNight(runtime: GameNightRuntime): void {
    for (const [playerId, socketId] of runtime.socketByPlayer) {
      if (!io.sockets.sockets.has(socketId)) continue;
      io.to(socketId).emit("game-night:state", viewForGameNight(runtime.record, playerId));
    }
  }

  async function synchronizeCompletedGameNight(room: Room, state: ComposedGameState): Promise<void> {
    if (!room.gameNightId || state.status !== "completed") return;
    const runtime = gameNightForRoom(room);
    if (!runtime) throw new GameRuleError("The parent Game Night is unavailable.");
    await enqueueGameNight(runtime, async () => {
      const nextRecord = recordCompletedChildGame(runtime.record, room, state);
      const completedGame = nextRecord.state.completedGames.find((game) => game.gameInstanceId === room.gameInstanceId);
      if (!completedGame) throw new GameRuleError("The completed game was not added to the Game Night history.");
      const scoreEventIds = new Set(completedGame.scoreEventIds);
      const scoreEvents = nextRecord.state.scoreEvents.filter((event) => scoreEventIds.has(event.id));
      await blueprintStore.appendGameNightResult(nextRecord, completedGame, scoreEvents, room.code);
      runtime.record = nextRecord;
      emitGameNight(runtime);
    });
  }

  function cancelRoomCountdown(roomCode: string): void {
    countdownCancels.get(roomCode)?.();
    countdownCancels.delete(roomCode);
  }

  function scheduleRoomCountdown(room: Room, enteredPhaseAt: number): void {
    cancelRoomCountdown(room.code);
    const countdown = refreshRoomCountdown(room, enteredPhaseAt);
    if (!countdown) return;
    const expected = { ...countdown };
    const cancel = clock.schedule(
      () => {
        countdownCancels.delete(room.code);
        void expireRoomCountdown(room, expected).catch((error) =>
          app.log.error({ err: error, roomCode: room.code }, "Failed to resolve an expired turn timer"),
        );
      },
      Math.max(0, countdown.deadlineAt - clock.now()),
    );
    countdownCancels.set(room.code, cancel);
  }

  async function expireRoomCountdown(room: Room, expected: NonNullable<Room["countdown"]>): Promise<void> {
    const changed = await enqueueRoom(room, async () => {
      const countdown = room.countdown;
      const currentState = room.state;
      if (
        !countdown ||
        countdown.phaseVisit !== expected.phaseVisit ||
        countdown.deadlineAt !== expected.deadlineAt ||
        !currentState ||
        currentState.template !== "composed" ||
        room.spec.template !== "composed" ||
        currentState.status !== "playing"
      ) {
        return false;
      }
      const now = clock.now();
      if (now < countdown.deadlineAt) {
        scheduleRoomCountdown(room, now);
        return false;
      }
      const actorId = currentState.activePlayerId;
      const actor = room.players.get(actorId);
      if (!actor) throw new GameRuleError("The active player is unavailable for timer resolution.");
      const idempotencyKey = `turn_timer_${currentState.phaseVisit}_${currentState.revision}`;
      const action = {
        type: "COMPOSED_ACTION" as const,
        actionId: countdown.timeoutActionId,
      };
      const nextState = reduceComposedGame(
        currentState,
        { ...action, idempotencyKey },
        actorId,
        actor.isHost,
        room.spec,
      );
      const event: RoomEventRecord = {
        id: crypto.randomUUID(),
        roomCode: room.code,
        createdAt: new Date(now).toISOString(),
        sequence: room.eventSequence + 1,
        actorId,
        actorIsHost: actor.isHost,
        expectedRevision: currentState.revision,
        resultingRevision: nextState.revision,
        idempotencyKey,
        action,
      };
      await blueprintStore.appendRoomEvent(persistedRoom(room, nextState), event);
      room.state = nextState;
      room.eventSequence = event.sequence;
      scheduleRoomCountdown(room, now);
      await synchronizeCompletedGameNight(room, nextState);
      return true;
    });
    if (changed) emitRoom(room);
  }

  function acknowledge<T>(ack: ((response: SocketAck<T>) => void) | undefined, response: SocketAck<T>): void {
    ack?.(response);
  }

  function socketError(error: unknown): string {
    if (error instanceof GameRuleError || error instanceof ComposedGameRuleError || error instanceof GameNightRuleError)
      return error.message;
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

  function assertSocketOwnsGameNightPlayer(
    socket: Socket,
    runtime: GameNightRuntime,
    code: string,
    playerId: string,
  ): void {
    if (
      socket.data.gameNightCode !== code ||
      socket.data.gameNightPlayerId !== playerId ||
      runtime.socketByPlayer.get(playerId) !== socket.id
    ) {
      throw new GameNightRuleError("This connection is not authorized for that Game Night player.");
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
        const gameNightTeamByGameTeam = persistedStringMapSchema.parse(record.gameNightTeamByGameTeam);
        const gameNightTeamPresentationByGameTeam = persistedTeamPresentationMapSchema.parse(
          record.gameNightTeamPresentationByGameTeam,
        );
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
          gameNightId: record.gameNightId,
          gameInstanceId: record.gameInstanceId,
          gameNightTeamByGameTeam: new Map(Object.entries(gameNightTeamByGameTeam)),
          gameNightTeamPresentationByGameTeam: new Map(Object.entries(gameNightTeamPresentationByGameTeam)),
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
          countdown: null,
          state,
        };
        restoreRoomCountdown(room, events, clock.now());
        rooms.set(room.code, room);
        scheduleRoomCountdown(room, clock.now());
        await blueprintStore.saveRoom(persistedRoom(room));
        if (state?.template === "composed") await synchronizeCompletedGameNight(room, state);
      } catch (error) {
        app.log.error({ roomCode: record.code, err: error }, "Persisted room failed validation and was not restored");
      }
    }
  }

  if (restoreRooms) await restorePersistedRooms();

  io.on("connection", (socket: Socket) => {
    socket.on(
      "game-night:subscribe",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketSessionSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertGameNightCredential(runtime.record, parsed.playerId, parsed.reconnectToken);
            const player = runtime.record.players.find((candidate) => candidate.id === parsed.playerId);
            if (!player) throw new GameNightRuleError("Unknown Game Night player.");
            const previousSocketId = runtime.socketByPlayer.get(player.id);
            runtime.socketByPlayer.set(player.id, socket.id);
            socket.data.gameNightCode = parsed.code;
            socket.data.gameNightPlayerId = player.id;
            player.connected = true;
            await socket.join(`game-night:${parsed.code}`);
            if (previousSocketId && previousSocketId !== socket.id) {
              io.to(previousSocketId).emit("session:replaced");
              io.sockets.sockets.get(previousSocketId)?.disconnect(true);
            }
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, player.id) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:team:select",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketTeamSelectionSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            runtime.record = selectGameNightTeam(runtime.record, parsed.playerId, parsed.teamId);
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, parsed.playerId) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:board:open",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketBoardOpenSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            runtime.record = openGameNightBoard(runtime.record, parsed.playerId);
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, parsed.playerId) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:game:select",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketGameSelectionSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            const blueprint = gameNightCatalogIds.has(parsed.blueprintId)
              ? await blueprintStore.get(parsed.blueprintId)
              : undefined;
            if (blueprint?.status !== "release_ready") {
              throw new GameNightRuleError("This game is not available for Game Night.");
            }
            const adaptedSpec = adaptGameNightSpec(blueprint.spec, runtime.record.state.teams);
            const configuration = defaultGameNightConfiguration(adaptedSpec, runtime.record.state.teams.length);
            runtime.record = selectGameNightGame(runtime.record, parsed.playerId, blueprint.id, configuration);
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, parsed.playerId) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:game:configure",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketGameConfigurationSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            const blueprint = gameNightCatalogIds.has(parsed.blueprintId)
              ? await blueprintStore.get(parsed.blueprintId)
              : undefined;
            if (blueprint?.status !== "release_ready") {
              throw new GameNightRuleError("This game is not available for Game Night.");
            }
            const adaptedSpec = adaptGameNightSpec(blueprint.spec, runtime.record.state.teams);
            const definition = gameNightConfigurationDefinition(adaptedSpec, runtime.record.state.teams.length);
            if (!definition) throw new GameNightRuleError("This game does not expose configurable rounds.");
            const configuration = validateGameNightConfiguration(definition, parsed.configuration);
            runtime.record = configureGameNightGame(runtime.record, parsed.playerId, parsed.blueprintId, configuration);
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, parsed.playerId) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:captain:select",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketCaptainSelectionSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            if (!runtime.record.state.selectedBlueprintId) {
              throw new GameNightRuleError("Choose the next game before selecting captains.");
            }
            runtime.record = selectGameNightCaptain(
              runtime.record,
              parsed.playerId,
              parsed.teamId,
              parsed.captainPlayerId,
            );
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, parsed.playerId) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:game:launch",
      async (
        payload: unknown,
        ack?: (response: SocketAck<{ view: GameNightView; roomCode: string; gameInstanceId: string }>) => void,
      ) => {
        try {
          const parsed = gameNightSocketGameLaunchSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            if (runtime.record.state.selectedBlueprintId !== parsed.blueprintId) {
              throw new GameNightRuleError("Choose this game on the Game Night board before launching it.");
            }
            const room = await launchGameNightGame({
              runtime,
              playerId: parsed.playerId,
              blueprintId: parsed.blueprintId,
              blueprintStore,
              rooms,
              createRoomCode,
              ...(runtime.record.state.selectedGameConfiguration
                ? { configuration: runtime.record.state.selectedGameConfiguration }
                : {}),
            });
            const view = viewForGameNight(runtime.record, parsed.playerId);
            if (!room.gameInstanceId) throw new GameNightRuleError("The game room has no instance id.");
            acknowledge(ack, {
              ok: true,
              data: { view, roomCode: room.code, gameInstanceId: room.gameInstanceId },
            });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game-night:complete",
      async (payload: unknown, ack?: (response: SocketAck<{ view: GameNightView }>) => void) => {
        try {
          const parsed = gameNightSocketCompleteSchema.parse(payload);
          const runtime = gameNights.get(parsed.code);
          if (!runtime) throw new GameNightRuleError("Game night not found.");
          await enqueueGameNight(runtime, async () => {
            assertSocketOwnsGameNightPlayer(socket, runtime, parsed.code, parsed.playerId);
            runtime.record = endGameNight(runtime.record, parsed.playerId);
            await blueprintStore.saveGameNight(runtime.record);
            acknowledge(ack, { ok: true, data: { view: viewForGameNight(runtime.record, parsed.playerId) } });
            emitGameNight(runtime);
          });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on("room:join", async (payload: JoinRoomPayload, ack?: (response: SocketAck<JoinRoomResult>) => void) => {
      try {
        const parsed = joinSchema.parse(payload);
        const room = rooms.get(parsed.code);
        if (!room) throw new GameRuleError("Room not found.");

        let playerId = parsed.playerId;
        let player = playerId ? room.players.get(playerId) : undefined;
        if (room.gameNightId && !playerId) {
          throw new GameRuleError("Join this game through its Game Night board.");
        }
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
        const parentGameNight = gameNightForRoom(room);
        if (room.gameNightId && !parentGameNight) throw new GameRuleError("The parent Game Night is unavailable.");
        if (parentGameNight) {
          parentGameNight.record.reconnectTokenHashes[resolvedPlayerId] = reconnectCredential.hash;
          const parentPlayer = parentGameNight.record.players.find((candidate) => candidate.id === resolvedPlayerId);
          if (!parentPlayer) throw new GameRuleError("The player does not belong to the parent Game Night.");
          parentPlayer.name = player.name;
          parentPlayer.connected = true;
        }
        room.socketByPlayer.set(resolvedPlayerId, socket.id);
        socket.data.roomCode = room.code;
        socket.data.playerId = resolvedPlayerId;
        void socket.join(room.code);
        if (previousSocketId && previousSocketId !== socket.id) {
          io.to(previousSocketId).emit("session:replaced");
          io.sockets.sockets.get(previousSocketId)?.disconnect(true);
        }

        await blueprintStore.saveRoom(persistedRoom(room));
        if (parentGameNight) {
          await blueprintStore.saveGameNight(parentGameNight.record);
          emitGameNight(parentGameNight);
        }
        const view = viewFor(room, resolvedPlayerId, clock.now());
        acknowledge(ack, {
          ok: true,
          data: {
            playerId: resolvedPlayerId,
            reconnectToken: reconnectCredential.token,
            ...(room.gameNightId ? { gameNightId: room.gameNightId } : {}),
            ...(parentGameNight ? { gameNightCode: parentGameNight.record.code } : {}),
            view,
          },
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
          acknowledge(ack, { ok: true, data: { view: viewFor(room, parsed.playerId, clock.now()) as LobbyView } });
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
          acknowledge(ack, { ok: true, data: { view: viewFor(room, parsed.playerId, clock.now()) as LobbyView } });
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
          const lobbyView = viewFor(room, payload.playerId, clock.now());
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
          scheduleRoomCountdown(room, clock.now());
          emitRoom(room);
          acknowledge(ack, { ok: true, data: { view: viewFor(room, payload.playerId, clock.now()) } });
        } catch (error) {
          acknowledge(ack, { ok: false, error: socketError(error) });
        }
      },
    );

    socket.on(
      "game:action",
      async (payload: GameActionEnvelope, ack?: (response: SocketAck<{ revision: number }>) => void) => {
        try {
          const receivedAt = clock.now();
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
            if (
              currentState.template === "composed" &&
              room.countdown?.phaseVisit === currentState.phaseVisit &&
              receivedAt >= room.countdown.deadlineAt
            ) {
              throw new GameRuleError("Time is up.");
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
            scheduleRoomCountdown(room, receivedAt);
            if (nextState.template === "composed") await synchronizeCompletedGameNight(room, nextState);
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
      const gameNightCode = socket.data.gameNightCode as string | undefined;
      const gameNightPlayerId = socket.data.gameNightPlayerId as string | undefined;
      const gameNight = gameNightCode ? gameNights.get(gameNightCode) : undefined;
      if (gameNight && gameNightPlayerId && gameNight.socketByPlayer.get(gameNightPlayerId) === socket.id) {
        void enqueueGameNight(gameNight, async () => {
          if (gameNight.socketByPlayer.get(gameNightPlayerId) !== socket.id) return;
          gameNight.socketByPlayer.delete(gameNightPlayerId);
          const player = gameNight.record.players.find((candidate) => candidate.id === gameNightPlayerId);
          if (player) player.connected = false;
          await blueprintStore.saveGameNight(gameNight.record);
          emitGameNight(gameNight);
        }).catch((error) => app.log.error({ error, gameNightCode }, "Failed to persist Game Night disconnect"));
      }

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
        const parentGameNight = gameNightForRoom(room);
        const parentPlayer = parentGameNight?.record.players.find((candidate) => candidate.id === playerId);
        if (parentGameNight && parentPlayer) {
          parentPlayer.connected = false;
          await blueprintStore.saveGameNight(parentGameNight.record);
          emitGameNight(parentGameNight);
        }
        emitRoom(room);
      }).catch((error) => app.log.error({ error, roomCode: room.code }, "Failed to persist disconnect"));
    });
  });

  app.addHook("onClose", async () => {
    for (const cancel of countdownCancels.values()) cancel();
    countdownCancels.clear();
  });
}
