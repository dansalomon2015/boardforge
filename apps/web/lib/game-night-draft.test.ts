import { describe, expect, it } from "vitest";
import { validateGameNightDraft, type GameNightTeamDraft } from "./game-night-draft";

const teams: GameNightTeamDraft[] = [
  { id: "one", name: "Moon Club", color: "#ff6b4a" },
  { id: "two", name: "Night Owls", color: "#6c42f5" },
];

describe("Game Night creation draft", () => {
  it("accepts two to four uniquely named and colored teams", () => {
    expect(validateGameNightDraft("Maya", teams)).toBeNull();
    expect(
      validateGameNightDraft("Maya", [
        ...teams,
        { id: "three", name: "Wild Cards", color: "#22a699" },
        { id: "four", name: "Golden Hour", color: "#e2a72e" },
      ]),
    ).toBeNull();
  });

  it("rejects duplicate names and colors", () => {
    expect(validateGameNightDraft("Maya", [...teams, { id: "three", name: " moon club ", color: "#22a699" }])).toBe(
      "Give every team a different name.",
    );
    expect(validateGameNightDraft("Maya", [...teams, { id: "three", name: "Wild Cards", color: "#FF6B4A" }])).toBe(
      "Give every team its own color.",
    );
  });
});
