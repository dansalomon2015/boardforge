import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { ComposedGameView, JoinRoomResult, RoomView, SocketAck } from "@boardforge/shared";
import {
  defaultDrawBattleSpec,
  defaultMovieMimeSpec,
  defaultSoundCheckSpec,
  defaultWordTrapSpec,
} from "@boardforge/game-spec";
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
    expect(childJoin.data.gameNightCode).toBe(host.view.code);
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

  it("runs the complete realtime Game Night lifecycle across the ranked catalogue", async () => {
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

    const activeGameCompletion = await new Promise<SocketAck<{ view: { status: string } }>>((resolve) => {
      client?.emit("game-night:complete", { code: host.view.code, playerId: host.playerId }, resolve);
    });
    expect(activeGameCompletion).toMatchObject({
      ok: false,
      error: "Finish the current game before ending the Game Night.",
    });

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
    expect(childJoin).toMatchObject({
      ok: true,
      data: { playerId: guest.playerId, gameNightId: host.view.id, gameNightCode: host.view.code },
    });

    const hostChildJoin = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
      client?.emit(
        "room:join",
        {
          code: launched.data.roomCode,
          name: "Maya",
          playerId: host.playerId,
          reconnectToken: host.reconnectToken,
        },
        resolve,
      );
    });
    expect(hostChildJoin.ok).toBe(true);
    if (!hostChildJoin.ok || !childJoin.ok) throw new Error("Both child-room joins must succeed.");

    let hostRoomView: RoomView = hostChildJoin.data.view;
    let guestRoomView: RoomView = childJoin.data.view;
    client.on("room:state", (view: RoomView) => {
      hostRoomView = view;
    });
    secondClient.on("room:state", (view: RoomView) => {
      guestRoomView = view;
    });
    type CompletedNightView = {
      currentRoomCode: string | null;
      history: Array<{ awards: Array<{ points: number }>; blueprintId: string }>;
      teams: Array<{ id: string; score: number }>;
    };
    const playChildRoom = async (
      roomCode: string,
      selectActionId: string,
      expectedHistoryLength: number,
      gameName: string,
    ): Promise<CompletedNightView> => {
      const completedNight = waitForState<CompletedNightView>(
        client!,
        (view) => view.currentRoomCode === null && view.history.length === expectedHistoryLength,
      );
      const started = await new Promise<SocketAck<{ view: RoomView }>>((resolve) => {
        client?.emit("room:start", { code: roomCode, playerId: host.playerId }, resolve);
      });
      expect(started.ok).toBe(true);
      if (!started.ok) throw new Error(started.error);
      hostRoomView = started.data.view;

      for (let turn = 0; turn < 80; turn += 1) {
        if (hostRoomView.kind === "composed" && hostRoomView.status === "completed") break;
        const actors = [
          { socket: client, playerId: host.playerId, view: hostRoomView },
          { socket: secondClient, playerId: guest.playerId, view: guestRoomView },
        ];
        const legalActors = actors.filter(
          (candidate): candidate is { socket: Socket; playerId: string; view: ComposedGameView } =>
            candidate.view.kind === "composed" && candidate.view.availableActions.length > 0,
        );
        const preferredActionIds = [selectActionId, "draw_prompt", "draw_sound", "pass_prompt", "pass_sound"];
        const preferredActionId = preferredActionIds.find((actionId) =>
          legalActors.some((candidate) => candidate.view.availableActions.some((action) => action.id === actionId)),
        );
        const actor = preferredActionId
          ? legalActors.find((candidate) =>
              candidate.view.availableActions.some((action) => action.id === preferredActionId),
            )
          : legalActors[0];
        if (!actor) throw new Error(`No legal ${gameName} action was available on turn ${turn}.`);
        const available = preferredActionId
          ? actor.view.availableActions.find((action) => action.id === preferredActionId)!
          : actor.view.availableActions[0]!;
        const previousRevision = actor.view.revision;
        const nextState = new Promise<RoomView>((resolve) => {
          const handler = (view: RoomView) => {
            if (view.kind === "lobby" || view.revision <= previousRevision) return;
            client?.off("room:state", handler);
            resolve(view);
          };
          client?.on("room:state", handler);
        });
        const action = {
          type: "COMPOSED_ACTION" as const,
          actionId: available.id,
          ...(available.id === selectActionId ? { payload: { targetPlayerId: actor.playerId } } : {}),
        };
        const submitted = await new Promise<SocketAck<{ revision: number }>>((resolve) => {
          actor.socket.emit(
            "game:action",
            {
              code: roomCode,
              playerId: actor.playerId,
              expectedRevision: previousRevision,
              idempotencyKey: crypto.randomUUID(),
              action,
            },
            resolve,
          );
        });
        if (!submitted.ok)
          throw new Error(`${gameName} action ${available.id} failed on turn ${turn}: ${submitted.error}`);
        expect(submitted.ok).toBe(true);
        hostRoomView = await nextState;
      }

      expect(hostRoomView).toMatchObject({ kind: "composed", status: "completed" });
      return completedNight;
    };

    const launchAndPlayNextGame = async ({
      blueprintId,
      selectActionId,
      expectedHistoryLength,
      gameName,
      hostReconnectToken,
      guestReconnectToken,
    }: {
      blueprintId: string;
      selectActionId: string;
      expectedHistoryLength: number;
      gameName: string;
      hostReconnectToken: string;
      guestReconnectToken: string;
    }) => {
      const selected = await new Promise<SocketAck<{ view: { selectedBlueprintId: string | null } }>>((resolve) => {
        client?.emit("game-night:game:select", { code: host.view.code, playerId: host.playerId, blueprintId }, resolve);
      });
      expect(selected).toMatchObject({ ok: true, data: { view: { selectedBlueprintId: blueprintId } } });

      const launch = await new Promise<
        SocketAck<{ view: { currentRoomCode: string | null }; roomCode: string; gameInstanceId: string }>
      >((resolve) => {
        client?.emit("game-night:game:launch", { code: host.view.code, playerId: host.playerId, blueprintId }, resolve);
      });
      expect(launch.ok).toBe(true);
      if (!launch.ok) throw new Error(launch.error);

      const guestJoin = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
        secondClient?.emit(
          "room:join",
          {
            code: launch.data.roomCode,
            name: "Noah",
            playerId: guest.playerId,
            reconnectToken: guestReconnectToken,
          },
          resolve,
        );
      });
      const hostJoin = await new Promise<SocketAck<JoinRoomResult>>((resolve) => {
        client?.emit(
          "room:join",
          {
            code: launch.data.roomCode,
            name: "Maya",
            playerId: host.playerId,
            reconnectToken: hostReconnectToken,
          },
          resolve,
        );
      });
      expect(guestJoin.ok).toBe(true);
      expect(hostJoin.ok).toBe(true);
      if (!guestJoin.ok || !hostJoin.ok) throw new Error(`Both players must enter ${gameName}.`);
      guestRoomView = guestJoin.data.view;
      hostRoomView = hostJoin.data.view;

      return {
        completedNight: await playChildRoom(launch.data.roomCode, selectActionId, expectedHistoryLength, gameName),
        hostReconnectToken: hostJoin.data.reconnectToken,
        guestReconnectToken: guestJoin.data.reconnectToken,
      };
    };

    const firstCompletedNight = await playChildRoom(launched.data.roomCode, "select_mimer", 1, "CineMimes");
    expect(firstCompletedNight).toMatchObject({
      currentRoomCode: null,
      history: [{ blueprintId: defaultMovieMimeSpec.id, awards: expect.arrayContaining([expect.any(Object)]) }],
    });

    const secondGame = await launchAndPlayNextGame({
      blueprintId: defaultWordTrapSpec.id,
      selectActionId: "select_clue_giver",
      expectedHistoryLength: 2,
      gameName: "WordTrap",
      hostReconnectToken: hostChildJoin.data.reconnectToken,
      guestReconnectToken: childJoin.data.reconnectToken,
    });
    expect(secondGame.completedNight).toMatchObject({
      currentRoomCode: null,
      history: [
        { blueprintId: defaultMovieMimeSpec.id },
        { blueprintId: defaultWordTrapSpec.id, awards: [{ points: 3 }] },
      ],
      teams: expect.arrayContaining([
        expect.objectContaining({ id: "team_1", score: 4 }),
        expect.objectContaining({ id: "team_2", score: 1 }),
      ]),
    });

    const thirdGame = await launchAndPlayNextGame({
      blueprintId: defaultDrawBattleSpec.id,
      selectActionId: "select_artist",
      expectedHistoryLength: 3,
      gameName: "DrawBattle",
      hostReconnectToken: secondGame.hostReconnectToken,
      guestReconnectToken: secondGame.guestReconnectToken,
    });
    expect(thirdGame.completedNight).toMatchObject({
      currentRoomCode: null,
      history: [
        { blueprintId: defaultMovieMimeSpec.id },
        { blueprintId: defaultWordTrapSpec.id },
        {
          blueprintId: defaultDrawBattleSpec.id,
          awards: expect.arrayContaining([
            expect.objectContaining({ points: 1, teamId: "team_1" }),
            expect.objectContaining({ points: 1, teamId: "team_2" }),
          ]),
        },
      ],
      teams: expect.arrayContaining([
        expect.objectContaining({ id: "team_1", score: 5 }),
        expect.objectContaining({ id: "team_2", score: 2 }),
      ]),
    });

    const fourthGame = await launchAndPlayNextGame({
      blueprintId: defaultSoundCheckSpec.id,
      selectActionId: "select_performer",
      expectedHistoryLength: 4,
      gameName: "SoundCheck",
      hostReconnectToken: thirdGame.hostReconnectToken,
      guestReconnectToken: thirdGame.guestReconnectToken,
    });
    expect(fourthGame.completedNight).toMatchObject({
      currentRoomCode: null,
      history: [
        { blueprintId: defaultMovieMimeSpec.id },
        { blueprintId: defaultWordTrapSpec.id },
        { blueprintId: defaultDrawBattleSpec.id },
        {
          blueprintId: defaultSoundCheckSpec.id,
          awards: expect.arrayContaining([
            expect.objectContaining({ points: 1, teamId: "team_1" }),
            expect.objectContaining({ points: 1, teamId: "team_2" }),
          ]),
        },
      ],
      teams: expect.arrayContaining([
        expect.objectContaining({ id: "team_1", score: 6 }),
        expect.objectContaining({ id: "team_2", score: 3 }),
      ]),
    });

    const unauthorizedCompletion = await new Promise<SocketAck<{ view: { status: string } }>>((resolve) => {
      secondClient?.emit("game-night:complete", { code: host.view.code, playerId: guest.playerId }, resolve);
    });
    expect(unauthorizedCompletion).toMatchObject({ ok: false, error: "Only the host can end the Game Night." });

    const guestFinale = waitForState<{ status: string; history: unknown[] }>(
      secondClient,
      (view) => view.status === "completed",
    );
    const completed = await new Promise<SocketAck<{ view: { status: string; history: unknown[] } }>>((resolve) => {
      client?.emit("game-night:complete", { code: host.view.code, playerId: host.playerId }, resolve);
    });
    expect(completed).toMatchObject({
      ok: true,
      data: { view: { status: "completed", history: [{}, {}, {}, {}] } },
    });
    expect(await guestFinale).toMatchObject({ status: "completed", history: [{}, {}, {}, {}] });

    const lockedSelection = await new Promise<SocketAck<{ view: { selectedBlueprintId: string | null } }>>(
      (resolve) => {
        client?.emit(
          "game-night:game:select",
          { code: host.view.code, playerId: host.playerId, blueprintId: defaultMovieMimeSpec.id },
          resolve,
        );
      },
    );
    expect(lockedSelection).toMatchObject({ ok: false, error: "This Game Night is already complete." });
  });
});
