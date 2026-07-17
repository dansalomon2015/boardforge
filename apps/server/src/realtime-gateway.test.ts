import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { JoinRoomResult, SocketAck } from "@boardforge/shared";
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
});
