import { afterEach, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { StoryBookInput } from "@boardforge/game-spec";
import { FakeLlmProvider } from "@boardforge/llm";
import type { JoinRoomResult, RoomView, SocketAck, StoryBookState } from "@boardforge/shared";
import { createBoardForgeServer } from "./app";

type TestPlayer = {
  name: string;
  id: string;
  socket: Socket;
  view: RoomView;
};

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitForView(player: TestPlayer, predicate: (view: RoomView) => boolean, timeoutMs = 5_000): Promise<RoomView> {
  if (predicate(player.view)) return Promise.resolve(player.view);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.socket.off("room:state", receive);
      reject(new Error("Timed out waiting for a StoryChain room state."));
    }, timeoutMs);
    const receive = (view: RoomView) => {
      if (!predicate(view)) return;
      clearTimeout(timeout);
      player.socket.off("room:state", receive);
      resolve(view);
    };
    player.socket.on("room:state", receive);
  });
}

describe("StoryChain book generation", () => {
  const sockets: Socket[] = [];
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    sockets.forEach((socket) => {
      socket.disconnect();
    });
    await closeServer?.();
  });

  it("generates one shared book for concurrent player requests", async () => {
    const fake = new FakeLlmProvider();
    let generationCalls = 0;
    let capturedInput: StoryBookInput | undefined;
    const { app, io } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      logger: false,
      restoreRooms: false,
      storyBookProvider: {
        generateStoryBook: async (input) => {
          generationCalls += 1;
          capturedInput = structuredClone(input);
          await new Promise((resolve) => setTimeout(resolve, 30));
          return fake.generateStoryBook(input);
        },
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    closeServer = async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close();
    };
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server address.");
    const apiUrl = `http://127.0.0.1:${address.port}`;

    const blueprintResponse = await app.inject({
      method: "POST",
      url: "/api/story-chain/blueprints",
      payload: { themeId: "cozy", mood: "mystery", length: "mini", preferences: "a clockwork picnic" },
    });
    expect(blueprintResponse.statusCode).toBe(201);
    const blueprint = blueprintResponse.json<{ blueprintId: string; twistCount: number }>();
    expect(blueprint.twistCount).toBe(4);
    const roomResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { blueprintId: blueprint.blueprintId },
    });
    const code = roomResponse.json<{ code: string }>().code;

    const players: TestPlayer[] = [];
    for (const name of ["Avery", "Blake"]) {
      const socket = createSocketClient(apiUrl, { transports: ["websocket"], forceNew: true, reconnection: false });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      const joined = await emitAck<JoinRoomResult>(socket, "room:join", { code, name });
      if (!joined.ok) throw new Error(joined.error);
      const player: TestPlayer = { name, id: joined.data.playerId, socket, view: joined.data.view };
      socket.on("room:state", (view: RoomView) => {
        player.view = view;
      });
      players.push(player);
    }

    const host = players[0]!;
    const startedViews = players.map((player) => waitForView(player, (view) => view.kind === "composed"));
    const started = await emitAck<{ view: RoomView }>(host.socket, "room:start", { code, playerId: host.id });
    if (!started.ok) throw new Error(started.error);
    await Promise.all(startedViews);

    for (let chapter = 1; chapter <= 4; chapter += 1) {
      const hostView = host.view;
      if (hostView.kind !== "composed") throw new Error("Expected a composed StoryChain view.");
      const author = players.find((player) => player.id === hostView.activePlayerId);
      if (!author) throw new Error("The active StoryChain author is unavailable.");
      const writingView = waitForView(
        author,
        (view) => view.kind === "composed" && view.phase.id === "write" && view.round === chapter,
      );
      const draw = await emitAck(author.socket, "game:action", {
        code,
        playerId: author.id,
        expectedRevision: hostView.revision,
        idempotencyKey: crypto.randomUUID(),
        action: { type: "COMPOSED_ACTION", actionId: "draw_twist" },
      });
      if (!draw.ok) throw new Error(draw.error);
      const authorWritingView = await writingView;
      if (authorWritingView.kind !== "composed") throw new Error("Expected a composed writing view.");
      const word = authorWritingView.components.find((component) => component.kind === "prompt")?.data.prompt;
      if (typeof word !== "string") throw new Error("The author did not receive a private word.");
      const resolved = players.map((player) =>
        waitForView(player, (view) => view.kind === "composed" && view.revision > authorWritingView.revision),
      );
      const written = await emitAck(author.socket, "game:action", {
        code,
        playerId: author.id,
        expectedRevision: authorWritingView.revision,
        idempotencyKey: crypto.randomUUID(),
        action: {
          type: "COMPOSED_ACTION",
          actionId: "continue_story",
          payload: { text: `Then the ${word} revealed clue ${chapter}, and everyone followed it into the night.` },
        },
      });
      if (!written.ok) throw new Error(written.error);
      await Promise.all(resolved);
    }

    expect(players.every((player) => player.view.kind === "composed" && player.view.status === "completed")).toBe(true);
    const outsider = createSocketClient(apiUrl, { transports: ["websocket"], forceNew: true, reconnection: false });
    sockets.push(outsider);
    await new Promise<void>((resolve, reject) => {
      outsider.once("connect", resolve);
      outsider.once("connect_error", reject);
    });
    const unauthorized = await emitAck(outsider, "story-chain:book:create", { code, playerId: host.id });
    expect(unauthorized).toMatchObject({ ok: false, error: "This connection is not authorized for that player." });
    expect(generationCalls).toBe(0);
    const readyViews = players.map((player) =>
      waitForView(player, (view) => view.kind === "composed" && view.storyBook?.status === "ready"),
    );
    const requests = await Promise.all(
      players.map((player) =>
        emitAck<{ storyBook: StoryBookState }>(player.socket, "story-chain:book:create", {
          code,
          playerId: player.id,
        }),
      ),
    );
    expect(requests.every((response) => response.ok)).toBe(true);
    const ready = await Promise.all(readyViews);
    expect(generationCalls).toBe(1);
    expect(capturedInput).toMatchObject({ title: expect.any(String), authors: ["Avery", "Blake"] });
    expect(capturedInput?.entries).toHaveLength(4);
    expect(Object.keys(capturedInput ?? {}).sort()).toEqual(["authors", "entries", "opening", "title"]);
    expect(JSON.stringify(capturedInput).length).toBeLessThan(2_500);
    ready.forEach((view) => {
      expect(view).toMatchObject({ kind: "composed", storyBook: { status: "ready" } });
    });

    const repeated = await emitAck<{ storyBook: StoryBookState }>(host.socket, "story-chain:book:create", {
      code,
      playerId: host.id,
    });
    expect(repeated).toMatchObject({ ok: true, data: { storyBook: { status: "ready" } } });
    expect(generationCalls).toBe(1);
  });
});
