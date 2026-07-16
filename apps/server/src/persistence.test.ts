import { describe, expect, it } from "vitest";
import { applyComposedBalancePatch, cinemaCharadesSpec } from "@boardforge/game-spec";
import { runComposedPlaytest } from "@boardforge/game-engine";
import { MemoryBlueprintStore } from "./persistence";

describe("MemoryBlueprintStore", () => {
  it("persists a validated blueprint and its release report", async () => {
    const store = new MemoryBlueprintStore();
    await store.saveBlueprint({ id: "cinema-test", spec: cinemaCharadesSpec, status: "playtesting", provider: "test", prompt: "test prompt" });
    const report = runComposedPlaytest(cinemaCharadesSpec, { simulations: 2, seed: "persistence-test" });
    await store.savePlaytest("cinema-test", "release_ready", report);

    const stored = await store.get("cinema-test");
    expect(stored?.status).toBe("release_ready");
    expect(stored?.spec.id).toBe(cinemaCharadesSpec.id);
    expect(stored?.playtest?.simulations).toBe(2);
  });

  it("rejects an invalid GameSpec before storage", async () => {
    const store = new MemoryBlueprintStore();
    await expect(store.saveBlueprint({
      id: "invalid",
      spec: { ...cinemaCharadesSpec, phases: [] },
      status: "draft",
      provider: "test",
    })).rejects.toThrow("Refusing invalid persisted GameSpec");
  });

  it("never overwrites an existing revision", async () => {
    const store = new MemoryBlueprintStore();
    await store.saveBlueprint({ id: "immutable", spec: cinemaCharadesSpec, status: "playtesting", provider: "test" });
    await expect(store.saveBlueprint({
      id: "immutable",
      spec: { ...cinemaCharadesSpec, title: "A different game" },
      status: "playtesting",
      provider: "test",
    })).rejects.toThrow("immutable");
    expect((await store.get("immutable"))?.spec.title).toBe(cinemaCharadesSpec.title);
  });

  it("persists room snapshots and append-only idempotent events", async () => {
    const store = new MemoryBlueprintStore();
    await store.saveBlueprint({ id: "cinema-room", spec: cinemaCharadesSpec, status: "release_ready", provider: "test" });
    const session = {
      code: "ABC234",
      blueprintId: "cinema-room",
      players: [],
      reconnectTokenHashes: {},
      lobbyTeamByPlayer: {},
      seed: "ABC234-seed",
      checkpoint: { revision: 2 },
      checkpointChecksum: "checksum",
      checkpointRevision: 2,
    };
    await store.saveRoom(session);
    const event = {
      id: "00000000-0000-4000-8000-000000000099",
      roomCode: "ABC234",
      sequence: 1,
      actorId: "00000000-0000-4000-8000-000000000001",
      actorIsHost: true,
      expectedRevision: 1,
      resultingRevision: 2,
      idempotencyKey: "event-key-001",
      action: { type: "COMPOSED_ACTION" as const, actionId: "draw_film" },
    };
    await store.appendRoomEvent(session, event);

    expect((await store.findRoomEvent("ABC234", "event-key-001"))?.resultingRevision).toBe(2);
    expect((await store.loadRooms())[0]?.events).toEqual([event]);
    await expect(store.appendRoomEvent(session, { ...event, id: "00000000-0000-4000-8000-000000000100", sequence: 2 })).rejects.toThrow("Duplicate");
  });

  it("persists and explicitly accepts a verified balance revision", async () => {
    const store = new MemoryBlueprintStore();
    const beforeReport = runComposedPlaytest(cinemaCharadesSpec, { simulations: 2, seed: "balance-before" });
    const patch = {
      schemaVersion: 1 as const,
      sourceSpecId: cinemaCharadesSpec.id,
      summary: "Resserre le chronomètre après un playtest sans blocage.",
      changes: [{ kind: "set_timer_seconds" as const, componentId: "mime_timer", seconds: 55 }],
    };
    const applied = applyComposedBalancePatch(cinemaCharadesSpec, patch, "cinema_charades_balanced");
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const afterReport = runComposedPlaytest(applied.spec, { simulations: 2, seed: "balance-after" });

    await store.saveBlueprint({ id: "balance-source", spec: cinemaCharadesSpec, status: "release_ready", provider: "test" });
    await store.savePlaytest("balance-source", "release_ready", beforeReport);
    await store.saveBlueprint({ id: "balance-derived", spec: applied.spec, status: "validating", provider: "test" });
    await store.savePlaytest("balance-derived", "validating", afterReport);
    await store.saveBalancePatch({
      id: "00000000-0000-4000-8000-000000000101",
      sourceBlueprintId: "balance-source",
      derivedBlueprintId: "balance-derived",
      provider: "test",
      patch,
      beforeReport,
      afterReport,
      status: "proposed",
    });

    const accepted = await store.acceptBalancePatch("00000000-0000-4000-8000-000000000101");
    expect(accepted.status).toBe("accepted");
    expect((await store.get("balance-derived"))?.status).toBe("release_ready");
  });
});
