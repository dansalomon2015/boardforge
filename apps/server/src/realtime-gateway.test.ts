import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { JoinRoomResult, SocketAck } from "@boardforge/shared";
import { defaultMovieMimeSpec } from "@boardforge/game-spec";
import { createBoardForgeServer } from "./app";

describe("realtime room gateway", () => {
  let client: Socket | undefined;
  let secondClient: Socket | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    client?.disconnect();
    secondClient?.disconnect();
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

  it("broadcasts Game Night lobby changes and host-only board opening to every subscribed player", async () => {
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
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server address.");
    const connect = async () => {
      const socket = createSocketClient(`http://127.0.0.1:${address.port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    };
    client = await connect();
    secondClient = await connect();

    const subscribe = (socket: Socket, session: { playerId: string; reconnectToken: string }) =>
      new Promise<SocketAck<{ view: { selfPlayerId: string } }>>((resolve) => {
        socket.emit(
          "game-night:subscribe",
          {
            code: host.view.code,
            playerId: session.playerId,
            reconnectToken: session.reconnectToken,
          },
          resolve,
        );
      });
    const hostSubscription = await subscribe(client, host);
    if (!hostSubscription.ok) throw new Error(hostSubscription.error);
    expect(hostSubscription).toMatchObject({ ok: true, data: { view: { selfPlayerId: host.playerId } } });
    const guestSubscription = await subscribe(secondClient, guest);
    if (!guestSubscription.ok) throw new Error(guestSubscription.error);
    expect(guestSubscription).toMatchObject({
      ok: true,
      data: { view: { selfPlayerId: guest.playerId } },
    });

    const waitForState = <T>(socket: Socket, predicate: (view: T) => boolean) =>
      new Promise<T>((resolve) => {
        const handler = (view: T) => {
          if (!predicate(view)) return;
          socket.off("game-night:state", handler);
          resolve(view);
        };
        socket.on("game-night:state", handler);
      });
    const teamUpdate = new Promise<{ teams: Array<{ id: string; playerIds: string[] }> }>((resolve) => {
      void waitForState<{ teams: Array<{ id: string; playerIds: string[] }> }>(
        client!,
        (view) => view.teams.find((team) => team.id === "team_2")?.playerIds.includes(guest.playerId) === true,
      ).then(resolve);
    });
    const selection = await new Promise<SocketAck<{ view: { selfPlayerId: string } }>>((resolve) => {
      secondClient?.emit(
        "game-night:team:select",
        { code: host.view.code, playerId: guest.playerId, teamId: "team_2" },
        resolve,
      );
    });
    expect(selection.ok).toBe(true);
    expect((await teamUpdate).teams.find((team) => team.id === "team_2")?.playerIds).toContain(guest.playerId);

    const hostSelection = await new Promise<SocketAck<{ view: { selfPlayerId: string } }>>((resolve) => {
      client?.emit(
        "game-night:team:select",
        { code: host.view.code, playerId: host.playerId, teamId: "team_1" },
        resolve,
      );
    });
    expect(hostSelection.ok).toBe(true);

    const unauthorizedOpening = await new Promise<SocketAck<{ view: { status: string } }>>((resolve) => {
      secondClient?.emit("game-night:board:open", { code: host.view.code, playerId: guest.playerId }, resolve);
    });
    expect(unauthorizedOpening).toMatchObject({ ok: false, error: "Only the host can open the Game Night board." });

    const guestBoardUpdate = waitForState<{ status: string }>(secondClient, (view) => view.status === "playing");
    const opened = await new Promise<SocketAck<{ view: { status: string } }>>((resolve) => {
      client?.emit("game-night:board:open", { code: host.view.code, playerId: host.playerId }, resolve);
    });
    expect(opened).toMatchObject({ ok: true, data: { view: { status: "playing" } } });
    expect(await guestBoardUpdate).toMatchObject({ status: "playing" });

    const unauthorizedSelection = await new Promise<SocketAck<{ view: { selectedBlueprintId: string | null } }>>(
      (resolve) => {
        secondClient?.emit(
          "game-night:game:select",
          { code: host.view.code, playerId: guest.playerId, blueprintId: defaultMovieMimeSpec.id },
          resolve,
        );
      },
    );
    expect(unauthorizedSelection).toMatchObject({ ok: false, error: "Only the host can choose the next game." });

    const guestSelectionUpdate = waitForState<{ selectedBlueprintId: string | null }>(
      secondClient,
      (view) => view.selectedBlueprintId === defaultMovieMimeSpec.id,
    );
    const selected = await new Promise<SocketAck<{ view: { selectedBlueprintId: string | null } }>>((resolve) => {
      client?.emit(
        "game-night:game:select",
        { code: host.view.code, playerId: host.playerId, blueprintId: defaultMovieMimeSpec.id },
        resolve,
      );
    });
    expect(selected).toMatchObject({
      ok: true,
      data: { view: { selectedBlueprintId: defaultMovieMimeSpec.id } },
    });
    expect(await guestSelectionUpdate).toMatchObject({ selectedBlueprintId: defaultMovieMimeSpec.id });

    const disconnectedUpdate = new Promise<{ players: Array<{ id: string; connected: boolean }> }>((resolve) => {
      void waitForState<{ players: Array<{ id: string; connected: boolean }> }>(
        client!,
        (view) => view.players.find((player) => player.id === guest.playerId)?.connected === false,
      ).then(resolve);
    });
    secondClient.disconnect();
    expect((await disconnectedUpdate).players.find((player) => player.id === guest.playerId)?.connected).toBe(false);

    secondClient = await connect();
    const resumedBoard = await subscribe(secondClient, guest);
    expect(resumedBoard).toMatchObject({
      ok: true,
      data: {
        view: {
          selfPlayerId: guest.playerId,
          status: "playing",
          selectedBlueprintId: defaultMovieMimeSpec.id,
        },
      },
    });

    const unauthorizedCaptain = await new Promise<SocketAck<{ view: { selfPlayerId: string } }>>((resolve) => {
      secondClient?.emit(
        "game-night:captain:select",
        { code: host.view.code, playerId: guest.playerId, teamId: "team_2", captainPlayerId: guest.playerId },
        resolve,
      );
    });
    expect(unauthorizedCaptain).toMatchObject({ ok: false, error: "Only the host can choose captains." });

    const captainsReady = waitForState<{
      teams: Array<{ id: string; captainPlayerId?: string }>;
    }>(
      secondClient,
      (view) =>
        view.teams.find((team) => team.id === "team_1")?.captainPlayerId === host.playerId &&
        view.teams.find((team) => team.id === "team_2")?.captainPlayerId === guest.playerId,
    );
    for (const captain of [
      { teamId: "team_1", captainPlayerId: host.playerId },
      { teamId: "team_2", captainPlayerId: guest.playerId },
    ]) {
      const captainSelection = await new Promise<SocketAck<{ view: { selfPlayerId: string } }>>((resolve) => {
        client?.emit(
          "game-night:captain:select",
          { code: host.view.code, playerId: host.playerId, ...captain },
          resolve,
        );
      });
      expect(captainSelection.ok).toBe(true);
    }
    expect(await captainsReady).toMatchObject({
      teams: expect.arrayContaining([
        expect.objectContaining({ id: "team_1", captainPlayerId: host.playerId }),
        expect.objectContaining({ id: "team_2", captainPlayerId: guest.playerId }),
      ]),
    });

    const unauthorizedLaunch = await new Promise<SocketAck<{ roomCode: string }>>((resolve) => {
      secondClient?.emit(
        "game-night:game:launch",
        { code: host.view.code, playerId: guest.playerId, blueprintId: defaultMovieMimeSpec.id },
        resolve,
      );
    });
    expect(unauthorizedLaunch).toMatchObject({ ok: false, error: "Only the host can launch a game." });

    const guestLaunchUpdate = waitForState<{ currentRoomCode: string | null }>(
      secondClient,
      (view) => view.currentRoomCode !== null,
    );
    const launched = await new Promise<
      SocketAck<{ view: { currentRoomCode: string | null }; roomCode: string; gameInstanceId: string }>
    >((resolve) => {
      client?.emit(
        "game-night:game:launch",
        { code: host.view.code, playerId: host.playerId, blueprintId: defaultMovieMimeSpec.id },
        resolve,
      );
    });
    expect(launched.ok).toBe(true);
    if (!launched.ok) throw new Error(launched.error);
    expect(launched.data.view.currentRoomCode).toBe(launched.data.roomCode);
    expect(await guestLaunchUpdate).toMatchObject({ currentRoomCode: launched.data.roomCode });

    const childJoin = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
      secondClient?.emit(
        "room:join",
        {
          code: launched.data.roomCode,
          name: "Noah",
          playerId: guest.playerId,
          reconnectToken: guest.reconnectToken,
        },
        resolve,
      );
    });
    expect(childJoin).toMatchObject({ ok: true, data: { playerId: guest.playerId, gameNightId: host.view.id } });
  });
});
