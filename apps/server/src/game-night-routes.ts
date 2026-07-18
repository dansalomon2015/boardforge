import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BoardGameSpec } from "@boardforge/game-spec";
import { createGameNightState, GameNightRuleError } from "@boardforge/game-engine";
import type { GameNightCatalogEntry, GameNightView, JoinGameNightResult } from "@boardforge/shared";
import { gameSummary } from "./game-catalog";
import { evaluateGameNightCompatibility } from "./game-night-compatibility";
import { GameNightLaunchError, launchGameNightGame } from "./game-night-launch";
import { adaptGameNightSpec } from "./game-night-spec";
import { selectGameNightCaptain, selectGameNightTeam } from "./game-night-runtime";
import { gameNightCredentialsSchema } from "./game-night-schemas";
import type { BlueprintStore, GameNightSessionRecord } from "./persistence";
import type { Room } from "./room-runtime";
import { persistedRoom } from "./room-runtime";
import { issueReconnectToken, reconnectTokenMatches } from "./session-token";

const teamColors = ["#ff5c5c", "#5b8cff", "#f4c84a", "#42c98b"];

const createBodySchema = z
  .object({
    hostName: z.string().trim().min(1).max(24),
    teams: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(24),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();

const joinBodySchema = z
  .object({
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

const teamSelectionBodySchema = gameNightCredentialsSchema.extend({ teamId: z.string().min(1).max(80) }).strict();
const captainBodySchema = gameNightCredentialsSchema
  .extend({ teamId: z.string().min(1).max(80), captainPlayerId: z.string().uuid() })
  .strict();
const launchBodySchema = gameNightCredentialsSchema.extend({ blueprintId: z.string().trim().min(1).max(160) }).strict();

export type GameNightRuntime = {
  record: GameNightSessionRecord;
  operationQueue: Promise<void>;
  socketByPlayer: Map<string, string>;
};

export type GameNightRuntimeMap = Map<string, GameNightRuntime>;

type GameNightRouteDependencies = {
  blueprintStore: BlueprintStore;
  rooms: Map<string, Room>;
  createRoomCode: () => string;
  gameNightCatalog: BoardGameSpec[];
};

function allocateGameNightCode(gameNights: GameNightRuntimeMap): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!gameNights.has(code)) return code;
  }
  throw new GameNightRuleError("Could not allocate a unique game-night code.");
}

export function viewForGameNight(record: GameNightSessionRecord, playerId: string): GameNightView {
  const self = record.players.find((player) => player.id === playerId);
  if (!self) throw new GameNightRuleError("Unknown game-night player.");
  const scoreEventById = new Map(record.state.scoreEvents.map((event) => [event.id, event]));
  return {
    id: record.id,
    code: record.code,
    status: record.state.status,
    selfPlayerId: playerId,
    isHost: self.isHost,
    players: record.players,
    teams: record.state.teams.map((team, index) => ({
      id: team.id,
      name: team.name,
      color: team.color ?? teamColors[index % teamColors.length]!,
      playerIds: team.playerIds,
      ...(team.captainPlayerId ? { captainPlayerId: team.captainPlayerId } : {}),
      score: record.state.scores[team.id] ?? 0,
    })),
    selectedBlueprintId: record.state.selectedBlueprintId,
    currentRoomCode: record.currentRoomCode,
    gamesPlayed: record.state.completedGames.length,
    history: record.state.completedGames.map((game, index) => ({
      ordinal: index + 1,
      gameInstanceId: game.gameInstanceId,
      blueprintId: game.blueprintId,
      winner: structuredClone(game.winner),
      awards: game.scoreEventIds.flatMap((eventId) => {
        const event = scoreEventById.get(eventId);
        return event ? [{ teamId: event.teamId, points: event.points, reason: event.reason }] : [];
      }),
    })),
  };
}

export function assertGameNightCredential(
  record: GameNightSessionRecord,
  playerId: string,
  reconnectToken: string,
): void {
  const expectedHash = record.reconnectTokenHashes[playerId];
  if (!record.players.some((player) => player.id === playerId) || !expectedHash) {
    throw new GameNightRuleError("This game-night session is no longer valid.");
  }
  if (!reconnectTokenMatches(reconnectToken, expectedHash)) {
    throw new GameNightRuleError("This game-night session is no longer valid.");
  }
}

export function enqueueGameNight<T>(runtime: GameNightRuntime, operation: () => Promise<T>): Promise<T> {
  const result = runtime.operationQueue.then(operation, operation);
  runtime.operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function gameNightError(error: unknown): { status: number; message: string } {
  if (error instanceof GameNightRuleError) return { status: 409, message: error.message };
  return { status: 500, message: "Unexpected server error." };
}

export async function registerGameNightRoutes(
  app: FastifyInstance,
  { blueprintStore, rooms, createRoomCode, gameNightCatalog }: GameNightRouteDependencies,
): Promise<GameNightRuntimeMap> {
  const gameNights: GameNightRuntimeMap = new Map();
  for (const persisted of await blueprintStore.loadGameNights()) {
    const record = {
      ...persisted,
      players: persisted.players.map((player) => ({ ...player, connected: false })),
    };
    gameNights.set(record.code, { record, operationQueue: Promise.resolve(), socketByPlayer: new Map() });
  }

  app.post("/api/game-nights", async (request, reply) => {
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid game-night setup." });
    const id = crypto.randomUUID();
    const code = allocateGameNightCode(gameNights);
    const hostPlayerId = crypto.randomUUID();
    const credential = issueReconnectToken();
    const players = [{ id: hostPlayerId, name: parsed.data.hostName, isHost: true, connected: true }];
    const state = createGameNightState(
      id,
      parsed.data.teams.map((team, index) => ({
        id: `team_${index + 1}`,
        name: team.name,
        color: team.color ?? teamColors[index]!,
        playerIds: [],
      })),
    );
    const record: GameNightSessionRecord = {
      id,
      code,
      hostPlayerId,
      players,
      reconnectTokenHashes: { [hostPlayerId]: credential.hash },
      state,
      currentRoomCode: null,
    };
    await blueprintStore.saveGameNight(record);
    gameNights.set(code, { record, operationQueue: Promise.resolve(), socketByPlayer: new Map() });
    const result: JoinGameNightResult = {
      playerId: hostPlayerId,
      reconnectToken: credential.token,
      view: viewForGameNight(record, hostPlayerId),
    };
    return reply.code(201).send(result);
  });

  app.get<{ Params: { code: string } }>("/api/game-nights/:code", async (request, reply) => {
    const runtime = gameNights.get(request.params.code.toUpperCase());
    if (!runtime) return reply.code(404).send({ error: "Game night not found." });
    return {
      id: runtime.record.id,
      code: runtime.record.code,
      status: runtime.record.state.status,
      playerCount: runtime.record.players.length,
      teams: runtime.record.state.teams.map((team) => ({ id: team.id, name: team.name, color: team.color })),
      currentRoomCode: runtime.record.currentRoomCode,
    };
  });

  app.get<{ Params: { code: string } }>("/api/game-nights/:code/catalog", async (request, reply) => {
    const runtime = gameNights.get(request.params.code.toUpperCase());
    if (!runtime) return reply.code(404).send({ error: "Game night not found." });
    const games = await Promise.all(
      gameNightCatalog.map(async (catalogSpec): Promise<GameNightCatalogEntry> => {
        const blueprint = await blueprintStore.get(catalogSpec.id);
        const spec = blueprint?.spec ?? catalogSpec;
        const adaptedSpec = adaptGameNightSpec(spec, runtime.record.state.teams);
        return {
          id: spec.id,
          game: gameSummary(adaptedSpec),
          compatibility: evaluateGameNightCompatibility(runtime.record, spec, blueprint?.status === "release_ready"),
        };
      }),
    );
    return { games };
  });

  app.post<{ Params: { code: string } }>("/api/game-nights/:code/join", async (request, reply) => {
    const parsed = joinBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid join request." });
    const runtime = gameNights.get(request.params.code.toUpperCase());
    if (!runtime) return reply.code(404).send({ error: "Game night not found." });
    try {
      const result = await enqueueGameNight(runtime, async (): Promise<JoinGameNightResult> => {
        let player = parsed.data.playerId
          ? runtime.record.players.find((candidate) => candidate.id === parsed.data.playerId)
          : undefined;
        if (parsed.data.playerId && parsed.data.reconnectToken) {
          assertGameNightCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        } else if (runtime.record.state.status !== "lobby") {
          throw new GameNightRuleError("This game night has already started.");
        }
        if (!player) {
          if (runtime.record.players.length >= 12) throw new GameNightRuleError("This game night is full.");
          player = { id: crypto.randomUUID(), name: parsed.data.name, isHost: false, connected: true };
          runtime.record.players.push(player);
        } else {
          player.name = parsed.data.name;
          player.connected = true;
        }
        const credential = issueReconnectToken();
        runtime.record.reconnectTokenHashes[player.id] = credential.hash;
        const activeRoom = runtime.record.currentRoomCode ? rooms.get(runtime.record.currentRoomCode) : undefined;
        if (runtime.record.currentRoomCode && !activeRoom)
          throw new GameNightRuleError("The active game room is unavailable.");
        if (activeRoom) {
          activeRoom.reconnectTokenHashes.set(player.id, credential.hash);
          await blueprintStore.saveRoom(persistedRoom(activeRoom));
        }
        await blueprintStore.saveGameNight(runtime.record);
        return {
          playerId: player.id,
          reconnectToken: credential.token,
          view: viewForGameNight(runtime.record, player.id),
        };
      });
      return reply.send(result);
    } catch (error) {
      const failure = gameNightError(error);
      return reply.code(failure.status).send({ error: failure.message });
    }
  });

  app.patch<{ Params: { code: string } }>("/api/game-nights/:code/team", async (request, reply) => {
    const parsed = teamSelectionBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid team selection." });
    const runtime = gameNights.get(request.params.code.toUpperCase());
    if (!runtime) return reply.code(404).send({ error: "Game night not found." });
    try {
      const view = await enqueueGameNight(runtime, async () => {
        assertGameNightCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        runtime.record = selectGameNightTeam(runtime.record, parsed.data.playerId, parsed.data.teamId);
        await blueprintStore.saveGameNight(runtime.record);
        return viewForGameNight(runtime.record, parsed.data.playerId);
      });
      return reply.send({ view });
    } catch (error) {
      const failure = gameNightError(error);
      return reply.code(failure.status).send({ error: failure.message });
    }
  });

  app.patch<{ Params: { code: string } }>("/api/game-nights/:code/captain", async (request, reply) => {
    const parsed = captainBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid captain selection." });
    const runtime = gameNights.get(request.params.code.toUpperCase());
    if (!runtime) return reply.code(404).send({ error: "Game night not found." });
    try {
      const view = await enqueueGameNight(runtime, async () => {
        assertGameNightCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        if (parsed.data.playerId !== runtime.record.hostPlayerId)
          throw new GameNightRuleError("Only the host can choose captains.");
        if (runtime.record.currentRoomCode) throw new GameNightRuleError("Captains are locked during a game.");
        runtime.record = selectGameNightCaptain(
          runtime.record,
          parsed.data.playerId,
          parsed.data.teamId,
          parsed.data.captainPlayerId,
        );
        await blueprintStore.saveGameNight(runtime.record);
        return viewForGameNight(runtime.record, parsed.data.playerId);
      });
      return reply.send({ view });
    } catch (error) {
      const failure = gameNightError(error);
      return reply.code(failure.status).send({ error: failure.message });
    }
  });

  app.post<{ Params: { code: string } }>("/api/game-nights/:code/games", async (request, reply) => {
    const parsed = launchBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid game launch request." });
    const runtime = gameNights.get(request.params.code.toUpperCase());
    if (!runtime) return reply.code(404).send({ error: "Game night not found." });
    try {
      const launched = await enqueueGameNight(runtime, async () => {
        assertGameNightCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        return launchGameNightGame({
          runtime,
          playerId: parsed.data.playerId,
          blueprintId: parsed.data.blueprintId,
          blueprintStore,
          rooms,
          createRoomCode,
        });
      });
      return reply.code(201).send({ code: launched.code, gameInstanceId: launched.gameInstanceId });
    } catch (error) {
      if (error instanceof GameNightLaunchError) {
        return reply.code(409).send({ error: error.message, compatibility: error.compatibility });
      }
      const failure = gameNightError(error);
      return reply.code(failure.status).send({ error: failure.message });
    }
  });

  return gameNights;
}
