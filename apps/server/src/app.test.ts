import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { defaultMovieMimeSpec, defaultSecondSenseSpec } from "@boardforge/game-spec";
import { FakeLlmProvider } from "@boardforge/llm";
import { createBoardForgeServer } from "./app";

let activeApp: FastifyInstance | undefined;

afterEach(async () => {
  await activeApp?.close();
  activeApp = undefined;
});

describe("BoardForge HTTP application", () => {
  it("falls back to audited local movie and word catalogues when AI content is unavailable", async () => {
    class UnavailableContentProvider extends FakeLlmProvider {
      override async generateMovieMimePack(): Promise<never> {
        throw new Error("OpenAI quota expired");
      }

      override async generateWordTrapPack(): Promise<never> {
        throw new Error("OpenAI quota expired");
      }
    }

    const { app } = await createBoardForgeServer({
      databaseUrl: null,
      llmProvider: "fake",
      gameContentProvider: new UnavailableContentProvider(),
      logger: false,
      restoreRooms: false,
    });
    activeApp = app;

    const movie = await app.inject({
      method: "POST",
      url: "/api/movie-mime/blueprints",
      payload: { themeId: "noir", filmCount: 8, preferences: "family comedy classics" },
    });
    expect(movie.statusCode).toBe(201);
    expect(movie.json()).toMatchObject({
      source: "random",
      fallbackUsed: true,
      filmCount: 8,
      releaseStatus: "release_ready",
    });

    const words = await app.inject({
      method: "POST",
      url: "/api/word-trap/blueprints",
      payload: { themeId: "disco", cardCount: 8, preferences: "food and travel" },
    });
    expect(words.statusCode).toBe(201);
    expect(words.json()).toMatchObject({
      source: "random",
      fallbackUsed: true,
      cardCount: 8,
      releaseStatus: "release_ready",
    });
  });

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

  it("adapts a ranked child game to four persistent teams", async () => {
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
      payload: {
        hostName: "Maya",
        teams: [{ name: "Comets" }, { name: "Moons" }, { name: "Sparks" }, { name: "Waves" }],
      },
    });
    const host = created.json();
    const code = host.view.code as string;
    const players = [host];
    for (const name of ["Noah", "Ada", "Leo"]) {
      const joined = await app.inject({
        method: "POST",
        url: `/api/game-nights/${code}/join`,
        payload: { name },
      });
      players.push(joined.json());
    }

    for (const [index, player] of players.entries()) {
      const teamId = `team_${index + 1}`;
      const selection = await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${code}/team`,
        payload: { playerId: player.playerId, reconnectToken: player.reconnectToken, teamId },
      });
      expect(selection.statusCode).toBe(200);
      const captain = await app.inject({
        method: "PATCH",
        url: `/api/game-nights/${code}/captain`,
        payload: {
          playerId: host.playerId,
          reconnectToken: host.reconnectToken,
          teamId,
          captainPlayerId: player.playerId,
        },
      });
      expect(captain.statusCode).toBe(200);
    }

    const catalog = await app.inject({ method: "GET", url: `/api/game-nights/${code}/catalog` });
    const movie = catalog.json().games.find((game: { id: string }) => game.id === defaultMovieMimeSpec.id);
    expect(movie).toMatchObject({
      game: { minPlayers: 4 },
      compatibility: { compatible: true, reasons: [] },
    });

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
    expect(child.json()).toMatchObject({ playerCount: 4, started: false });
  });
});
