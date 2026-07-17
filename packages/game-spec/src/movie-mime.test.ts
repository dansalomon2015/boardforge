import { describe, expect, it } from "vitest";
import { createMovieMimePack, createMovieMimeSpec, createRandomMovieMimePack, movieCatalog } from "./movie-mime";
import { validateComposedGameSpec } from "./composed";

describe("movie mime game", () => {
  it("provides a sufficiently varied catalog with stable unique IDs", () => {
    expect(movieCatalog.length).toBeGreaterThanOrEqual(50);
    expect(new Set(movieCatalog.map((film) => film.id)).size).toBe(movieCatalog.length);
  });

  it("creates a deterministic random pack with the requested size", () => {
    const setup = { themeId: "noir" as const, filmCount: 12 };
    const first = createRandomMovieMimePack(setup, "same-night");
    const second = createRandomMovieMimePack(setup, "same-night");
    expect(first).toEqual(second);
    expect(first.films).toHaveLength(12);
    expect(first.source).toBe("random");
  });

  it("rejects unknown and duplicate catalog selections", () => {
    const setup = { themeId: "disco" as const, filmCount: 6 };
    expect(() => createMovieMimePack(setup, ["matrix", "matrix", "titanic", "rocky", "shrek", "coco"], "ai")).toThrow(
      "duplicate",
    );
    expect(() =>
      createMovieMimePack(setup, ["matrix", "titanic", "rocky", "shrek", "coco", "invented_movie"], "ai"),
    ).toThrow("Unknown movie catalog id");
  });

  it("compiles a film pack into the fixed captain-led game loop", () => {
    const pack = createRandomMovieMimePack(
      { themeId: "cosmic", filmCount: 10, preferences: "family science fiction" },
      "cosmic-night",
    );
    const spec = createMovieMimeSpec(pack);
    expect(validateComposedGameSpec(spec).ok).toBe(true);
    expect(spec.setup.rounds).toBe(10);
    expect(spec.decks[0]?.cards).toHaveLength(10);
    expect(spec.phases.map((phase) => phase.actionIds)).toEqual([
      ["select_mimer"],
      ["draw_film"],
      ["film_guessed", "film_passed"],
    ]);
  });

  it("preserves two to four named teams in the compiled GameSpec", () => {
    const pack = createRandomMovieMimePack(
      {
        themeId: "retro",
        filmCount: 6,
        teams: [
          { name: "The Reels", color: "#6c42f5" },
          { name: "The Stunts", color: "#ff6b4a" },
          { name: "The Oscars", color: "#22a699" },
        ],
      },
      "three-teams",
    );
    const spec = createMovieMimeSpec(pack);
    expect(spec.setup.mode).toBe("teams");
    expect(spec.setup.teamPolicy?.teams.map((team) => team.name)).toEqual(["The Reels", "The Stunts", "The Oscars"]);
    expect(spec.minPlayers).toBe(3);
  });
});
