import { describe, expect, it } from "vitest";
import { createRandomSoundCheckPack, createSoundCheckSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeComposedGame, projectComposedGameState, reduceComposedGame } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const players: PublicPlayer[] = [
  { id: "p1", name: "Alice", isHost: true, connected: true },
  { id: "p2", name: "Basil", isHost: false, connected: true },
  { id: "p3", name: "Chloe", isHost: false, connected: true },
  { id: "p4", name: "Diego", isHost: false, connected: true },
];

describe("SoundCheck release gate", () => {
  it("protects the prompt, blocks the performer from guessing, and scores an exact answer", () => {
    const spec = createSoundCheckSpec(createRandomSoundCheckPack({ themeId: "retro", promptCount: 6 }, "privacy"));
    const teams = { p1: "team_1", p2: "team_1", p3: "team_2", p4: "team_2" };
    const captains = { team_1: "p1", team_2: "p3" };
    let state = initializeComposedGame(spec, players, "sound-check", teams, captains);
    const captainId = state.activePlayerId;
    const performerId = state.teams.find((team) => team.id === state.teamByPlayer[captainId])!.playerIds.at(-1)!;
    state = reduceComposedGame(state, { type: "COMPOSED_ACTION", actionId: "select_performer", payload: { targetPlayerId: performerId }, idempotencyKey: "choose-performer-01" }, captainId, captainId === "p1", spec);
    state = reduceComposedGame(state, { type: "COMPOSED_ACTION", actionId: "draw_sound", idempotencyKey: "draw-sound-001" }, performerId, performerId === "p1", spec);

    const cardId = state.activeCards[performerId]!.sounds!;
    const secret = spec.decks[0]!.cards.find((card) => card.id === cardId)!;
    const guesserId = players.find((player) => player.id !== performerId)!.id;
    expect(JSON.stringify(projectComposedGameState(state, spec, players, "SOUND1", guesserId))).not.toContain(secret.title);
    expect(() => reduceComposedGame(state, { type: "COMPOSED_ACTION", actionId: "submit_guess", payload: { text: secret.title }, idempotencyKey: "performer-cannot-guess" }, performerId, false, spec)).toThrow("cannot perform");

    state = reduceComposedGame(state, { type: "COMPOSED_ACTION", actionId: "submit_guess", payload: { text: "Wrong answer" }, idempotencyKey: "wrong-guess-001" }, guesserId, false, spec);
    expect(state.phaseId).toBe("performing");
    const scoringTeam = state.teamByPlayer[guesserId]!;
    state = reduceComposedGame(state, { type: "COMPOSED_ACTION", actionId: "submit_guess", payload: { text: secret.title.toUpperCase() }, idempotencyKey: "right-guess-001" }, guesserId, false, spec);
    expect(state.scores.teams[scoringTeam]).toBe(1);
    expect(state.phaseId).toBe("select_performer");
  });

  it("passes every deterministic virtual-agent simulation", () => {
    const spec = createSoundCheckSpec(createRandomSoundCheckPack({ themeId: "disco", promptCount: 18 }, "release"));
    const report = runComposedPlaytest(spec, { simulations: 24, seed: "sound-check-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });
});
