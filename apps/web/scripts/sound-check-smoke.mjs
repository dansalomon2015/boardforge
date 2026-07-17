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
      reject(new Error("Timed out waiting for SoundCheck state"));
    }, 5_000);
    const receive = (view) => {
      if (!predicate(view)) return;
      clearTimeout(timeout);
      client.socket.off("room:state", receive);
      resolve(view);
    };
    client.socket.on("room:state", receive);
  });
}

async function createSoundCheckRoom() {
  const blueprintResponse = await fetch(`${apiUrl}/api/sound-check/blueprints`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ themeId: "retro", promptCount: 6 }),
  });
  if (!blueprintResponse.ok) throw new Error(`Blueprint creation failed: ${blueprintResponse.status}`);
  const blueprint = await blueprintResponse.json();
  if (blueprint.releaseStatus !== "release_ready")
    throw new Error("SoundCheck blueprint did not pass the release gate");
  const roomResponse = await fetch(`${apiUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blueprintId: blueprint.blueprintId }),
  });
  if (!roomResponse.ok) throw new Error(`Room creation failed: ${roomResponse.status}`);
  return roomResponse.json();
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

const room = await createSoundCheckRoom();
const clients = ["Avery", "Blake", "Casey", "Drew"].map((name) => ({
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

  const teamIds = clients[0].view.teamSetup.teams.map((team) => team.id);
  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    await emitAck(client.socket, "room:team:select", {
      code: room.code,
      playerId: client.playerId,
      teamId: teamIds[index % 2],
    });
  }
  await emitAck(clients[0].socket, "room:captain:select", {
    code: room.code,
    playerId: clients[0].playerId,
    teamId: teamIds[0],
    captainPlayerId: clients[0].playerId,
  });
  await emitAck(clients[0].socket, "room:captain:select", {
    code: room.code,
    playerId: clients[0].playerId,
    teamId: teamIds[1],
    captainPlayerId: clients[1].playerId,
  });

  const started = clients.map((client) => nextState(client, (view) => view.kind === "composed"));
  await emitAck(clients[0].socket, "room:start", { code: room.code, playerId: clients[0].playerId });
  await Promise.all(started);

  const captain = clients.find((client) => client.playerId === clients[0].view.activePlayerId);
  if (!captain) throw new Error("Active SoundCheck captain was not connected");
  const captainTeam = captain.view.teams.find((team) => team.playerIds.includes(captain.playerId));
  const performerId = captainTeam.playerIds.find((id) => id !== captain.playerId) ?? captain.playerId;
  const performer = clients.find((client) => client.playerId === performerId);
  if (!performer) throw new Error("Selected performer was not connected");

  const performerSelected = nextState(
    performer,
    (view) => view.kind === "composed" && view.phase.id === "draw_sound" && view.activePlayerId === performerId,
  );
  await gameAction(captain, room.code, {
    type: "COMPOSED_ACTION",
    actionId: "select_performer",
    payload: { targetPlayerId: performerId },
  });
  await performerSelected;

  const liveViews = clients.map((client) =>
    nextState(client, (view) => view.kind === "composed" && view.phase.id === "performing"),
  );
  await gameAction(performer, room.code, { type: "COMPOSED_ACTION", actionId: "draw_sound" });
  await Promise.all(liveViews);

  const secret = performer.view.components.find((component) => component.kind === "prompt")?.data?.prompt;
  if (!secret) throw new Error("The performer did not receive the private sound prompt");
  const audience = clients.filter((client) => client !== performer);
  if (audience.some((client) => JSON.stringify(client.view).includes(secret)))
    throw new Error("A private SoundCheck prompt leaked to the audience");
  const guesser = audience.find((client) =>
    client.view.availableActions.some((action) => action.id === "submit_guess"),
  );
  if (!guesser) throw new Error("No eligible SoundCheck guesser was found");

  await gameAction(guesser, room.code, {
    type: "COMPOSED_ACTION",
    actionId: "submit_guess",
    payload: { text: "Definitely wrong" },
  });
  await nextState(guesser, (view) => view.kind === "composed" && view.revision >= 4);
  if (guesser.view.phase.id !== "performing") throw new Error("An incorrect guess unexpectedly ended the performance");
  const scoringTeamId = guesser.view.teams.find((team) => team.playerIds.includes(guesser.playerId)).id;
  const scoreBefore = guesser.view.scores.teams[scoringTeamId] ?? 0;
  await gameAction(guesser, room.code, {
    type: "COMPOSED_ACTION",
    actionId: "submit_guess",
    payload: { text: secret.toUpperCase() },
  });
  await nextState(guesser, (view) => view.kind === "composed" && view.phase.id === "select_performer");
  if ((guesser.view.scores.teams[scoringTeamId] ?? 0) !== scoreBefore + 1)
    throw new Error("The exact SoundCheck guess did not score");

  console.log(
    JSON.stringify({
      room: room.code,
      game: "SoundCheck",
      teams: teamIds.length,
      privatePromptProtected: true,
      wrongGuessRejected: true,
      exactGuessScored: true,
      revision: guesser.view.revision,
    }),
  );
} finally {
  clients.forEach((client) => {
    client.socket.disconnect();
  });
}
