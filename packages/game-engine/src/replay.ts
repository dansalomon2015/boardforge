import type { BoardGameSpec } from "@boardforge/game-spec";
import type { GameAction, PublicPlayer } from "@boardforge/shared";
import {
  initializeComposedGame,
  reduceComposedGame,
  type ComposedGameState,
} from "./composed-engine.js";
import {
  initializeGame,
  reduceGame,
  type GameState,
} from "./index.js";

export type ReplayEntry = {
  sequence: number;
  actorId: string;
  isHost: boolean;
  expectedRevision: number;
  resultingRevision: number;
  idempotencyKey: string;
  action: GameAction;
};

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function stateChecksum(state: GameState | ComposedGameState): string {
  const input = JSON.stringify(canonicalValue(state));
  let first = 2_166_136_261;
  let second = 2_166_136_261 ^ 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16_777_619);
    second = Math.imul(second ^ (code + index), 16_777_619);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function replayGame(options: {
  spec: BoardGameSpec;
  players: PublicPlayer[];
  seed: string;
  teamByPlayer?: Record<string, string> | undefined;
  events: ReplayEntry[];
}): GameState | ComposedGameState {
  const ordered = [...options.events].sort((left, right) => left.sequence - right.sequence);
  let state: GameState | ComposedGameState = options.spec.template === "composed"
    ? initializeComposedGame(options.spec, options.players, options.seed, options.teamByPlayer ?? {})
    : initializeGame(options.spec, options.players, options.seed);

  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index]!;
    if (event.sequence !== index + 1) throw new ReplayError(`Missing or duplicate event sequence at ${event.sequence}.`);
    if (state.revision !== event.expectedRevision) {
      throw new ReplayError(`Event ${event.sequence} expected revision ${event.expectedRevision}, found ${state.revision}.`);
    }
    if (state.template === "composed" && options.spec.template === "composed") {
      if (event.action.type !== "COMPOSED_ACTION") throw new ReplayError(`Event ${event.sequence} has the wrong action template.`);
      state = reduceComposedGame(
        state,
        { ...event.action, idempotencyKey: event.idempotencyKey },
        event.actorId,
        event.isHost,
        options.spec,
      );
    } else if (state.template !== "composed" && options.spec.template !== "composed") {
      if (event.action.type === "COMPOSED_ACTION") throw new ReplayError(`Event ${event.sequence} has the wrong action template.`);
      state = reduceGame(state, event.action, event.actorId, event.isHost, options.spec);
    } else {
      throw new ReplayError("State and GameSpec templates do not match during replay.");
    }
    if (state.revision !== event.resultingRevision) {
      throw new ReplayError(`Event ${event.sequence} produced revision ${state.revision}, expected ${event.resultingRevision}.`);
    }
  }
  return state;
}
