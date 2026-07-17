import { io } from "socket.io-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) =>
      response?.ok ? resolve(response.data) : reject(new Error(response?.error ?? `${event} failed`)),
    );
  });
}

function nextState(client, predicate) {
  if (client.view && predicate(client.view)) return Promise.resolve(client.view);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.off("room:state", receive);
      reject(new Error("Timed out waiting for StoryChain state"));
    }, 8_000);
    const receive = (view) => {
      if (!predicate(view)) return;
      clearTimeout(timeout);
      client.socket.off("room:state", receive);
      resolve(view);
    };
    client.socket.on("room:state", receive);
  });
}

async function createRoom() {
  const blueprintResponse = await fetch(`${apiUrl}/api/story-chain/blueprints`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      themeId: "cozy",
      mood: "mystery",
      length: "quick",
      preferences: "A birthday mystery at an old hotel",
    }),
  });
  if (!blueprintResponse.ok) throw new Error(`Blueprint creation failed: ${blueprintResponse.status}`);
  const blueprint = await blueprintResponse.json();
  if (blueprint.releaseStatus !== "release_ready") throw new Error("StoryChain did not pass the release gate");
  const roomResponse = await fetch(`${apiUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blueprintId: blueprint.blueprintId }),
  });
  if (!roomResponse.ok) throw new Error(`Room creation failed: ${roomResponse.status}`);
  return {
    ...(await roomResponse.json()),
    title: blueprint.title,
    simulations: blueprint.playtest.completedSimulations,
  };
}

async function gameAction(client, code, action) {
  return emitAck(client.socket, "game:action", {
    code,
    playerId: client.playerId,
    expectedRevision: client.view.revision,
    idempotencyKey: crypto.randomUUID(),
    action,
  });
}

const room = await createRoom();
const clients = ["Avery", "Blake"].map((name) => ({
  name,
  socket: io(apiUrl, { transports: ["websocket"] }),
  playerId: "",
  view: null,
}));

try {
  for (const client of clients) {
    client.socket.on("room:state", (view) => {
      client.view = view;
    });
    const joined = await emitAck(client.socket, "room:join", { code: room.code, name: client.name });
    client.playerId = joined.playerId;
    client.view = joined.view;
  }
  if (clients[0].view.teamSetup) throw new Error("StoryChain unexpectedly requested teams");
  const started = clients.map((client) => nextState(client, (view) => view.kind === "composed"));
  await emitAck(clients[0].socket, "room:start", { code: room.code, playerId: clients[0].playerId });
  await Promise.all(started);

  let rejectedMissingWord = false;
  for (let chapter = 1; chapter <= 8; chapter += 1) {
    const author = clients.find((client) => client.playerId === clients[0].view.activePlayerId);
    if (!author) throw new Error("The active StoryChain writer is not connected");
    const readers = clients.filter((client) => client !== author);
    const writingViews = clients.map((client) =>
      nextState(client, (view) => view.kind === "composed" && view.phase.id === "write" && view.round === chapter),
    );
    await gameAction(author, room.code, { type: "COMPOSED_ACTION", actionId: "draw_twist" });
    await Promise.all(writingViews);
    const secret = author.view.components.find((component) => component.kind === "prompt")?.data?.prompt;
    if (!secret) throw new Error(`Writer received no private twist in chapter ${chapter}`);
    if (readers.some((client) => JSON.stringify(client.view).includes(secret)))
      throw new Error(`Private twist leaked in chapter ${chapter}`);

    if (chapter === 1) {
      try {
        await gameAction(author, room.code, {
          type: "COMPOSED_ACTION",
          actionId: "continue_story",
          payload: { text: "A perfectly ordinary sentence followed." },
        });
      } catch (error) {
        rejectedMissingWord = error instanceof Error && error.message.includes("must include the word");
      }
      if (!rejectedMissingWord) throw new Error("A contribution without the secret word was accepted");
    }

    const nextRevision = author.view.revision + 1;
    const contribution = `Chapter ${chapter}: the ${secret} changed everything, and nobody could turn back.`;
    const resolvedViews = clients.map((client) =>
      nextState(client, (view) => view.kind === "composed" && view.revision >= nextRevision),
    );
    await gameAction(author, room.code, {
      type: "COMPOSED_ACTION",
      actionId: "continue_story",
      payload: { text: contribution },
    });
    await Promise.all(resolvedViews);
  }

  if (!clients.every((client) => client.view.status === "completed"))
    throw new Error("StoryChain did not complete after eight chapters");
  const finalStory = clients[0].view.components.find((component) => component.kind === "story")?.data;
  if (!Array.isArray(finalStory?.entries) || finalStory.entries.length !== 8)
    throw new Error("The final manuscript does not contain eight chapters");
  console.log(
    JSON.stringify({
      room: room.code,
      game: "StoryChain",
      title: room.title,
      players: clients.length,
      chapters: finalStory.entries.length,
      privateTwistsProtected: true,
      missingWordRejected: rejectedMissingWord,
      virtualPlaytests: room.simulations,
    }),
  );
} finally {
  clients.forEach((client) => {
    client.socket.disconnect();
  });
}
