import type { ComposedComponent } from "@boardforge/game-spec";
import type { ComposedGameState } from "./composed-types";

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const output = [...values];
  let state = hashSeed(seed) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = output[index];
    output[index] = output[swapIndex] as T;
    output[swapIndex] = current as T;
  }
  return output;
}

export function nextRandom(state: ComposedGameState, scope: string): number {
  const value = hashSeed(`${state.seed}:${scope}:${state.randomCounter}`) / 4_294_967_296;
  state.randomCounter += 1;
  return value;
}

export function secondSenseTarget(
  seed: string,
  component: Extract<ComposedComponent, { kind: "second_sense" }>,
  stage: number,
  previousTarget?: number,
): number {
  const slots = Math.floor((component.maxTargetMs - component.minTargetMs) / component.precisionMs) + 1;
  let slot = hashSeed(`${seed}:second-sense:${component.id}:${stage}`) % slots;
  let target = component.minTargetMs + slot * component.precisionMs;
  if (target === previousTarget && slots > 1) {
    slot = (slot + 1) % slots;
    target = component.minTargetMs + slot * component.precisionMs;
  }
  return target;
}
