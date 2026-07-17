import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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
});
