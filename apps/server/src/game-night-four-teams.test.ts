import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { defaultDrawBattleSpec } from "@boardforge/game-spec";
import type { ComposedGameView, JoinGameNightResult, JoinRoomResult, RoomView, SocketAck } from "@boardforge/shared";
import { createBoardForgeServer } from "./app";

type TestPlayer = {
  name: string;
  playerId: string;
  reconnectToken: string;
  socket?: Socket;
  view?: RoomView;
};

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeoutMs);
    const handler = (value: T) => {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(value);
    };
    socket.on(event, handler);
  });
}

describe("four-team Game Night", () => {
  const sockets: Socket[] = [];
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    sockets.forEach((socket) => {
      socket.disconnect();
    });
    await closeServer?.();
  });

  it("completes DrawBattle after a mid-game reconnect and records all four teams on the parent board", async () => {
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
      payload: {
        hostName: "Maya",
        teams: [{ name: "Moon Club" }, { name: "Wild Cards" }, { name: "Neon Crew" }, { name: "Waves" }],
      },
    });
    expect(created.statusCode).toBe(201);
    const host = created.json<JoinGameNightResult>();
    const players: TestPlayer[] = [{ name: "Maya", playerId: host.playerId, reconnectToken: host.reconnectToken }];
    for (const name of ["Noah", "Ada", "Leo"]) {
      const joined = await app.inject({
        method: "POST",
        url: `/api/game-nights/${host.view.code}/join`,
        payload: { name },
      });
      expect(joined.statusCode).toBe(200);
      const session = joined.json<JoinGameNightResult>();
      players.push({ name, playerId: session.playerId, reconnectToken: session.reconnectToken });
    }

    for (const [index, player] of players.entries()) {
      const teamId = `team_${index + 1}`;
      const selected = await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${host.view.code}/team`,
        payload: { playerId: player.playerId, reconnectToken: player.reconnectToken, teamId },
      });
      expect(selected.statusCode).toBe(200);
      const captain = await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${host.view.code}/captain`,
        payload: {
          playerId: host.playerId,
          reconnectToken: host.reconnectToken,
          teamId,
          captainPlayerId: player.playerId,
        },
      });
      expect(captain.statusCode).toBe(200);
    }

    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server address.");
    const connect = async () => {
      const socket = createSocketClient(`http://127.0.0.1:${address.port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    };

    for (const player of players) {
      player.socket = await connect();
      const subscription = await emitAck<{ view: { selfPlayerId: string } }>(player.socket, "game-night:subscribe", {
        code: host.view.code,
        playerId: player.playerId,
        reconnectToken: player.reconnectToken,
      });
      expect(subscription).toMatchObject({
        ok: true,
        data: { view: { selfPlayerId: player.playerId } },
      });
    }

    const hostPlayer = players[0]!;
    if (!hostPlayer.socket) throw new Error("Host socket is unavailable.");
    const opened = await emitAck<{ view: { status: string } }>(hostPlayer.socket, "game-night:board:open", {
      code: host.view.code,
      playerId: hostPlayer.playerId,
    });
    expect(opened).toMatchObject({ ok: true, data: { view: { status: "playing" } } });
    const selected = await emitAck<{ view: { selectedBlueprintId: string | null } }>(
      hostPlayer.socket,
      "game-night:game:select",
      { code: host.view.code, playerId: hostPlayer.playerId, blueprintId: defaultDrawBattleSpec.id },
    );
    expect(selected).toMatchObject({
      ok: true,
      data: { view: { selectedBlueprintId: defaultDrawBattleSpec.id } },
    });
    const launched = await emitAck<{ roomCode: string; gameInstanceId: string }>(
      hostPlayer.socket,
      "game-night:game:launch",
      { code: host.view.code, playerId: hostPlayer.playerId, blueprintId: defaultDrawBattleSpec.id },
    );
    expect(launched.ok).toBe(true);
    if (!launched.ok) throw new Error(launched.error);

    for (const player of players) {
      if (!player.socket) throw new Error(`${player.name} socket is unavailable.`);
      const joined = await emitAck<JoinRoomResult>(player.socket, "room:join", {
        code: launched.data.roomCode,
        name: player.name,
        playerId: player.playerId,
        reconnectToken: player.reconnectToken,
      });
      expect(joined.ok).toBe(true);
      if (!joined.ok) throw new Error(joined.error);
      player.reconnectToken = joined.data.reconnectToken;
      player.view = joined.data.view;
      player.socket.on("room:state", (view: RoomView) => {
        player.view = view;
      });
    }

    const startedViews = players.map((player) => {
      if (!player.socket) throw new Error(`${player.name} socket is unavailable.`);
      return waitForEvent<RoomView>(player.socket, "room:state", (view) => view.kind === "composed");
    });
    const started = await emitAck<{ view: RoomView }>(hostPlayer.socket, "room:start", {
      code: launched.data.roomCode,
      playerId: hostPlayer.playerId,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(started.error);
    const initialViews = await Promise.all(startedViews);
    initialViews.forEach((view, index) => {
      players[index]!.view = view;
    });
    expect(initialViews[0]).toMatchObject({ kind: "composed", totalRounds: 16, status: "playing" });

    const completedNight = waitForEvent<{
      currentRoomCode: string | null;
      history: Array<{
        blueprintId: string;
        awards: Array<{ teamId: string; points: number; reason: string }>;
      }>;
      teams: Array<{ id: string; score: number }>;
    }>(
      hostPlayer.socket,
      "game-night:state",
      (view) => view.currentRoomCode === null && view.history.length === 1,
      10_000,
    );
    const activeTeamIds = new Set<string>();
    let reconnected = false;

    for (let turn = 0; turn < 60; turn += 1) {
      const hostView = hostPlayer.view;
      if (hostView?.kind === "composed" && hostView.status === "completed") break;

      if (!reconnected && turn >= 12) {
        const reconnectingPlayer = players[2]!;
        const previousView = reconnectingPlayer.view;
        const previousRevision = previousView?.kind === "composed" ? previousView.revision : 0;
        reconnectingPlayer.socket?.disconnect();
        reconnectingPlayer.socket = await connect();
        const resumed = await emitAck<JoinRoomResult>(reconnectingPlayer.socket, "room:join", {
          code: launched.data.roomCode,
          name: reconnectingPlayer.name,
          playerId: reconnectingPlayer.playerId,
          reconnectToken: reconnectingPlayer.reconnectToken,
        });
        expect(resumed.ok).toBe(true);
        if (!resumed.ok) throw new Error(resumed.error);
        reconnectingPlayer.reconnectToken = resumed.data.reconnectToken;
        reconnectingPlayer.view = resumed.data.view;
        expect(resumed.data.view).toMatchObject({
          kind: "composed",
          status: "playing",
          revision: previousRevision,
        });
        reconnectingPlayer.socket.on("room:state", (view: RoomView) => {
          reconnectingPlayer.view = view;
        });
        const parentSubscription = await emitAck<{ view: { currentRoomCode: string | null } }>(
          reconnectingPlayer.socket,
          "game-night:subscribe",
          {
            code: host.view.code,
            playerId: reconnectingPlayer.playerId,
            reconnectToken: reconnectingPlayer.reconnectToken,
          },
        );
        expect(parentSubscription).toMatchObject({
          ok: true,
          data: { view: { currentRoomCode: launched.data.roomCode } },
        });
        reconnected = true;
      }

      const legalPlayers = players.filter(
        (player): player is TestPlayer & { socket: Socket; view: ComposedGameView } =>
          Boolean(player.socket) && player.view?.kind === "composed" && player.view.availableActions.length > 0,
      );
      const actionId = ["select_artist", "draw_prompt", "pass_prompt"].find((candidate) =>
        legalPlayers.some((player) => player.view.availableActions.some((action) => action.id === candidate)),
      );
      const actor = actionId
        ? legalPlayers.find((player) => player.view.availableActions.some((action) => action.id === actionId))
        : undefined;
      if (!actionId || !actor) throw new Error(`No deterministic DrawBattle action was available on turn ${turn}.`);
      if (actor.view.phase.id === "select_artist") {
        const activeTeam = actor.view.teams.find((team) => team.playerIds.includes(actor.view.activePlayerId));
        if (activeTeam) activeTeamIds.add(activeTeam.id);
      }

      const previousRevision = actor.view.revision;
      const nextStates = players.map((player) => {
        if (!player.socket) throw new Error(`${player.name} socket is unavailable.`);
        return waitForEvent<RoomView>(
          player.socket,
          "room:state",
          (view) => view.kind === "composed" && view.revision > previousRevision,
        );
      });
      const action = {
        type: "COMPOSED_ACTION" as const,
        actionId,
        ...(actionId === "select_artist" ? { payload: { targetPlayerId: actor.playerId } } : {}),
      };
      const submitted = await emitAck<{ revision: number }>(actor.socket, "game:action", {
        code: launched.data.roomCode,
        playerId: actor.playerId,
        expectedRevision: previousRevision,
        idempotencyKey: crypto.randomUUID(),
        action,
      });
      if (!submitted.ok) throw new Error(`DrawBattle ${actionId} failed on turn ${turn}: ${submitted.error}`);
      const synchronizedViews = await Promise.all(nextStates);
      synchronizedViews.forEach((view, index) => {
        players[index]!.view = view;
      });
    }

    expect(reconnected).toBe(true);
    expect(activeTeamIds).toEqual(new Set(["game_team_1", "game_team_2", "game_team_3", "game_team_4"]));
    expect(hostPlayer.view).toMatchObject({
      kind: "composed",
      status: "completed",
      totalRounds: 16,
      winner: { kind: "teams", ids: ["game_team_1", "game_team_2", "game_team_3", "game_team_4"] },
    });

    const board = await completedNight;
    expect(board).toMatchObject({
      currentRoomCode: null,
      history: [
        {
          blueprintId: defaultDrawBattleSpec.id,
          awards: expect.arrayContaining([
            { teamId: "team_1", points: 1, reason: "tie" },
            { teamId: "team_2", points: 1, reason: "tie" },
            { teamId: "team_3", points: 1, reason: "tie" },
            { teamId: "team_4", points: 1, reason: "tie" },
          ]),
        },
      ],
      teams: expect.arrayContaining([
        expect.objectContaining({ id: "team_1", score: 1 }),
        expect.objectContaining({ id: "team_2", score: 1 }),
        expect.objectContaining({ id: "team_3", score: 1 }),
        expect.objectContaining({ id: "team_4", score: 1 }),
      ]),
    });
  }, 15_000);
});
