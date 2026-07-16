import { describe, expect, it } from "vitest";
import { cinemaCharadesSpec, partyPulseSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import {
  initializeComposedGame,
  initializeGame,
  reduceComposedGame,
  reduceGame,
  replayGame,
  stateChecksum,
  type ReplayEntry,
} from "./index";

const players: PublicPlayer[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "A", isHost: true, connected: true },
  { id: "00000000-0000-4000-8000-000000000002", name: "B", isHost: false, connected: true },
];

describe("deterministic room replay", () => {
  it("replays legacy actions to the same checksum", () => {
    let state = initializeGame(partyPulseSpec, players, "legacy-replay");
    const events: ReplayEntry[] = [];
    for (const [index, player] of players.entries()) {
      const action = { type: "SUBMIT_ANSWER" as const, optionId: partyPulseSpec.questions[0]!.type === "trivia" ? partyPulseSpec.questions[0]!.options[0]!.id : "unused" };
      const expectedRevision = state.revision;
      state = reduceGame(state, action, player.id, player.isHost, partyPulseSpec);
      events.push({ sequence: index + 1, actorId: player.id, isHost: player.isHost, expectedRevision, resultingRevision: state.revision, idempotencyKey: `legacy-${index + 1}`, action });
    }
    const replayed = replayGame({ spec: partyPulseSpec, players, seed: "legacy-replay", events });
    expect(stateChecksum(replayed)).toBe(stateChecksum(state));
  });

  it("replays composed actions with their persisted idempotency keys", () => {
    const teams = { [players[0]!.id]: "projecteurs", [players[1]!.id]: "clapboards" };
    let state = initializeComposedGame(cinemaCharadesSpec, players, "composed-replay", teams);
    const action = { type: "COMPOSED_ACTION" as const, actionId: "draw_film" };
    const actor = players.find((player) => player.id === state.activePlayerId)!;
    const expectedRevision = state.revision;
    state = reduceComposedGame(state, { ...action, idempotencyKey: "replay-key-001" }, actor.id, actor.isHost, cinemaCharadesSpec);
    const events: ReplayEntry[] = [{ sequence: 1, actorId: actor.id, isHost: actor.isHost, expectedRevision, resultingRevision: state.revision, idempotencyKey: "replay-key-001", action }];
    const replayed = replayGame({ spec: cinemaCharadesSpec, players, seed: "composed-replay", teamByPlayer: teams, events });
    expect(stateChecksum(replayed)).toBe(stateChecksum(state));
  });

  it("rejects a stale or discontinuous event stream", () => {
    expect(() => replayGame({
      spec: cinemaCharadesSpec,
      players,
      seed: "bad-replay",
      teamByPlayer: { [players[0]!.id]: "projecteurs", [players[1]!.id]: "clapboards" },
      events: [{
        sequence: 2,
        actorId: players[0]!.id,
        isHost: true,
        expectedRevision: 99,
        resultingRevision: 100,
        idempotencyKey: "bad-replay-001",
        action: { type: "COMPOSED_ACTION", actionId: "draw_film" },
      }],
    })).toThrow("sequence");
  });
});
