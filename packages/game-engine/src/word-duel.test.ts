import { describe, expect, it } from "vitest";
import { createWordDuelSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { canStartComposedGame, initializeComposedGame, projectComposedGameState, reduceComposedGame, type ComposedGameState } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const players: PublicPlayer[] = [
  { id: "p1", name: "Ada", isHost: true, connected: true },
  { id: "p2", name: "Linus", isHost: false, connected: true },
];
const spec = createWordDuelSpec({ themeId: "minimal", difficulty: "classic" });

function act(state: ComposedGameState, actorId: string, actionId: string, sequence: number, text: string) {
  return reduceComposedGame(state, { type: "COMPOSED_ACTION", actionId, idempotencyKey: `duel-${sequence.toString().padStart(4, "0")}`, payload: { text } }, actorId, actorId === "p1", spec);
}

describe("WordDuel release gate", () => {
  it("locks secrets without projecting them and resolves the keyboard authoritatively", () => {
    let state = initializeComposedGame(spec, players, "word-duel-room");
    state = act(state, "p1", "lock_word", 1, "apple");
    expect(state.actions.at(-1)?.payload).toEqual({});
    expect(JSON.stringify(projectComposedGameState(state, spec, players, "WORDS1", "p2"))).not.toContain("APPLE");
    state = act(state, "p2", "lock_word", 2, "planet");
    expect(state.phaseId).toBe("duel");

    const firstActor = state.activePlayerId;
    const firstOpponent = firstActor === "p1" ? "p2" : "p1";
    const opponentWord = state.wordDuels.duel_board!.secretWordsByPlayer[firstOpponent]!;
    const correctLetter = opponentWord[0]!;
    state = act(state, firstActor, "guess_letter", 3, correctLetter);
    const firstView = projectComposedGameState(state, spec, players, "WORDS1", firstActor);
    const board = firstView.components.find((component) => component.kind === "word_duel");
    expect(board?.data.opponentMask).toContain(correctLetter);
    expect((board?.data.keyboard as Array<{ letter: string; state: string }>).find((key) => key.letter === correctLetter)?.state).toBe("correct");
    expect(state.activePlayerId).toBe(firstOpponent);

    const secondOpponentWord = state.wordDuels.duel_board!.secretWordsByPlayer[firstActor]!;
    const wrongLetter = [..."QZXJV"].find((letter) => !secondOpponentWord.includes(letter))!;
    state = act(state, firstOpponent, "guess_letter", 4, wrongLetter);
    expect(() => act(state, firstActor, "guess_letter", 5, correctLetter)).toThrow("already been played");
    state = act(state, firstActor, "solve_word", 6, opponentWord.toLowerCase());
    expect(state.status).toBe("completed");
    expect(state.winner).toEqual({ kind: "players", ids: [firstActor] });
  });

  it("requires exactly two players and passes deterministic virtual playtests", () => {
    expect(canStartComposedGame(spec, 1)).toBe(false);
    expect(canStartComposedGame(spec, 2)).toBe(true);
    expect(canStartComposedGame(spec, 3)).toBe(false);
    const report = runComposedPlaytest(spec, { simulations: 24, seed: "word-duel-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });
});
