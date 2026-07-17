import { describe, expect, it } from "vitest";
import { createDrawBattleSpec, createRandomDrawBattlePack } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeComposedGame, projectComposedGameState, reduceComposedGame } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const players: PublicPlayer[] = [
  { id: "p1", name: "Alice", isHost: true, connected: true },
  { id: "p2", name: "Basil", isHost: false, connected: true },
  { id: "p3", name: "Chloe", isHost: false, connected: true },
  { id: "p4", name: "Diego", isHost: false, connected: true },
];

describe("DrawBattle release gate", () => {
  it("protects the prompt, synchronizes bounded strokes, and scores an exact guess", () => {
    const spec = createDrawBattleSpec(createRandomDrawBattlePack({ themeId: "arcade", promptCount: 6 }, "privacy"));
    const teams = { p1: "team_1", p2: "team_1", p3: "team_2", p4: "team_2" };
    const captains = { team_1: "p1", team_2: "p3" };
    let state = initializeComposedGame(spec, players, "draw-battle", teams, captains);
    const captainId = state.activePlayerId;
    const artistId = state.teams.find((team) => team.id === state.teamByPlayer[captainId])!.playerIds.at(-1)!;
    state = reduceComposedGame(
      state,
      {
        type: "COMPOSED_ACTION",
        actionId: "select_artist",
        payload: { targetPlayerId: artistId },
        idempotencyKey: "choose-artist-01",
      },
      captainId,
      captainId === "p1",
      spec,
    );
    state = reduceComposedGame(
      state,
      { type: "COMPOSED_ACTION", actionId: "draw_prompt", idempotencyKey: "draw-prompt-001" },
      artistId,
      artistId === "p1",
      spec,
    );

    const cardId = state.activeCards[artistId]!.prompts!;
    const secret = spec.decks[0]!.cards.find((card) => card.id === cardId)!;
    const guesserId = players.find((player) => player.id !== artistId)!.id;
    expect(JSON.stringify(projectComposedGameState(state, spec, players, "DRAW01", guesserId))).not.toContain(
      secret.title,
    );
    expect(() =>
      reduceComposedGame(
        state,
        {
          type: "COMPOSED_ACTION",
          actionId: "submit_guess",
          payload: { text: secret.title },
          idempotencyKey: "artist-cannot-guess",
        },
        artistId,
        false,
        spec,
      ),
    ).toThrow("cannot perform");
    expect(() =>
      reduceComposedGame(
        state,
        {
          type: "COMPOSED_ACTION",
          actionId: "draw_stroke",
          payload: {
            stroke: {
              id: "outside",
              points: [
                { x: 10, y: 20 },
                { x: 700, y: 90 },
              ],
            },
          },
          idempotencyKey: "outside-canvas-1",
        },
        artistId,
        false,
        spec,
      ),
    ).toThrow("inside the drawing canvas");

    state = reduceComposedGame(
      state,
      {
        type: "COMPOSED_ACTION",
        actionId: "draw_stroke",
        payload: {
          stroke: {
            id: "stroke_1",
            points: [
              { x: 10, y: 20 },
              { x: 130, y: 90 },
            ],
          },
        },
        idempotencyKey: "stroke-event-001",
      },
      artistId,
      artistId === "p1",
      spec,
    );
    const guesserCanvas = projectComposedGameState(state, spec, players, "DRAW01", guesserId).components.find(
      (component) => component.kind === "drawing",
    );
    expect(guesserCanvas?.data.strokes).toEqual([
      {
        id: "stroke_1",
        points: [
          { x: 10, y: 20 },
          { x: 130, y: 90 },
        ],
      },
    ]);

    state = reduceComposedGame(
      state,
      {
        type: "COMPOSED_ACTION",
        actionId: "submit_guess",
        payload: { text: "Wrong answer" },
        idempotencyKey: "wrong-guess-001",
      },
      guesserId,
      false,
      spec,
    );
    expect(state.phaseId).toBe("drawing");
    const scoringTeam = state.teamByPlayer[guesserId]!;
    state = reduceComposedGame(
      state,
      {
        type: "COMPOSED_ACTION",
        actionId: "submit_guess",
        payload: { text: secret.title.toUpperCase() },
        idempotencyKey: "right-guess-001",
      },
      guesserId,
      false,
      spec,
    );
    expect(state.scores.teams[scoringTeam]).toBe(1);
    expect(state.phaseId).toBe("select_artist");
  });

  it("passes every deterministic virtual-agent simulation", () => {
    const spec = createDrawBattleSpec(createRandomDrawBattlePack({ themeId: "retro", promptCount: 18 }, "release"));
    const report = runComposedPlaytest(spec, { simulations: 24, seed: "draw-battle-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });
});
