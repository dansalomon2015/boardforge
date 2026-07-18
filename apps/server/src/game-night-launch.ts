import { GameNightRuleError, type GameNightGameConfiguration } from "@boardforge/game-engine";
import type { GameNightCompatibility } from "@boardforge/shared";
import { evaluateGameNightCompatibility } from "./game-night-compatibility";
import { createGameNightChildRoom, linkGameNightToChildRoom } from "./game-night-runtime";
import { configureGameNightSpec } from "./game-night-configuration";
import { compiledGameNightBlueprintId } from "./game-night-blueprint";
import type { BlueprintStore, GameNightSessionRecord } from "./persistence";
import { persistedRoom, type Room } from "./room-runtime";

export class GameNightLaunchError extends GameNightRuleError {
  constructor(readonly compatibility: GameNightCompatibility) {
    super(compatibility.reasons[0]?.message ?? "This game is not compatible with the current Game Night.");
  }
}

type LaunchGameNightGameInput = {
  blueprintId: string;
  blueprintStore: Pick<BlueprintStore, "get" | "saveBlueprint" | "saveGameNight" | "saveRoom">;
  createRoomCode: () => string;
  playerId: string;
  rooms: Map<string, Room>;
  runtime: { record: GameNightSessionRecord };
  configuration?: GameNightGameConfiguration | undefined;
};

export async function launchGameNightGame({
  blueprintId,
  blueprintStore,
  createRoomCode,
  playerId,
  rooms,
  runtime,
  configuration,
}: LaunchGameNightGameInput): Promise<Room> {
  if (playerId !== runtime.record.hostPlayerId) throw new GameNightRuleError("Only the host can launch a game.");
  const blueprint = await blueprintStore.get(blueprintId);
  if (!blueprint) throw new GameNightRuleError("Game not found.");
  const compatibility = evaluateGameNightCompatibility(
    runtime.record,
    blueprint.spec,
    blueprint.status === "release_ready",
  );
  if (!compatibility.compatible) throw new GameNightLaunchError(compatibility);
  const selectedConfiguration =
    configuration ??
    (runtime.record.state.selectedBlueprintId === blueprintId
      ? (runtime.record.state.selectedGameConfiguration ?? undefined)
      : undefined);
  const spec = configureGameNightSpec(blueprint.spec, runtime.record.state.teams, selectedConfiguration);
  const gameInstanceId = crypto.randomUUID();
  const compiledBlueprintId = compiledGameNightBlueprintId(blueprint.id, gameInstanceId);
  await blueprintStore.saveBlueprint({
    id: compiledBlueprintId,
    spec,
    status: "release_ready",
    provider: "boardforge-game-night-compiler",
  });
  const room = createGameNightChildRoom({
    session: runtime.record,
    blueprintId: compiledBlueprintId,
    spec,
    roomCode: createRoomCode(),
    gameInstanceId,
  });
  const linked = linkGameNightToChildRoom(runtime.record, room);
  await blueprintStore.saveRoom(persistedRoom(room));
  await blueprintStore.saveGameNight(linked);
  runtime.record = linked;
  rooms.set(room.code, room);
  return room;
}
