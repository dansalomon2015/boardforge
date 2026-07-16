import { describe, expect, it } from "vitest";
import { cinemaCharadesSpec } from "./composed-fixtures";
import { applyComposedBalancePatch, composedBalancePatchSchema } from "./balance-patch";

describe("composed balance patches", () => {
  it("applies an allowlisted timer change without mutating the source", () => {
    const source = structuredClone(cinemaCharadesSpec);
    const result = applyComposedBalancePatch(
      source,
      {
        schemaVersion: 1,
        sourceSpecId: source.id,
        summary: "Accorde un peu plus de temps à chaque mime.",
        changes: [{ kind: "set_timer_seconds", componentId: "mime_timer", seconds: 75 }],
      },
      "cinema_charades_balanced",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.id).toBe("cinema_charades_balanced");
    expect(result.spec.components.find((component) => component.id === "mime_timer")).toMatchObject({
      kind: "timer",
      seconds: 75,
    });
    expect(source.components.find((component) => component.id === "mime_timer")).toMatchObject({
      kind: "timer",
      seconds: 60,
    });
  });

  it("rejects arbitrary paths and values at the schema boundary", () => {
    const parsed = composedBalancePatchSchema.safeParse({
      schemaVersion: 1,
      sourceSpecId: cinemaCharadesSpec.id,
      summary: "Essaie de remplacer une règle avec un chemin libre.",
      changes: [{ path: "actions.0.effects.0", value: "eval('unsafe')" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a change aimed at the wrong effect kind", () => {
    const result = applyComposedBalancePatch(
      cinemaCharadesSpec,
      {
        schemaVersion: 1,
        sourceSpecId: cinemaCharadesSpec.id,
        summary: "Essaie de modifier un effet non numérique.",
        changes: [
          {
            kind: "set_effect_amount",
            owner: "action",
            ownerId: "draw_film",
            effectIndex: 1,
            amount: 3,
          },
        ],
      },
      "cinema_charades_balanced",
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "PATCH_TARGET_KIND_INVALID" }],
    });
  });

  it("keeps resource initial values inside their audited range", () => {
    const source = structuredClone(cinemaCharadesSpec);
    source.resources = [{ id: "energy", name: "Énergie", scope: "global", initialValue: 1, min: 0, max: 5 }];
    const result = applyComposedBalancePatch(
      source,
      {
        schemaVersion: 1,
        sourceSpecId: source.id,
        summary: "Essaie de placer la ressource au-delà de sa limite.",
        changes: [{ kind: "set_resource_initial", resourceId: "energy", initialValue: 8 }],
      },
      "cinema_charades_balanced",
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "PATCH_VALUE_OUTSIDE_RESOURCE_RANGE" }],
    });
  });
});
