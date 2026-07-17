import { io } from "socket.io-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => socket.emit(event, payload, (response) => response?.ok ? resolve(response.data) : reject(new Error(response?.error ?? `${event} failed`))));
}

function nextState(client, predicate) {
  if (client.view && predicate(client.view)) return Promise.resolve(client.view);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.socket.off("room:state", receive); reject(new Error("Timed out waiting for WordDuel state")); }, 6_000);
    const receive = (view) => { if (!predicate(view)) return; clearTimeout(timeout); client.socket.off("room:state", receive); resolve(view); };
    client.socket.on("room:state", receive);
  });
}

async function createRoom() {
  const blueprintResponse = await fetch(`${apiUrl}/api/word-duel/blueprints`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ themeId: "minimal", difficulty: "classic" }) });
  if (!blueprintResponse.ok) throw new Error(`Blueprint creation failed: ${blueprintResponse.status}`);
  const blueprint = await blueprintResponse.json();
  if (blueprint.releaseStatus !== "release_ready" || blueprint.playtest.completedSimulations !== 24) throw new Error("WordDuel did not pass 24 virtual playtests");
  const roomResponse = await fetch(`${apiUrl}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blueprintId: blueprint.blueprintId }) });
  if (!roomResponse.ok) throw new Error(`Room creation failed: ${roomResponse.status}`);
  return { ...(await roomResponse.json()), simulations: blueprint.playtest.completedSimulations };
}

async function gameAction(client, code, action) {
  return emitAck(client.socket, "game:action", { code, playerId: client.playerId, expectedRevision: client.view.revision, idempotencyKey: crypto.randomUUID(), action });
}

async function actAndSync(actor, clients, code, action) {
  const revision = actor.view.revision + 1;
  const updates = clients.map((client) => nextState(client, (view) => view.kind === "composed" && view.revision >= revision));
  await gameAction(actor, code, action);
  await Promise.all(updates);
}

const room = await createRoom();
const clients = ["Avery", "Blake"].map((name) => ({ name, socket: io(apiUrl, { transports: ["websocket"] }), playerId: "", view: null }));
const words = new Map();

try {
  for (const client of clients) {
    client.socket.on("room:state", (view) => { client.view = view; });
    const joined = await emitAck(client.socket, "room:join", { code: room.code, name: client.name });
    client.playerId = joined.playerId;
    client.view = joined.view;
  }
  if (clients[0].view.teamSetup) throw new Error("WordDuel unexpectedly requested teams");
  words.set(clients[0].playerId, "APPLE");
  words.set(clients[1].playerId, "PLANET");
  const started = clients.map((client) => nextState(client, (view) => view.kind === "composed"));
  await emitAck(clients[0].socket, "room:start", { code: room.code, playerId: clients[0].playerId });
  await Promise.all(started);

  await actAndSync(clients[0], clients, room.code, { type: "COMPOSED_ACTION", actionId: "lock_word", payload: { text: words.get(clients[0].playerId) } });
  await actAndSync(clients[1], clients, room.code, { type: "COMPOSED_ACTION", actionId: "lock_word", payload: { text: words.get(clients[1].playerId) } });
  if (!clients.every((client) => client.view.phase.id === "duel")) throw new Error("The duel did not begin after both words were locked");
  for (const client of clients) {
    const opponent = clients.find((candidate) => candidate !== client);
    if (JSON.stringify(client.view).includes(words.get(opponent.playerId))) throw new Error("An opponent secret word leaked before play");
  }

  const first = clients.find((client) => client.playerId === clients[0].view.activePlayerId);
  const second = clients.find((client) => client !== first);
  const target = words.get(second.playerId);
  const correctLetter = target[0];
  await actAndSync(first, clients, room.code, { type: "COMPOSED_ACTION", actionId: "guess_letter", payload: { text: correctLetter } });
  const firstBoard = first.view.components.find((component) => component.kind === "word_duel")?.data;
  if (!firstBoard.opponentMask.includes(correctLetter)) throw new Error("A correct letter was not revealed in the word");
  if (firstBoard.keyboard.find((key) => key.letter === correctLetter)?.state !== "correct") throw new Error("A winning keyboard key was not disabled as correct");

  const secondTarget = words.get(first.playerId);
  const miss = [..."QZXJV"].find((letter) => !secondTarget.includes(letter));
  await actAndSync(second, clients, room.code, { type: "COMPOSED_ACTION", actionId: "guess_letter", payload: { text: miss } });
  const secondBoard = second.view.components.find((component) => component.kind === "word_duel")?.data;
  if (secondBoard.keyboard.find((key) => key.letter === miss)?.state !== "wrong") throw new Error("A missed keyboard key was not disabled");

  let repeatedRejected = false;
  try { await gameAction(first, room.code, { type: "COMPOSED_ACTION", actionId: "guess_letter", payload: { text: correctLetter } }); } catch (error) { repeatedRejected = error instanceof Error && error.message.includes("already been played"); }
  if (!repeatedRejected) throw new Error("A repeated keyboard letter was accepted");

  await actAndSync(first, clients, room.code, { type: "COMPOSED_ACTION", actionId: "solve_word", payload: { text: target } });
  if (!clients.every((client) => client.view.status === "completed")) throw new Error("The correct full word did not end the duel");
  if (first.view.winner?.ids[0] !== first.playerId) throw new Error("The winning player was not recorded");
  console.log(JSON.stringify({ room: room.code, game: "WordDuel", players: 2, privateWordsProtected: true, correctKeyDisabled: true, wrongKeyDisabled: true, repeatedLetterRejected: repeatedRejected, fullWordSolved: true, virtualPlaytests: room.simulations }));
} finally {
  clients.forEach((client) => client.socket.disconnect());
}
