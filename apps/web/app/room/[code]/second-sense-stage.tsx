"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { GameSurface } from "../../../components/game-ui";
import { themeForRoom } from "./stage-shared";
import secondSenseStyles from "./second-sense.module.css";

export function SecondSenseStage({
  view,
  isHost,
  pending,
  sendAction,
}: {
  view: ComposedGameView;
  isHost: boolean;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [localTiming, setLocalTiming] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const theme = themeForRoom(view.theme);
  const board = view.components.find((component) => component.kind === "second_sense")?.data as
    | {
        stage?: number;
        stageStatus?: "open" | "reveal";
        targetMs?: number;
        previousTargetMs?: number | null;
        activePlayerIds?: string[];
        startedPlayerIds?: string[];
        lockedPlayerIds?: string[];
        ownAttemptMs?: number;
        playerStates?: Array<{
          playerId: string;
          name: string;
          status: "ready" | "timing" | "locked" | "qualified" | "eliminated";
        }>;
        lastRound?: {
          stage: number;
          targetMs: number;
          entries: Array<{ playerId: string; elapsedMs: number; errorMs: number; rank: number }>;
          qualifiedPlayerIds: string[];
          finalTie: boolean;
        } | null;
      }
    | undefined;
  const stage = board?.stage ?? 1;
  const activeIds = board?.activePlayerIds ?? [];
  const isActive = activeIds.includes(view.selfPlayerId);
  const serverStarted = board?.startedPlayerIds?.includes(view.selfPlayerId) ?? false;
  const locked = board?.lockedPlayerIds?.includes(view.selfPlayerId) ?? false;
  const timing = localTiming || (serverStarted && !locked);
  const targetMs = board?.targetMs ?? 2_000;
  const winnerId = view.winner?.kind === "players" ? view.winner.ids[0] : undefined;
  const winner = view.players.find((player) => player.id === winnerId);
  const formatTime = (milliseconds: number) => (milliseconds / 1_000).toFixed(2);
  const attemptStorageKey = `boardforge:${view.code}:second-sense:${stage}:startedAt`;

  useEffect(() => {
    if (!serverStarted || locked) {
      if (locked) sessionStorage.removeItem(attemptStorageKey);
      if (!serverStarted) setLocalTiming(false);
      return;
    }
    const saved = Number(sessionStorage.getItem(attemptStorageKey));
    if (Number.isFinite(saved) && saved > 0) {
      startedAtRef.current = saved;
      setLocalTiming(true);
    }
  }, [attemptStorageKey, locked, serverStarted]);

  function startClock() {
    if (!isActive || board?.stageStatus !== "open" || locked || timing) return;
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    sessionStorage.setItem(attemptStorageKey, String(startedAt));
    setLocalTiming(true);
    sendAction({ type: "COMPOSED_ACTION", actionId: "start_clock" });
  }

  function stopClock() {
    const startedAt = startedAtRef.current ?? Number(sessionStorage.getItem(attemptStorageKey));
    if (!timing || !Number.isFinite(startedAt) || startedAt <= 0) return;
    setLocalTiming(false);
    sendAction({ type: "COMPOSED_ACTION", actionId: "stop_clock" });
  }

  function advanceRound() {
    sendAction({ type: "COMPOSED_ACTION", actionId: "next_stage" });
  }

  const states = board?.playerStates ?? [];
  const lockedCount = board?.lockedPlayerIds?.length ?? 0;
  const results = board?.lastRound?.entries ?? [];

  return (
    <GameSurface theme={theme} className={secondSenseStyles.stage}>
      <header className={secondSenseStyles.header}>
        <div>
          <span>BoardForge Original No. 07</span>
          <strong>Second Sense</strong>
        </div>
        <div className={secondSenseStyles.stageMark}>
          <small>{activeIds.length === 2 ? "Final" : "Stage"}</small>
          <b>{String(stage).padStart(2, "0")}</b>
        </div>
      </header>

      {view.status === "completed" ? (
        <section className={secondSenseStyles.final}>
          <div className={secondSenseStyles.finalHalo}>
            <i />
            <i />
            <span>◉</span>
          </div>
          <small>One pulse remains</small>
          <h1>
            {winnerId === view.selfPlayerId
              ? "Your timing was immaculate."
              : `${winner?.name ?? "The champion"} owns the moment.`}
          </h1>
          <div className={secondSenseStyles.winningTime}>
            <span>Final target</span>
            <strong>{formatTime(board?.lastRound?.targetMs ?? targetMs)}</strong>
            <small>seconds</small>
          </div>
          <div className={secondSenseStyles.finalResult}>
            {results.map((entry) => (
              <div className={entry.playerId === winnerId ? secondSenseStyles.champion : ""} key={entry.playerId}>
                <span>{view.players.find((player) => player.id === entry.playerId)?.name}</span>
                <b>{formatTime(entry.elapsedMs)}</b>
                <small>±{formatTime(entry.errorMs)}</small>
              </div>
            ))}
          </div>
          <p>The clock was invisible. The instinct was real.</p>
          <a href="/games/second-sense">
            Play another round <b>→</b>
          </a>
        </section>
      ) : board?.stageStatus === "reveal" ? (
        <section className={secondSenseStyles.reveal}>
          <div className={secondSenseStyles.revealLead}>
            <span>{board.lastRound?.finalTie ? "Perfect dead heat" : "The cut is in"}</span>
            <h1>{board.lastRound?.finalTie ? "Time refuses to choose." : "Closest instincts survive."}</h1>
            <p>
              {board.lastRound?.finalTie
                ? "The two finalists landed at the same distance. A fresh target will decide it."
                : `${board.lastRound?.qualifiedPlayerIds.length ?? 0} players move forward. Everyone else joins the gallery.`}
            </p>
          </div>
          <div className={secondSenseStyles.targetStamp}>
            <small>Target</small>
            <strong>{formatTime(board.lastRound?.targetMs ?? targetMs)}</strong>
            <span>seconds</span>
          </div>
          <div className={secondSenseStyles.leaderboard}>
            {results.map((entry) => {
              const qualified = board.lastRound?.qualifiedPlayerIds.includes(entry.playerId);
              return (
                <div className={qualified ? secondSenseStyles.qualified : secondSenseStyles.out} key={entry.playerId}>
                  <b>{String(entry.rank).padStart(2, "0")}</b>
                  <i>
                    {view.players
                      .find((player) => player.id === entry.playerId)
                      ?.name.slice(0, 1)
                      .toUpperCase()}
                  </i>
                  <span>
                    <strong>{view.players.find((player) => player.id === entry.playerId)?.name}</strong>
                    <small>{qualified ? "Through to the next pulse" : "Eliminated"}</small>
                  </span>
                  <em>
                    {formatTime(entry.elapsedMs)}
                    <small>
                      {entry.elapsedMs >= (board.lastRound?.targetMs ?? 0) ? "+" : "−"}
                      {formatTime(entry.errorMs)}
                    </small>
                  </em>
                </div>
              );
            })}
          </div>
          {isHost ? (
            <button type="button" className={secondSenseStyles.nextButton} disabled={pending} onClick={advanceRound}>
              <span>{board.lastRound?.finalTie ? "Run the tiebreaker" : "Reveal the next target"}</span>
              <b>→</b>
            </button>
          ) : (
            <div className={secondSenseStyles.hostWait}>
              Waiting for the host to reveal the next target <i />
              <i />
              <i />
            </div>
          )}
        </section>
      ) : (
        <section className={`${secondSenseStyles.arena} ${timing ? secondSenseStyles.isTiming : ""}`}>
          <div className={secondSenseStyles.roundMeta}>
            <span>{activeIds.length === 2 ? "Final pulse" : `${activeIds.length} players remain`}</span>
            <small>
              {lockedCount}/{activeIds.length} times locked
            </small>
          </div>
          {!isActive ? (
            <div className={secondSenseStyles.spectator}>
              <div>◌</div>
              <span>Gallery mode</span>
              <h1>
                You&apos;re out.
                <br />
                The tension isn&apos;t.
              </h1>
              <p>Watch the remaining players trust their internal clocks. Results appear when every time is locked.</p>
              <div className={secondSenseStyles.statusGrid}>
                {states
                  .filter((state) => activeIds.includes(state.playerId))
                  .map((state) => (
                    <span key={state.playerId}>
                      <i className={secondSenseStyles[state.status]} />
                      {state.name}
                      <small>{state.status}</small>
                    </span>
                  ))}
              </div>
            </div>
          ) : locked ? (
            <div className={secondSenseStyles.lockedView}>
              <span>Your instinct</span>
              <strong>{formatTime(board?.ownAttemptMs ?? 0)}</strong>
              <small>seconds</small>
              <div className={secondSenseStyles.lockSeal}>✓</div>
              <h2>Time locked.</h2>
              <p>Your exact result stays private until every surviving player has stopped.</p>
              <div className={secondSenseStyles.statusGrid}>
                {states
                  .filter((state) => activeIds.includes(state.playerId))
                  .map((state) => (
                    <span key={state.playerId}>
                      <i className={secondSenseStyles[state.status]} />
                      {state.name}
                      <small>{state.status}</small>
                    </span>
                  ))}
              </div>
            </div>
          ) : timing ? (
            <button
              type="button"
              aria-label="Stop your invisible clock"
              className={secondSenseStyles.stopZone}
              onClick={stopClock}
            >
              <div className={secondSenseStyles.motionField}>
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>Trust the feeling</span>
              <h1>NOW?</h1>
              <p>Touch anywhere to stop</p>
              <small>The clock is running. Nothing here marks time.</small>
            </button>
          ) : (
            <div className={secondSenseStyles.target}>
              <span>Your target</span>
              <div className={secondSenseStyles.targetNumber}>
                <small>0</small>
                <strong>{formatTime(targetMs)}</strong>
              </div>
              <p>seconds</p>
              <button type="button" disabled={pending} onClick={startClock}>
                <i>◉</i>
                <span>Touch to begin</span>
                <b>→</b>
              </button>
              <small>The number disappears the instant you touch.</small>
            </div>
          )}
        </section>
      )}
    </GameSurface>
  );
}
