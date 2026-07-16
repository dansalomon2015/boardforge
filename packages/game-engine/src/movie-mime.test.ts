import { describe, expect, it } from "vitest";
import {
  createMovieMimeSpec,
  createRandomMovieMimePack,
} from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeComposedGame, projectComposedGameState, reduceComposedGame } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

describe("movie mime release gate", () => {
  it("completes every simulation without exposing resolution before a card is drawn", () => {
    const pack = createRandomMovieMimePack(
      { themeId: "noir", filmCount: 20, preferences: "grands classiques accessibles" },
      "release-gate",
    );
    const report = runComposedPlaytest(createMovieMimeSpec(pack), {
      simulations: 24,
      seed: "movie-mime-release",
    });

    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });

  it("lets the chosen captain select a teammate and rotates to the next team captain", () => {
    const spec = createMovieMimeSpec(createRandomMovieMimePack(
      { themeId: "noir", filmCount: 6 },
      "captain-flow",
    ));
    const players: PublicPlayer[] = [
      { id: "p1", name: "Alice", isHost: true, connected: true },
      { id: "p2", name: "Basile", isHost: false, connected: true },
      { id: "p3", name: "Chloé", isHost: false, connected: true },
      { id: "p4", name: "Diego", isHost: false, connected: true },
    ];
    const teamByPlayer = { p1: "team_1", p2: "team_1", p3: "team_2", p4: "team_2" };
    const captainByTeam = { team_1: "p1", team_2: "p3" };
    let state = initializeComposedGame(spec, players, "captain-flow", teamByPlayer, captainByTeam);
    const startingCaptain = state.activePlayerId;
    const startingTeamId = state.teamByPlayer[startingCaptain]!;
    const selectedMimer = state.teams.find((team) => team.id === startingTeamId)!.playerIds.find((id) => id !== startingCaptain)!;

    expect(projectComposedGameState(state, spec, players, "MIME01", startingCaptain).availableActions.map((action) => action.id)).toContain("select_mimer");
    const otherCaptain = startingCaptain === "p1" ? "p3" : "p1";
    expect(() => reduceComposedGame(state, {
      type: "COMPOSED_ACTION",
      actionId: "select_mimer",
      payload: { targetPlayerId: selectedMimer },
      idempotencyKey: "wrong-captain-01",
    }, otherCaptain, false, spec)).toThrow("cannot perform");

    state = reduceComposedGame(state, {
      type: "COMPOSED_ACTION",
      actionId: "select_mimer",
      payload: { targetPlayerId: selectedMimer },
      idempotencyKey: "select-mimer-01",
    }, startingCaptain, startingCaptain === "p1", spec);
    expect(state.phaseId).toBe("draw");
    expect(state.activePlayerId).toBe(selectedMimer);

    state = reduceComposedGame(state, {
      type: "COMPOSED_ACTION",
      actionId: "draw_film",
      idempotencyKey: "draw-film-001",
    }, selectedMimer, selectedMimer === "p1", spec);
    state = reduceComposedGame(state, {
      type: "COMPOSED_ACTION",
      actionId: "film_guessed",
      idempotencyKey: "film-result-01",
    }, selectedMimer, selectedMimer === "p1", spec);

    const nextTeam = state.teams.find((team) => team.id !== startingTeamId)!;
    expect(state.phaseId).toBe("select_mimer");
    expect(state.activePlayerId).toBe(captainByTeam[nextTeam.id as keyof typeof captainByTeam]);
  });
});
