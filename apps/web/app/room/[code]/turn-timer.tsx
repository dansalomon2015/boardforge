"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { ComposedGameView } from "@boardforge/shared";
import styles from "./movie-mime.module.css";
import { synchronizedRemainingSeconds } from "./turn-timer-state";

type TurnTimer = ComposedGameView["turnTimer"];

export function useTurnCountdown(timer: TurnTimer, fallbackSeconds: number): number {
  const [remaining, setRemaining] = useState(() =>
    timer ? synchronizedRemainingSeconds(timer, 0, 0) : fallbackSeconds,
  );

  useEffect(() => {
    if (!timer) {
      setRemaining(fallbackSeconds);
      return;
    }
    const receivedAt = Date.now();
    const update = () => setRemaining(synchronizedRemainingSeconds(timer, receivedAt, Date.now()));
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [fallbackSeconds, timer?.deadlineAt, timer?.phaseVisit, timer?.serverNow]);

  return remaining;
}

export function TurnTimerDial({ view, fallbackSeconds }: { view: ComposedGameView; fallbackSeconds: number }) {
  const remaining = useTurnCountdown(view.turnTimer, fallbackSeconds);
  const totalSeconds = view.turnTimer?.totalSeconds ?? fallbackSeconds;
  const progress = totalSeconds > 0 ? Math.min(1, remaining / totalSeconds) : 0;

  return (
    <div
      className={`${styles.timer} ${remaining <= 10 ? styles.urgentTimer : ""}`}
      role="timer"
      aria-label={`${remaining} seconds remaining`}
      style={{ "--timer-progress": `${progress * 360}deg` } as CSSProperties}
    >
      <i aria-hidden="true" />
      <span>{remaining}</span>
      <small>seconds</small>
    </div>
  );
}
