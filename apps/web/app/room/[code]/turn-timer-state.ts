import type { ComposedGameView } from "@boardforge/shared";

type TurnTimer = NonNullable<ComposedGameView["turnTimer"]>;

export function synchronizedRemainingSeconds(timer: TurnTimer, receivedAt: number, now: number): number {
  const localDeadline = receivedAt + Math.max(0, timer.deadlineAt - timer.serverNow);
  return Math.max(0, Math.ceil((localDeadline - now) / 1_000));
}
