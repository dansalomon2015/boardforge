"use client";

import { useState } from "react";
import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { GameSurface } from "../../../components/game-ui";
import { themeForRoom } from "./stage-shared";
import storyChainStyles from "./story-chain.module.css";

export function StoryChainStage({
  view,
  pending,
  sendAction,
}: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [contribution, setContribution] = useState("");
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const drawAction = view.availableActions.find((action) => action.id === "draw_twist");
  const writeAction = view.availableActions.find((action) => action.id === "continue_story");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as
    | { prompt?: string; hint?: string }
    | undefined;
  const story = view.components.find((component) => component.kind === "story")?.data as
    | {
        opening?: string;
        entries?: Array<{ sequence: number; round: number; actorId: string; actorName: string; text: string }>;
      }
    | undefined;
  const entries = story?.entries ?? [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  function submitContribution() {
    if (!writeAction || !contribution.trim()) return;
    perform(writeAction.id, { text: contribution.trim() });
    setContribution("");
  }

  return (
    <GameSurface theme={theme} className={storyChainStyles.stage}>
      <header className={storyChainStyles.header}>
        <div>
          <span>BoardForge Original No. 05</span>
          <strong>StoryChain</strong>
        </div>
        <div className={storyChainStyles.chapter}>
          <small>Chapter</small>
          <b>{Math.min(view.round, view.totalRounds)}</b>
          <i>/</i>
          <span>{view.totalRounds}</span>
        </div>
      </header>

      {view.status === "completed" ? (
        <section className={storyChainStyles.final}>
          <div className={storyChainStyles.finalHeading}>
            <span>Our one-of-a-kind story</span>
            <h1>
              {(view.components.find((component) => component.kind === "header")?.data.title as string) ??
                "The story we made"}
            </h1>
            <p>Written tonight by {view.players.map((player) => player.name).join(", ")}.</p>
          </div>
          <article className={storyChainStyles.manuscript}>
            <p className={storyChainStyles.opening}>{story?.opening}</p>
            {entries.map((entry) => (
              <p key={entry.sequence}>
                {entry.text}
                <small>— {entry.actorName}</small>
              </p>
            ))}
            <div className={storyChainStyles.theEnd}>The End</div>
          </article>
          <div className={storyChainStyles.finalActions}>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(
                  [story?.opening, ...entries.map((entry) => entry.text)].filter(Boolean).join("\n\n"),
                )
              }
            >
              Copy our story
            </button>
            <a href="/">
              Choose another game <b>→</b>
            </a>
          </div>
        </section>
      ) : (
        <div className={storyChainStyles.workspace}>
          <section className={storyChainStyles.storyPane}>
            <div className={storyChainStyles.storyMeta}>
              <span>
                <i /> Story in progress
              </span>
              <b>
                {entries.length + 1} {entries.length ? "pages" : "page"}
              </b>
            </div>
            <article className={storyChainStyles.paper}>
              <p className={storyChainStyles.opening}>{story?.opening}</p>
              {entries.map((entry, index) => (
                <div className={storyChainStyles.entry} key={entry.sequence}>
                  <span>{String(index + 2).padStart(2, "0")}</span>
                  <p>{entry.text}</p>
                  <small>{entry.actorName}</small>
                </div>
              ))}
              <div className={storyChainStyles.cursorLine}>
                <i /> The next line belongs to {activePlayer?.name ?? "our next writer"}.
              </div>
            </article>
          </section>

          <aside className={storyChainStyles.writerPane}>
            <div className={storyChainStyles.writer}>
              <span>{activePlayer?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
              <div>
                <small>Now writing</small>
                <strong>{activePlayer?.name ?? "Player"}</strong>
              </div>
              {isActivePlayer ? <b>Your turn</b> : null}
            </div>
            {view.phase.id === "draw_twist" ? (
              <div className={storyChainStyles.sealedTwist}>
                <span>Secret twist</span>
                <div>✦</div>
                <h2>{isActivePlayer ? "Open your prompt." : "A new twist is being drawn."}</h2>
                <p>
                  {isActivePlayer
                    ? "Keep it private. Your sentence must weave this word naturally into the story."
                    : `Only ${activePlayer?.name ?? "the writer"} can see what comes next.`}
                </p>
                {drawAction ? (
                  <button type="button" disabled={pending} onClick={() => perform(drawAction.id)}>
                    {pending ? "Opening…" : "Reveal my twist"} <b>↗</b>
                  </button>
                ) : (
                  <small>Waiting for the writer…</small>
                )}
              </div>
            ) : isActivePlayer && prompt?.prompt ? (
              <div className={storyChainStyles.writeCard}>
                <small>Your sentence must include</small>
                <h2>{prompt.prompt}</h2>
                <p>{prompt.hint}</p>
                <label htmlFor="story-contribution">Continue in one or two sentences</label>
                <textarea
                  id="story-contribution"
                  maxLength={320}
                  onChange={(event) => setContribution(event.target.value)}
                  placeholder="And then…"
                  rows={6}
                  value={contribution}
                />
                <div className={storyChainStyles.writeFooter}>
                  <span>{contribution.length}/320</span>
                  <button type="button" disabled={pending || !contribution.trim()} onClick={submitContribution}>
                    {pending ? "Adding…" : "Add to the story"} <b>→</b>
                  </button>
                </div>
              </div>
            ) : (
              <div className={storyChainStyles.readerCard}>
                <span>Read along</span>
                <h2>{activePlayer?.name ?? "The writer"} is choosing the next words.</h2>
                <p>You will see the new chapter the moment it is added. Their secret twist stays hidden until then.</p>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </GameSurface>
  );
}
