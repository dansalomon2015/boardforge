import { describe, expect, it } from "vitest";
import { createGameNightState, gameNightAssignments, GameNightRuleError, recordGameNightResult } from "./game-night";

const teams = [
  { id: "red", name: "Red Rockets", playerIds: ["p1", "p2"] },
  { id: "blue", name: "Blue Moons", playerIds: ["p3", "p4"] },
  { id: "gold", name: "Gold Stars", playerIds: ["p5"] },
];

describe("game-night scoring", () => {
  it("awards three points to the winning team", () => {
    const state = createGameNightState("night-1", teams);
    const next = recordGameNightResult(state, {
      gameInstanceId: "game-1",
      blueprintId: "movie-mime-v1",
      winner: { kind: "teams", ids: ["blue"] },
      idempotencyKey: "result-1",
    });

    expect(next.scores).toEqual({ red: 0, blue: 3, gold: 0 });
    expect(next.scoreEvents).toEqual([
      expect.objectContaining({ id: "result-1", teamId: "blue", points: 3, reason: "win" }),
    ]);
  });

  it("maps an individual winner back to their game-night team", () => {
    const state = createGameNightState("night-1", teams);
    const next = recordGameNightResult(state, {
      gameInstanceId: "game-1",
      blueprintId: "second-sense-v1",
      winner: { kind: "players", ids: ["p5"] },
      idempotencyKey: "result-1",
    });

    expect(next.scores.gold).toBe(3);
    expect(next.completedGames[0]?.awardedTeamIds).toEqual(["gold"]);
  });

  it("awards one point to each team in a tie", () => {
    const state = createGameNightState("night-1", teams);
    const next = recordGameNightResult(state, {
      gameInstanceId: "game-1",
      blueprintId: "word-duel-v1",
      winner: { kind: "players", ids: ["p1", "p3"] },
      idempotencyKey: "result-1",
    });

    expect(next.scores).toEqual({ red: 1, blue: 1, gold: 0 });
  });

  it("does not award points for a cooperative game", () => {
    const state = createGameNightState("night-1", teams);
    const next = recordGameNightResult(state, {
      gameInstanceId: "game-1",
      blueprintId: "story-chain-v1",
      winner: { kind: "none", ids: [] },
      idempotencyKey: "result-1",
    });

    expect(next.scores).toEqual({ red: 0, blue: 0, gold: 0 });
    expect(next.completedGames).toHaveLength(1);
    expect(() =>
      recordGameNightResult(next, {
        gameInstanceId: "game-2",
        blueprintId: "story-chain-v1",
        winner: { kind: "none", ids: [] },
        idempotencyKey: "result-1",
      }),
    ).toThrow(GameNightRuleError);
  });

  it("is idempotent for the same completed game", () => {
    const state = createGameNightState("night-1", teams);
    const result = {
      gameInstanceId: "game-1",
      blueprintId: "movie-mime-v1",
      winner: { kind: "teams" as const, ids: ["red"] },
      idempotencyKey: "result-1",
    };
    const once = recordGameNightResult(state, result);

    expect(recordGameNightResult(once, result)).toBe(once);
    expect(() => recordGameNightResult(once, { ...result, winner: { kind: "teams", ids: ["blue"] } })).toThrow(
      GameNightRuleError,
    );
  });

  it("rejects duplicate team ids and players assigned twice", () => {
    expect(() => createGameNightState("night-1", [teams[0]!, { ...teams[1]!, id: "red" }])).toThrow(GameNightRuleError);
    expect(() => createGameNightState("night-1", [teams[0]!, { ...teams[1]!, playerIds: ["p2", "p3"] }])).toThrow(
      GameNightRuleError,
    );
  });

  it("preserves teams and captains while participant selection stays game-specific", () => {
    const state = createGameNightState("night-1", [
      { ...teams[0]!, captainPlayerId: "p1" },
      { ...teams[1]!, captainPlayerId: "p4" },
    ]);

    expect(gameNightAssignments(state, true)).toEqual({
      teamByPlayer: { p1: "red", p2: "red", p3: "blue", p4: "blue" },
      captainByTeam: { red: "p1", blue: "p4" },
    });
    expect(state).not.toHaveProperty("activePlayerId");
  });

  it("requires captains only for games that use captain-selected participants", () => {
    const state = createGameNightState("night-1", [teams[0]!, teams[1]!]);

    expect(gameNightAssignments(state, false).captainByTeam).toEqual({});
    expect(() => gameNightAssignments(state, true)).toThrow("Choose a captain");
    expect(() => createGameNightState("night-1", [{ ...teams[0]!, captainPlayerId: "p3" }, teams[1]!])).toThrow(
      "must belong to that team",
    );
  });
});
