import { io } from "socket.io-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.ok) resolve(response.data);
      else reject(new Error(response?.error ?? `${event} failed`));
    });
  });
}

function emitAckFailure(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.ok) reject(new Error(`${event} unexpectedly succeeded`));
      else resolve(response?.error ?? `${event} rejected`);
    });
  });
}

function nextState(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("room:state", receive);
      reject(new Error("Timed out waiting for room state"));
    }, 5_000);
    const receive = (view) => {
      if (!predicate(view)) return;
      clearTimeout(timeout);
      socket.off("room:state", receive);
      resolve(view);
    };
    socket.on("room:state", receive);
  });
}

async function createRoom(template) {
  const response = await fetch(`${apiUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template }),
  });
  if (!response.ok) throw new Error(`Room creation failed: ${response.status}`);
  return response.json();
}

async function emitGameAction(client, roomCode, action) {
  const idempotencyKey = crypto.randomUUID();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const revision = client.view?.revision;
    if (!revision) throw new Error("Client has no revisioned game view");
    try {
      return await emitAck(client.socket, "game:action", {
        code: roomCode,
        playerId: client.playerId,
        expectedRevision: revision,
        idempotencyKey,
        action,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Stale room revision") || attempt === 5) throw error;
      const staleRevision = revision;
      await new Promise((resolve) => {
        const check = (view) => {
          if (view.kind !== "lobby" && view.revision > staleRevision) {
            clearTimeout(timeout);
            client.socket.off("room:state", check);
            resolve();
          }
        };
        const timeout = setTimeout(() => {
          client.socket.off("room:state", check);
          resolve();
        }, 200);
        client.socket.on("room:state", check);
      });
    }
  }
}

async function runGame(template, playerCount) {
  const room = await createRoom(template);
  const clients = Array.from({ length: playerCount }, (_, index) => ({
    name: `Bot ${index + 1}`,
    socket: io(apiUrl, { transports: ["websocket"] }),
    playerId: "",
    view: null,
    acted: new Set(),
  }));

  try {
    for (const client of clients) {
      const joined = await emitAck(client.socket, "room:join", { code: room.code, name: client.name });
      client.playerId = joined.playerId;
      client.view = joined.view;
    }

    if (template === "composed") {
      const teamIds = clients[0].view?.teamSetup?.teams.map((team) => team.id) ?? [];
      if (teamIds.length < 2) throw new Error("Composed lobby did not expose selectable teams");
      for (let index = 0; index < clients.length; index += 1) {
        const client = clients[index];
        await emitAck(client.socket, "room:team:select", {
          code: room.code,
          playerId: client.playerId,
          teamId: teamIds[index % teamIds.length],
        });
      }
    }

    const completed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${template} smoke test timed out`)), 15_000);

      clients.forEach((client, clientIndex) => {
        client.socket.on("room:state", async (view) => {
          client.view = view;
          if (view.kind === "lobby") return;
          if (clientIndex === 0) {
            console.log(`  ${template} r${view.round} ${typeof view.phase === "string" ? view.phase : view.phase.id} rev${view.revision}`);
          }
          if (view.status === "completed") {
            clearTimeout(timeout);
            resolve(view);
            return;
          }

          const key = `${view.round}:${typeof view.phase === "string" ? view.phase : view.phase.id}:${view.activePlayerId ?? ""}`;
          if (client.acted.has(key)) return;
          client.acted.add(key);

          let action = null;
          if (view.kind === "hidden_roles") {
            if (view.phase === "mission" && !view.submitted) {
              action = {
                type: "SUBMIT_MISSION",
                choice: view.ownRole.team === "saboteur" && view.round === 1 ? "sabotage" : "success",
              };
            } else if (view.phase === "vote" && !view.submitted) {
              action = { type: "CAST_VOTE", targetPlayerId: view.players[0].id };
            } else if (view.phase === "reveal" && clientIndex === 0) {
              action = { type: "ADVANCE" };
            }
          } else if (view.kind === "composed") {
            const available = view.availableActions.find((candidate) => ["draw", "complete_challenge", "advance"].includes(candidate.kind));
            if (available) {
              action = { type: "COMPOSED_ACTION", actionId: available.id };
            }
          } else if (view.phase === "answer" && !view.submitted) {
            action = view.question.type === "trivia"
              ? { type: "SUBMIT_ANSWER", optionId: view.question.options[0].id }
              : { type: "CAST_PLAYER_VOTE", targetPlayerId: view.players[0].id };
          } else if (view.phase === "reveal" && clientIndex === 0) {
            action = { type: "ADVANCE" };
          }

          if (action) {
            try {
              await emitGameAction(client, room.code, action);
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          }
        });
      });
    });

    await emitAck(clients[0].socket, "room:start", { code: room.code, playerId: clients[0].playerId });
    const finalView = await completed;
    console.log(`✓ ${template} completed in room ${room.code} at revision ${finalView.revision}`);
  } finally {
    clients.forEach((client) => client.socket.disconnect());
  }
}

