import { describe, expect, it } from "vitest";
import { createSecondSenseSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeComposedGame, projectComposedGameState, reduceComposedGame, type ComposedGameState } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const spec = createSecondSenseSpec({ themeId: "cyberpunk", tempo: "classic" });

function players(count: number): PublicPlayer[] {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `Player ${index + 1}`, isHost: index === 0, connected: true }));
}

function act(state: ComposedGameState, actorId: string, actionId: string, sequence: number, elapsedMs?: number) {
  return reduceComposedGame(state, {
    type: "COMPOSED_ACTION",
    actionId,
    idempotencyKey: `sense-${sequence.toString().padStart(4, "0")}`,
    ...(elapsedMs === undefined ? {} : { payload: { elapsedMs } }),
  }, actorId, actorId === "p1", spec);
}

function attempt(state: ComposedGameState, actorId: string, sequence: number, elapsedMs: number) {
  const started = act(state, actorId, "start_clock", sequence, undefined);
  return act(started, actorId, "stop_clock", sequence + 1, elapsedMs);
}

describe("Second Sense release gate", () => {
  it("keeps attempts private until everyone locks and qualifies the closest half", () => {
    const roomPlayers = players(5);
    let state = initializeComposedGame(spec, roomPlayers, "second-sense-five");
    const target = state.secondSenses.sense_board!.targetMs;
    state = attempt(state, "p1", 1, target + 5);
    const waitingView = projectComposedGameState(state, spec, roomPlayers, "SENSE1", "p2");
    const waitingBoard = waitingView.components.find((component) => component.kind === "second_sense");
    expect(waitingBoard?.data.lastRound).toBeNull();
    expect(waitingBoard?.data.ownAttemptMs).toBeUndefined();

    state = attempt(state, "p2", 3, target + 10);
    state = attempt(state, "p3", 5, target + 20);
    state = attempt(state, "p4", 7, target + 30);
    state = attempt(state, "p5", 9, target + 40);
    const sense = state.secondSenses.sense_board!;
    expect(sense.stageStatus).toBe("reveal");
    expect(sense.lastRound?.qualifiedPlayerIds).toEqual(["p1", "p2", "p3"]);

    state = act(state, "p1", "next_stage", 11);
    expect(state.secondSenses.sense_board?.activePlayerIds).toEqual(["p1", "p2", "p3"]);
    expect(state.secondSenses.sense_board?.targetMs).not.toBe(target);
    const eliminatedView = projectComposedGameState(state, spec, roomPlayers, "SENSE1", "p5");
    expect(eliminatedView.availableActions.filter((action) => action.kind.startsWith("timing_"))).toEqual([]);
  });

  it("replays an exact final tie with a new target, then declares one winner", () => {
    const finalists = players(2);
    let state = initializeComposedGame(spec, finalists, "second-sense-final");
    const firstTarget = state.secondSenses.sense_board!.targetMs;
    state = attempt(state, "p1", 1, firstTarget - 25);
    state = attempt(state, "p2", 3, firstTarget + 25);
    expect(state.status).toBe("playing");
    expect(state.secondSenses.sense_board?.lastRound?.finalTie).toBe(true);

    state = act(state, "p1", "next_stage", 5);
    const secondTarget = state.secondSenses.sense_board!.targetMs;
    expect(secondTarget).not.toBe(firstTarget);
    state = attempt(state, "p1", 6, secondTarget + 4);
    state = attempt(state, "p2", 8, secondTarget + 80);
    expect(state.status).toBe("completed");
    expect(state.winner).toEqual({ kind: "players", ids: ["p1"] });
  });

  it("passes deterministic virtual playtests across supported room sizes", () => {
    const report = runComposedPlaytest(spec, { simulations: 24, seed: "second-sense-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.testedPlayerCounts).toEqual([2, 3, 4, 6, 12]);
    expect(report.failures).toEqual([]);
  });
});
