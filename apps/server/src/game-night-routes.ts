import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createGameNightState, GameNightRuleError } from "@boardforge/game-engine";
import type { GameNightView, JoinGameNightResult } from "@boardforge/shared";
import { createGameNightChildRoom, linkGameNightToChildRoom } from "./game-night-runtime";
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

const credentialsSchema = z
  .object({
    playerId: z.string().uuid(),
    reconnectToken: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
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

const teamSelectionBodySchema = credentialsSchema.extend({ teamId: z.string().min(1).max(80) }).strict();
const captainBodySchema = credentialsSchema
  .extend({ teamId: z.string().min(1).max(80), captainPlayerId: z.string().uuid() })
  .strict();
const launchBodySchema = credentialsSchema.extend({ blueprintId: z.string().trim().min(1).max(160) }).strict();

type GameNightRuntime = {
  record: GameNightSessionRecord;
  operationQueue: Promise<void>;
};

export type GameNightRuntimeMap = Map<string, GameNightRuntime>;

type GameNightRouteDependencies = {
  blueprintStore: BlueprintStore;
  rooms: Map<string, Room>;
  createRoomCode: () => string;
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

function viewForGameNight(record: GameNightSessionRecord, playerId: string): GameNightView {
  const self = record.players.find((player) => player.id === playerId);
  if (!self) throw new GameNightRuleError("Unknown game-night player.");
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
    currentRoomCode: record.currentRoomCode,
    gamesPlayed: record.state.completedGames.length,
  };
}

function assertCredential(record: GameNightSessionRecord, playerId: string, reconnectToken: string): void {
  const expectedHash = record.reconnectTokenHashes[playerId];
  if (!record.players.some((player) => player.id === playerId) || !expectedHash) {
    throw new GameNightRuleError("This game-night session is no longer valid.");
  }
  if (!reconnectTokenMatches(reconnectToken, expectedHash)) {
    throw new GameNightRuleError("This game-night session is no longer valid.");
  }
}

function enqueueGameNight<T>(runtime: GameNightRuntime, operation: () => Promise<T>): Promise<T> {
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
  { blueprintStore, rooms, createRoomCode }: GameNightRouteDependencies,
): Promise<GameNightRuntimeMap> {
  const gameNights: GameNightRuntimeMap = new Map();
  for (const persisted of await blueprintStore.loadGameNights()) {
    const record = {
      ...persisted,
      players: persisted.players.map((player) => ({ ...player, connected: false })),
    };
    gameNights.set(record.code, { record, operationQueue: Promise.resolve() });
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
    gameNights.set(code, { record, operationQueue: Promise.resolve() });
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
      code: runtime.record.code,
      status: runtime.record.state.status,
      playerCount: runtime.record.players.length,
      teams: runtime.record.state.teams.map((team) => ({ id: team.id, name: team.name, color: team.color })),
      currentRoomCode: runtime.record.currentRoomCode,
    };
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
          assertCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
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
        assertCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        if (runtime.record.currentRoomCode) throw new GameNightRuleError("Teams are locked during a game.");
        const target = runtime.record.state.teams.find((team) => team.id === parsed.data.teamId);
        if (!target) throw new GameNightRuleError("Unknown team.");
        if (!target.playerIds.includes(parsed.data.playerId) && target.playerIds.length >= 6)
          throw new GameNightRuleError("This team is full.");
        runtime.record.state.teams = runtime.record.state.teams.map((team) => ({
          ...team,
          playerIds:
            team.id === target.id
              ? [...team.playerIds.filter((id) => id !== parsed.data.playerId), parsed.data.playerId]
              : team.playerIds.filter((id) => id !== parsed.data.playerId),
          ...(team.captainPlayerId === parsed.data.playerId && team.id !== target.id
            ? { captainPlayerId: undefined }
            : {}),
        }));
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
        assertCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        if (parsed.data.playerId !== runtime.record.hostPlayerId)
          throw new GameNightRuleError("Only the host can choose captains.");
        if (runtime.record.currentRoomCode) throw new GameNightRuleError("Captains are locked during a game.");
        const team = runtime.record.state.teams.find((candidate) => candidate.id === parsed.data.teamId);
        if (!team) throw new GameNightRuleError("Unknown team.");
        if (!team.playerIds.includes(parsed.data.captainPlayerId))
          throw new GameNightRuleError("The captain must belong to the selected team.");
        team.captainPlayerId = parsed.data.captainPlayerId;
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
        assertCredential(runtime.record, parsed.data.playerId, parsed.data.reconnectToken);
        if (parsed.data.playerId !== runtime.record.hostPlayerId)
          throw new GameNightRuleError("Only the host can launch a game.");
        const blueprint = await blueprintStore.get(parsed.data.blueprintId);
        if (blueprint?.status !== "release_ready") throw new GameNightRuleError("This game is not ready to play.");
        const room = createGameNightChildRoom({
          session: runtime.record,
          blueprintId: blueprint.id,
          spec: blueprint.spec,
          roomCode: createRoomCode(),
          gameInstanceId: crypto.randomUUID(),
        });
        const linked = linkGameNightToChildRoom(runtime.record, room);
        await blueprintStore.saveRoom(persistedRoom(room));
        await blueprintStore.saveGameNight(linked);
        runtime.record = linked;
        rooms.set(room.code, room);
        return room;
      });
      return reply.code(201).send({ code: launched.code, gameInstanceId: launched.gameInstanceId });
    } catch (error) {
      const failure = gameNightError(error);
      return reply.code(failure.status).send({ error: failure.message });
    }
  });

  return gameNights;
}
