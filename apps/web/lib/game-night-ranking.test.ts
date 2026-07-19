import { describe, expect, it } from "vitest";
import { rankGameNightTeams } from "./game-night-ranking";

const team = (id: string, name: string, score: number) => ({
  id,
  name,
  score,
  color: "#ff5c5c",
  playerIds: [],
});

describe("Game Night final ranking", () => {
  it("uses competition ranking for tied teams", () => {
    expect(
      rankGameNightTeams([team("gold", "Gold", 1), team("blue", "Blue", 4), team("red", "Red", 4)]).map(
        ({ id, rank }) => ({ id, rank }),
      ),
    ).toEqual([
      { id: "blue", rank: 1 },
      { id: "red", rank: 1 },
      { id: "gold", rank: 3 },
    ]);
  });

  it("orders equal scores by team name for deterministic rendering", () => {
    expect(rankGameNightTeams([team("z", "Zebras", 0), team("a", "Alphas", 0)]).map(({ id }) => id)).toEqual([
      "a",
      "z",
    ]);
  });
});
