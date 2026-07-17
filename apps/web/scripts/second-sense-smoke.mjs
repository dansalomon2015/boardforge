import { io } from "socket.io-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => socket.emit(event, payload, (response) => response?.ok ? resolve(response.data) : reject(new Error(response?.error ?? `${event} failed`))));
}

function nextState(client, predicate) {
  if (client.view && predicate(client.view)) return Promise.resolve(client.view);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.socket.off("room:state", receive); reject(new Error("Timed out waiting for Second Sense state")); }, 6_000);
    const receive = (view) => { if (!predicate(view)) return; clearTimeout(timeout); client.socket.off("room:state", receive); resolve(view); };
    client.socket.on("room:state", receive);
  });
}

async function createRoom() {
  const blueprintResponse = await fetch(`${apiUrl}/api/second-sense/blueprints`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ themeId: "cyberpunk", tempo: "quickfire" }) });
  if (!blueprintResponse.ok) throw new Error(`Blueprint creation failed: ${blueprintResponse.status}`);
  const blueprint = await blueprintResponse.json();
  if (blueprint.releaseStatus !== "release_ready" || blueprint.playtest.completedSimulations !== 24) throw new Error("Second Sense did not pass 24 virtual playtests");
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

function board(client) {
  return client.view.components.find((component) => component.kind === "second_sense")?.data;
}

async function attempt(client, clients, code, offsetMs) {
  await actAndSync(client, clients, code, { type: "COMPOSED_ACTION", actionId: "start_clock" });
  await new Promise((resolve) => setTimeout(resolve, board(client).targetMs + offsetMs));
  await actAndSync(client, clients, code, { type: "COMPOSED_ACTION", actionId: "stop_clock", payload: { elapsedMs: 30_000 } });
}

const room = await createRoom();
const clients = ["Maya", "Noah", "Avery", "Kai", "Zoe"].map((name) => ({ name, socket: io(apiUrl, { transports: ["websocket"] }), playerId: "", view: null }));

try {
  for (const client of clients) {
    client.socket.on("room:state", (view) => { client.view = view; });
    const joined = await emitAck(client.socket, "room:join", { code: room.code, name: client.name });
    client.playerId = joined.playerId;
    client.view = joined.view;
  }
  const started = clients.map((client) => nextState(client, (view) => view.kind === "composed"));
  await emitAck(clients[0].socket, "room:start", { code: room.code, playerId: clients[0].playerId });
  await Promise.all(started);

  const target1 = board(clients[0]).targetMs;
  await attempt(clients[0], clients, room.code, 20);
  const privateWaitingBoard = board(clients[4]);
  if (privateWaitingBoard.lastRound !== null || privateWaitingBoard.ownAttemptMs !== undefined) throw new Error("A timing result leaked before the reveal");
  await attempt(clients[1], clients, room.code, 160);
  await attempt(clients[2], clients, room.code, 300);
  await attempt(clients[3], clients, room.code, 450);
  await attempt(clients[4], clients, room.code, 600);
  if (board(clients[0]).lastRound.qualifiedPlayerIds.length !== 3) throw new Error("The closest half did not survive stage one");
  if (board(clients[0]).lastRound.entries.some((entry) => entry.elapsedMs === 30_000)) throw new Error("The server trusted a forged client duration");

  await actAndSync(clients[0], clients, room.code, { type: "COMPOSED_ACTION", actionId: "next_stage" });
  const target2 = board(clients[0]).targetMs;
  if (target2 === target1) throw new Error("The stage target did not change");
  const semifinalists = board(clients[0]).activePlayerIds.map((playerId) => clients.find((client) => client.playerId === playerId));
  if (semifinalists.some((client) => !client)) throw new Error("A semifinalist was not found");
  await attempt(semifinalists[0], clients, room.code, 30);
  await attempt(semifinalists[1], clients, room.code, 220);
  await attempt(semifinalists[2], clients, room.code, 450);
  if (board(clients[0]).lastRound.qualifiedPlayerIds.length !== 2) throw new Error("The semifinal did not produce two finalists");

  await actAndSync(clients[0], clients, room.code, { type: "COMPOSED_ACTION", actionId: "next_stage" });
  const finalists = board(clients[0]).activePlayerIds.map((playerId) => clients.find((client) => client.playerId === playerId));
  if (finalists.some((client) => !client)) throw new Error("A finalist was not found");
  await attempt(finalists[0], clients, room.code, 25);
  await attempt(finalists[1], clients, room.code, 450);
  if (!clients.every((client) => client.view.status === "completed")) throw new Error("The final did not complete");
  if (clients[0].view.winner?.ids[0] !== finalists[0].playerId) throw new Error("The closest finalist was not declared the winner");

  console.log(JSON.stringify({ room: room.code, game: "Second Sense", players: clients.length, privateAttemptsProtected: true, serverAuthoritativeTiming: true, eliminationStages: 3, changingTargets: true, winnerResolved: true, virtualPlaytests: room.simulations }));
} finally {
  clients.forEach((client) => client.socket.disconnect());
}
