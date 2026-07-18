import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { defaultMovieMimeSpec, defaultSecondSenseSpec } from "@boardforge/game-spec";
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

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/api/game-nights/NIGHT2/team",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "PATCH",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-methods"]).toContain("PATCH");
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

    const waitingForCaptains = await app.inject({ method: "GET", url: `/api/game-nights/${code}/catalog` });
    expect(waitingForCaptains.statusCode).toBe(200);
    expect(waitingForCaptains.json().games).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: defaultMovieMimeSpec.id,
          compatibility: expect.objectContaining({
            compatible: false,
            requiresCaptains: true,
            reasons: expect.arrayContaining([expect.objectContaining({ code: "CAPTAIN_REQUIRED" })]),
          }),
        }),
      ]),
    );

    const unsupportedLaunch = await app.inject({
      method: "POST",
      url: `/api/game-nights/${code}/games`,
      payload: {
        playerId: host.playerId,
        reconnectToken: host.reconnectToken,
        blueprintId: defaultSecondSenseSpec.id,
      },
    });
    expect(unsupportedLaunch.statusCode).toBe(409);
    expect(unsupportedLaunch.json()).toMatchObject({
      compatibility: {
        compatible: false,
        reasons: expect.arrayContaining([expect.objectContaining({ code: "NOT_IN_CATALOG" })]),
      },
    });

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

    const compatibleCatalog = await app.inject({ method: "GET", url: `/api/game-nights/${code}/catalog` });
    const movie = compatibleCatalog.json().games.find((game: { id: string }) => game.id === defaultMovieMimeSpec.id);
    expect(movie.compatibility).toMatchObject({ compatible: true, reasons: [] });

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
