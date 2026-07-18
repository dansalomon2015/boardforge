import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { defaultMovieMimeSpec } from "@boardforge/game-spec";
import { createBoardForgeServer } from "./app";

let activeApp: FastifyInstance | undefined;

afterEach(async () => {
  await activeApp?.close();
  activeApp = undefined;
});

describe("BoardForge HTTP application", () => {
  it("builds without opening a port and exposes health/catalogue routes", async () => {
    const { app } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      logger: false,
      restoreRooms: false,
    });
    activeApp = app;

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", provider: "procedural-local", persistence: "memory" });

    const games = await app.inject({ method: "GET", url: "/api/games" });
    expect(games.statusCode).toBe(200);
    expect(games.json().games).toEqual(
      expect.arrayContaining([expect.objectContaining({ experienceId: "movie_mime" })]),
    );
  });

  it("creates a game night, forms teams, selects captains and launches a child room", async () => {
    const { app } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      logger: false,
      restoreRooms: false,
    });
    activeApp = app;

    const created = await app.inject({
      method: "POST",
      url: "/api/game-nights",
      payload: { hostName: "Maya", teams: [{ name: "Red Rockets" }, { name: "Blue Moons" }] },
    });
    expect(created.statusCode).toBe(201);
    const host = created.json();
    const code = host.view.code as string;

    const joined = await app.inject({
      method: "POST",
      url: `/api/game-nights/${code}/join`,
      payload: { name: "Noah" },
    });
    expect(joined.statusCode).toBe(200);
    const guest = joined.json();

    for (const selection of [
      { player: host, teamId: "team_1" },
      { player: guest, teamId: "team_2" },
    ]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${code}/team`,
        payload: {
          playerId: selection.player.playerId,
          reconnectToken: selection.player.reconnectToken,
          teamId: selection.teamId,
        },
      });
      expect(response.statusCode).toBe(200);
    }

    for (const captain of [
      { teamId: "team_1", captainPlayerId: host.playerId },
      { teamId: "team_2", captainPlayerId: guest.playerId },
    ]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${code}/captain`,
        payload: {
          playerId: host.playerId,
          reconnectToken: host.reconnectToken,
          ...captain,
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const launched = await app.inject({
      method: "POST",
      url: `/api/game-nights/${code}/games`,
      payload: {
        playerId: host.playerId,
        reconnectToken: host.reconnectToken,
        blueprintId: defaultMovieMimeSpec.id,
      },
    });
    expect(launched.statusCode).toBe(201);
    const child = await app.inject({ method: "GET", url: `/api/rooms/${launched.json().code}` });
    expect(child.json()).toMatchObject({ playerCount: 2, started: false });

    const secondLaunch = await app.inject({
      method: "POST",
      url: `/api/game-nights/${code}/games`,
      payload: {
        playerId: host.playerId,
        reconnectToken: host.reconnectToken,
        blueprintId: defaultMovieMimeSpec.id,
      },
    });
    expect(secondLaunch.statusCode).toBe(409);
  });
});
