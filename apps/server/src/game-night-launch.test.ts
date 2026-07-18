import { describe, expect, it } from "vitest";
import { defaultWordTrapSpec } from "@boardforge/game-spec";
import { createGameNightState } from "@boardforge/game-engine";
import { compiledGameNightBlueprintId, sourceGameNightBlueprintId } from "./game-night-blueprint";
import { launchGameNightGame } from "./game-night-launch";
import { MemoryBlueprintStore, type GameNightSessionRecord } from "./persistence";
import type { Room } from "./room-runtime";

describe("Game Night compiled blueprints", () => {
  it("persists the effective GameSpec so restart replay keeps teams and settings", async () => {
    const store = new MemoryBlueprintStore();
    await store.saveBlueprint({
      id: defaultWordTrapSpec.id,
      spec: defaultWordTrapSpec,
      status: "release_ready",
      provider: "test",
    });
    const playerIds = Array.from({ length: 4 }, () => crypto.randomUUID());
    const teams = playerIds.map((playerId, index) => ({
      id: `team_${index + 1}`,
      name: `Team ${index + 1}`,
      playerIds: [playerId],
      captainPlayerId: playerId,
    }));
    const gameNightId = crypto.randomUUID();
    const state = createGameNightState(gameNightId, teams);
    state.status = "playing";
    state.selectedBlueprintId = defaultWordTrapSpec.id;
    state.selectedGameConfiguration = { rounds: 8, turnSeconds: 45 };
    const record: GameNightSessionRecord = {
      id: gameNightId,
      code: "ABC234",
      hostPlayerId: playerIds[0]!,
      players: playerIds.map((id, index) => ({
        id,
        name: `Player ${index + 1}`,
        isHost: index === 0,
        connected: true,
      })),
      reconnectTokenHashes: Object.fromEntries(playerIds.map((id) => [id, "a".repeat(64)])),
      state,
      currentRoomCode: null,
    };
    await store.saveGameNight(record);
    const runtime = { record };
    const rooms = new Map<string, Room>();

    const room = await launchGameNightGame({
      blueprintId: defaultWordTrapSpec.id,
      blueprintStore: store,
      createRoomCode: () => "QWER23",
      playerId: playerIds[0]!,
      rooms,
      runtime,
      configuration: { rounds: 8, turnSeconds: 45 },
    });

    expect(room.blueprintId).toBe(compiledGameNightBlueprintId(defaultWordTrapSpec.id, room.gameInstanceId!));
    expect(sourceGameNightBlueprintId(room.blueprintId)).toBe(defaultWordTrapSpec.id);
    const compiled = await store.get(room.blueprintId);
    expect(compiled).toMatchObject({ status: "release_ready", provider: "boardforge-game-night-compiler" });
    expect(compiled?.spec.template).toBe("composed");
    if (compiled?.spec.template !== "composed") throw new Error("Expected a composed GameSpec.");
    expect(compiled.spec.setup.rounds).toBe(8);
    expect(compiled.spec.setup.teamPolicy?.teams).toHaveLength(4);
    expect(compiled.spec.components.find((component) => component.kind === "timer")).toMatchObject({ seconds: 45 });
    expect((await store.loadRooms())[0]?.blueprintId).toBe(room.blueprintId);
  });
});
