import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { defaultWordTrapSpec } from "@boardforge/game-spec";
import type { ComposedGameView, JoinRoomResult, RoomView, SocketAck } from "@boardforge/shared";
import { createBoardForgeServer } from "./app";
import type { CountdownClock } from "./countdown-clock";

class ManualCountdownClock implements CountdownClock {
  private current = 1_000_000;
  private sequence = 0;
  private readonly jobs = new Map<number, { dueAt: number; callback: () => void }>();

  now = () => this.current;

  schedule = (callback: () => void, delayMs: number) => {
    const id = ++this.sequence;
    this.jobs.set(id, { dueAt: this.current + delayMs, callback });
    return () => this.jobs.delete(id);
  };

  advance(milliseconds: number): void {
    this.current += milliseconds;
    const due = [...this.jobs.entries()]
      .filter(([, job]) => job.dueAt <= this.current)
      .sort((left, right) => left[1].dueAt - right[1].dueAt);
    for (const [id, job] of due) {
      if (!this.jobs.delete(id)) continue;
      job.callback();
    }
  }
}

const connect = async (port: number): Promise<Socket> => {
  const socket = createSocketClient(`http://127.0.0.1:${port}`, {
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

const waitForRoomState = (socket: Socket, predicate: (view: RoomView) => boolean) =>
  new Promise<RoomView>((resolve) => {
    const handler = (view: RoomView) => {
      if (!predicate(view)) return;
      socket.off("room:state", handler);
      resolve(view);
    };
    socket.on("room:state", handler);
  });

describe("authoritative room countdown", () => {
  let hostSocket: Socket | undefined;
  let guestSocket: Socket | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    await closeServer?.();
  });

  it("shares one deadline, preserves it on reconnect, and resolves the turn at zero", async () => {
    const clock = new ManualCountdownClock();
    const { app, io } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      logger: false,
      restoreRooms: false,
      countdownClock: clock,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    closeServer = async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close();
    };
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server address.");

    const roomResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { blueprintId: defaultWordTrapSpec.id },
    });
    const { code } = roomResponse.json<{ code: string }>();
    hostSocket = await connect(address.port);
    guestSocket = await connect(address.port);

    const join = (socket: Socket, payload: Record<string, string>) =>
      new Promise<SocketAck<JoinRoomResult>>((resolve) => socket.emit("room:join", { code, ...payload }, resolve));
    const host = await join(hostSocket, { name: "Maya" });
    const guest = await join(guestSocket, { name: "Noah" });
    if (!host.ok || !guest.ok) throw new Error("Both players must join the room.");

    const emitAck = <T>(socket: Socket, event: string, payload: unknown) =>
      new Promise<SocketAck<T>>((resolve) => socket.emit(event, payload, resolve));
    for (const selection of [
      { socket: hostSocket, playerId: host.data.playerId, teamId: "team_1" },
      { socket: guestSocket, playerId: guest.data.playerId, teamId: "team_2" },
    ]) {
      const selected = await emitAck(selection.socket, "room:team:select", {
        code,
        playerId: selection.playerId,
        teamId: selection.teamId,
      });
      expect(selected.ok).toBe(true);
    }
    for (const captain of [
      { teamId: "team_1", captainPlayerId: host.data.playerId },
      { teamId: "team_2", captainPlayerId: guest.data.playerId },
    ]) {
      const selected = await emitAck(hostSocket, "room:captain:select", {
        code,
        playerId: host.data.playerId,
        ...captain,
      });
      expect(selected.ok).toBe(true);
    }

    const guestStarted = waitForRoomState(guestSocket, (view) => view.kind === "composed");
    const started = await emitAck<{ view: RoomView }>(hostSocket, "room:start", {
      code,
      playerId: host.data.playerId,
    });
    if (!started.ok || started.data.view.kind !== "composed") throw new Error("The game must start.");
    let hostView = started.data.view;
    let guestView = (await guestStarted) as ComposedGameView;

    const submitAvailable = async (actionId: string, payload?: { targetPlayerId: string }) => {
      const actors = [
        { socket: hostSocket!, playerId: host.data.playerId, view: hostView },
        { socket: guestSocket!, playerId: guest.data.playerId, view: guestView },
      ];
      const actor = actors.find((candidate) =>
        candidate.view.availableActions.some((action) => action.id === actionId),
      );
      if (!actor) throw new Error(`No player can submit ${actionId}.`);
      const hostUpdate = waitForRoomState(
        hostSocket!,
        (view) => view.kind === "composed" && view.revision > actor.view.revision,
      );
      const guestUpdate = waitForRoomState(
        guestSocket!,
        (view) => view.kind === "composed" && view.revision > actor.view.revision,
      );
      const submitted = await emitAck<{ revision: number }>(actor.socket, "game:action", {
        code,
        playerId: actor.playerId,
        expectedRevision: actor.view.revision,
        idempotencyKey: crypto.randomUUID(),
        action: { type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) },
      });
      if (!submitted.ok) throw new Error(submitted.error);
      hostView = (await hostUpdate) as ComposedGameView;
      guestView = (await guestUpdate) as ComposedGameView;
    };

    const selectingActor = [hostView, guestView].find((view) =>
      view.availableActions.some((action) => action.id === "select_clue_giver"),
    );
    if (!selectingActor) throw new Error("A captain must choose the clue giver.");
    await submitAvailable("select_clue_giver", { targetPlayerId: selectingActor.selfPlayerId });
    await submitAvailable("draw_word");

    expect(hostView.phase.id).toBe("clue");
    expect(hostView.turnTimer).toEqual(guestView.turnTimer);
    expect(hostView.turnTimer).toMatchObject({
      deadlineAt: 1_060_000,
      serverNow: 1_000_000,
      totalSeconds: 60,
    });
    const timedRevision = hostView.revision;

    clock.advance(30_000);
    guestSocket.disconnect();
    guestSocket = await connect(address.port);
    const rejoined = await join(guestSocket, {
      name: "Noah",
      playerId: guest.data.playerId,
      reconnectToken: guest.data.reconnectToken,
    });
    if (!rejoined.ok || rejoined.data.view.kind !== "composed") throw new Error("Reconnect must succeed.");
    expect(rejoined.data.view.turnTimer).toMatchObject({
      deadlineAt: 1_060_000,
      serverNow: 1_030_000,
      totalSeconds: 60,
    });

    const expired = waitForRoomState(
      hostSocket,
      (view) => view.kind === "composed" && view.revision > timedRevision && view.phase.id === "select_clue_giver",
    );
    clock.advance(30_000);
    const resolved = (await expired) as ComposedGameView;
    expect(resolved.turnTimer).toBeUndefined();
    expect(resolved.round).toBe(2);
  });
});
