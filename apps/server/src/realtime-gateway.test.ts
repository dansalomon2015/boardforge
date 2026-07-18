import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { JoinRoomResult, SocketAck } from "@boardforge/shared";
import { defaultMovieMimeSpec } from "@boardforge/game-spec";
import { createBoardForgeServer } from "./app";

describe("realtime room gateway", () => {
  let client: Socket | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    client?.disconnect();
    await closeServer?.();
  });

  it("creates a room and returns a player-scoped lobby over Socket.IO", async () => {
    const { app, io } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      logger: false,
      restoreRooms: false,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    closeServer = async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close();
    };

    const catalogResponse = await app.inject({ method: "GET", url: "/api/games" });
    const catalog = catalogResponse.json<{ games: Array<{ id: string }> }>();
    const roomResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { blueprintId: catalog.games[0]?.id },
    });
    expect(roomResponse.statusCode).toBe(201);
    const { code } = roomResponse.json<{ code: string }>();

    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server address.");
    client = createSocketClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client?.once("connect", resolve);
      client?.once("connect_error", reject);
    });

    const result = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
      client?.emit("room:join", { code, name: "Ada" }, resolve);
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.reconnectToken).toMatch(/^[A-Za-z0-9_-]{40,64}$/);
    expect(result.data.view).toMatchObject({
      kind: "lobby",
      code,
      selfPlayerId: result.data.playerId,
      players: [{ id: result.data.playerId, name: "Ada", isHost: true, connected: true }],
    });
  });

  it("preserves Game Night identity and synchronizes rotated reconnect credentials", async () => {
    const { app, io } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      logger: false,
      restoreRooms: false,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    closeServer = async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close();
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/game-nights",
      payload: { hostName: "Maya", teams: [{ name: "Red" }, { name: "Blue" }] },
    });
    const host = created.json<{ playerId: string; reconnectToken: string; view: { code: string; id: string } }>();
    const joined = await app.inject({
      method: "POST",
      url: `/api/game-nights/${host.view.code}/join`,
      payload: { name: "Noah" },
    });
    const guest = joined.json<{ playerId: string; reconnectToken: string }>();
    for (const selection of [
      { player: host, teamId: "team_1" },
      { player: guest, teamId: "team_2" },
    ]) {
      await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${host.view.code}/team`,
        payload: {
          playerId: selection.player.playerId,
          reconnectToken: selection.player.reconnectToken,
          teamId: selection.teamId,
        },
      });
    }
    for (const captain of [
      { teamId: "team_1", captainPlayerId: host.playerId },
      { teamId: "team_2", captainPlayerId: guest.playerId },
    ]) {
      await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${host.view.code}/captain`,
        payload: { playerId: host.playerId, reconnectToken: host.reconnectToken, ...captain },
      });
    }
    const launched = await app.inject({
      method: "POST",
      url: `/api/game-nights/${host.view.code}/games`,
      payload: {
        playerId: host.playerId,
        reconnectToken: host.reconnectToken,
        blueprintId: defaultMovieMimeSpec.id,
      },
    });
    const childCode = launched.json<{ code: string }>().code;

    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server address.");
    client = createSocketClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client?.once("connect", resolve);
      client?.once("connect_error", reject);
    });

    const anonymous = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
      client?.emit("room:join", { code: childCode, name: "Maya" }, resolve);
    });
    expect(anonymous).toMatchObject({ ok: false, error: "Join this game through its Game Night board." });

    const childJoin = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
      client?.emit(
        "room:join",
        {
          code: childCode,
          name: "Maya",
          playerId: host.playerId,
          reconnectToken: host.reconnectToken,
        },
        resolve,
      );
    });
    expect(childJoin.ok).toBe(true);
    if (!childJoin.ok) throw new Error(childJoin.error);
    expect(childJoin.data.gameNightId).toBe(host.view.id);
    expect(childJoin.data.playerId).toBe(host.playerId);

    const parentReconnect = await app.inject({
      method: "POST",
      url: `/api/game-nights/${host.view.code}/join`,
      payload: {
        name: "Maya",
        playerId: host.playerId,
        reconnectToken: childJoin.data.reconnectToken,
      },
    });
    expect(parentReconnect.statusCode).toBe(200);
    const rotatedAgain = parentReconnect.json<{ reconnectToken: string }>().reconnectToken;

    client.disconnect();
    client = createSocketClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client?.once("connect", resolve);
      client?.once("connect_error", reject);
    });
    const childReconnect = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
      client?.emit(
        "room:join",
        { code: childCode, name: "Maya", playerId: host.playerId, reconnectToken: rotatedAgain },
        resolve,
      );
    });
    expect(childReconnect.ok).toBe(true);
  });
});