async function testSecureReconnect() {
  const room = await createRoom("composed");
  const original = io(apiUrl, { transports: ["websocket"] });
  const replacement = io(apiUrl, { transports: ["websocket"] });
  const attacker = io(apiUrl, { transports: ["websocket"] });
  try {
    const firstSession = await emitAck(original, "room:join", { code: room.code, name: "Reconnect Bot" });
    if (!firstSession.reconnectToken) throw new Error("Join did not issue a reconnect token");
    const originalDisconnected = new Promise((resolve) => original.once("disconnect", resolve));
    const rotatedSession = await emitAck(replacement, "room:join", {
      code: room.code,
      name: "Reconnect Bot",
      playerId: firstSession.playerId,
      reconnectToken: firstSession.reconnectToken,
    });
    await originalDisconnected;
    if (rotatedSession.reconnectToken === firstSession.reconnectToken) throw new Error("Reconnect token was not rotated");

    await emitAckFailure(attacker, "room:join", {
      code: room.code,
      name: "Attacker",
      playerId: firstSession.playerId,
      reconnectToken: firstSession.reconnectToken,
    });
    await emitAckFailure(attacker, "room:start", { code: room.code, playerId: firstSession.playerId });
    console.log(`✓ secure reconnect rotated credentials and rejected impersonation in room ${room.code}`);
  } finally {
    original.disconnect();
    replacement.disconnect();
    attacker.disconnect();
  }
}

async function testRevisionAndIdempotency() {
  const room = await createRoom("composed");
  const clients = [
    { socket: io(apiUrl, { transports: ["websocket"] }), name: "Revision Host" },
    { socket: io(apiUrl, { transports: ["websocket"] }), name: "Revision Guest" },
  ];
  try {
    for (const client of clients) Object.assign(client, await emitAck(client.socket, "room:join", { code: room.code, name: client.name }));
    const teamIds = clients[0].view.teamSetup.teams.map((team) => team.id);
    await emitAck(clients[0].socket, "room:team:select", { code: room.code, playerId: clients[0].playerId, teamId: teamIds[0] });
    await emitAck(clients[1].socket, "room:team:select", { code: room.code, playerId: clients[1].playerId, teamId: teamIds[1] });
    const statePromises = clients.map((client) => nextState(client.socket, (view) => view.kind === "composed"));
    await emitAck(clients[0].socket, "room:start", { code: room.code, playerId: clients[0].playerId });
    const views = await Promise.all(statePromises);
    const activeIndex = clients.findIndex((client) => client.playerId === views[0].activePlayerId);
    const activeClient = clients[activeIndex];
    const activeView = views[activeIndex];
    const actionId = activeView.availableActions.find((action) => action.kind === "draw")?.id;
    if (!activeClient || !actionId) throw new Error("Revision test could not find the active draw action");
    const envelope = {
      code: room.code,
      playerId: activeClient.playerId,
      expectedRevision: activeView.revision,
      idempotencyKey: crypto.randomUUID(),
      action: { type: "COMPOSED_ACTION", actionId },
    };
    const first = await emitAck(activeClient.socket, "game:action", envelope);
    const duplicate = await emitAck(activeClient.socket, "game:action", envelope);
    if (duplicate.revision !== first.revision) throw new Error("Idempotent retry returned a different revision");
    await emitAckFailure(activeClient.socket, "game:action", {
      ...envelope,
      action: { type: "COMPOSED_ACTION", actionId: "film_guessed" },
    });
    await emitAckFailure(activeClient.socket, "game:action", {
      ...envelope,
      idempotencyKey: crypto.randomUUID(),
    });
    console.log(`✓ revision conflicts and idempotent retries verified in room ${room.code}`);
  } finally {
    clients.forEach((client) => client.socket.disconnect());
  }
}

await runGame("hidden_roles", 4);
await runGame("quiz_vote", 3);
await runGame("composed", 4);
await testSecureReconnect();
await testRevisionAndIdempotency();
console.log("✓ Multiplayer smoke test passed");
