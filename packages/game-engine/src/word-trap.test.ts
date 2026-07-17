import { describe, expect, it } from "vitest";
import { createRandomWordTrapPack, createWordTrapSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeComposedGame, projectComposedGameState, reduceComposedGame } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const players: PublicPlayer[] = [
  { id: "p1", name: "Alice", isHost: true, connected: true },
  { id: "p2", name: "Basil", isHost: false, connected: true },
  { id: "p3", name: "Chloe", isHost: false, connected: true },
  { id: "p4", name: "Diego", isHost: false, connected: true },
];

describe("WordTrap release gate", () => {
  it("keeps the card private and lets only opponents call a forbidden word", () => {
    const spec = createWordTrapSpec(createRandomWordTrapPack({ themeId: "disco", cardCount: 6 }, "privacy"));
    const teams = { p1: "team_1", p2: "team_1", p3: "team_2", p4: "team_2" };
    const captains = { team_1: "p1", team_2: "p3" };
    let state = initializeComposedGame(spec, players, "word-trap", teams, captains);
    const captainId = state.activePlayerId;
    const activeTeamId = state.teamByPlayer[captainId]!;
    const clueGiverId = state.teams.find((team) => team.id === activeTeamId)!.playerIds.at(-1)!;
    state = reduceComposedGame(
      state,
      {
        type: "COMPOSED_ACTION",
        actionId: "select_clue_giver",
        payload: { targetPlayerId: clueGiverId },
        idempotencyKey: "select-clue-01",
      },
      captainId,
      captainId === "p1",
      spec,
    );
    state = reduceComposedGame(
      state,
      { type: "COMPOSED_ACTION", actionId: "draw_word", idempotencyKey: "draw-word-001" },
      clueGiverId,
      clueGiverId === "p1",
      spec,
    );

    const cardId = state.activeCards[clueGiverId]!.words!;
    const secret = spec.decks[0]!.cards.find((card) => card.id === cardId)!;
    const teammateId =
      state.teams.find((team) => team.id === activeTeamId)!.playerIds.find((id) => id !== clueGiverId) ?? clueGiverId;
    const opponentId = state.teams.find((team) => team.id !== activeTeamId)!.playerIds[0]!;
    expect(JSON.stringify(projectComposedGameState(state, spec, players, "TRAP01", teammateId))).not.toContain(
      secret.title,
    );
    expect(
      projectComposedGameState(state, spec, players, "TRAP01", opponentId).availableActions.map((action) => action.id),
    ).toContain("forbidden_called");
    expect(() =>
      reduceComposedGame(
        state,
        { type: "COMPOSED_ACTION", actionId: "forbidden_called", idempotencyKey: "same-team-buzz" },
        teammateId,
        false,
        spec,
      ),
    ).toThrow("cannot perform");

    const opponentTeamId = state.teamByPlayer[opponentId]!;
    state = reduceComposedGame(
      state,
      { type: "COMPOSED_ACTION", actionId: "forbidden_called", idempotencyKey: "opponent-buzz1" },
      opponentId,
      false,
      spec,
    );
    expect(state.scores.teams[opponentTeamId]).toBe(1);
    expect(state.phaseId).toBe("select_clue_giver");
  });

  it("passes every deterministic virtual-agent simulation", () => {
    const spec = createWordTrapSpec(createRandomWordTrapPack({ themeId: "retro", cardCount: 20 }, "release"));
    const report = runComposedPlaytest(spec, { simulations: 24, seed: "word-trap-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });
});
