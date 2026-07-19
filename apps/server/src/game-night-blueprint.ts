const compiledBlueprintPattern = /^game_night_(.+)_([0-9a-f]{32})$/;

export function compiledGameNightBlueprintId(sourceBlueprintId: string, gameInstanceId: string): string {
  return `game_night_${sourceBlueprintId}_${gameInstanceId.replaceAll("-", "")}`;
}

export function sourceGameNightBlueprintId(blueprintId: string): string {
  return compiledBlueprintPattern.exec(blueprintId)?.[1] ?? blueprintId;
}
