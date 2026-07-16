import { describe, expect, it } from "vitest";
import { cinemaCharadesSpec } from "./composed-fixtures";
import { validateComposedGameSpec } from "./composed";

describe("ComposedGameSpec validation", () => {
  it("accepts the composed cinema charades fixture", () => {
    const result = validateComposedGameSpec(cinemaCharadesSpec);
    expect(result.ok).toBe(true);
  });

  it("rejects references to components that do not exist", () => {
    const broken = structuredClone(cinemaCharadesSpec);
    broken.phases[0]!.componentIds.push("missing_component");
    const result = validateComposedGameSpec(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === "UNKNOWN_COMPONENT")).toBe(true);
  });

  it("rejects executable-looking extension fields", () => {
    const result = validateComposedGameSpec({ ...cinemaCharadesSpec, script: "return process.env" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unsafe resource range", () => {
    const broken = structuredClone(cinemaCharadesSpec) as unknown as Record<string, unknown>;
    broken.resources = [{ id: "energy", name: "Énergie", scope: "global", initialValue: 20, min: 0, max: 10 }];
    const result = validateComposedGameSpec(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === "RESOURCE_RANGE_INVALID")).toBe(true);
  });

  it("rejects a team policy that can create empty teams", () => {
    const broken = structuredClone(cinemaCharadesSpec);
    broken.minPlayers = 2;
    broken.setup.teamPolicy!.teams.push({ id: "critiques", name: "Les Critiques", color: "#13b6c8" });
    const result = validateComposedGameSpec(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === "TEAM_MINIMUM_INVALID")).toBe(true);
  });

  it("rejects an action without a compatible human control", () => {
    const broken = structuredClone(cinemaCharadesSpec);
    broken.phases[0]!.componentIds = broken.phases[0]!.componentIds.filter((id) => id !== "film_deck");
    const result = validateComposedGameSpec(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === "HUMAN_CONTROL_MISSING")).toBe(true);
  });
});
