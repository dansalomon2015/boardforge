"use client";

import { useState } from "react";
import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { DrawingCanvas, GameSurface, TextAnswer } from "../../../components/game-ui";
import type { SketchStroke } from "../../../components/game-ui";
import { GameNightReturn } from "./game-night-return";
import { themeForRoom } from "./stage-shared";
import movieMimeStyles from "./movie-mime.module.css";

export function DrawBattleStage({
  view,
  pending,
  gameNightCode,
  sendAction,
}: {
  view: ComposedGameView;
  pending: boolean;
  gameNightCode: string | null;
  sendAction: (action: GameAction) => void;
}) {
  const [guess, setGuess] = useState("");
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
  const activeTeam = view.teams.find((team) => team.id === activeTeamId);
  const activeCaptainId = activeTeamId ? view.captainByTeam[activeTeamId] : undefined;
  const isActiveCaptain = view.selfPlayerId === activeCaptainId;
  const selectAction = view.availableActions.find((action) => action.id === "select_artist");
  const drawAction = view.availableActions.find((action) => action.id === "draw_prompt");
  const sketchAction = view.availableActions.find((action) => action.id === "draw_stroke");
  const guessAction = view.availableActions.find((action) => action.id === "submit_guess");
  const passAction = view.availableActions.find((action) => action.id === "pass_prompt");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as
    | { prompt?: string; hint?: string }
    | undefined;
  const canvas = view.components.find((component) => component.kind === "drawing")?.data as
    | { label?: string; strokes?: SketchStroke[] }
    | undefined;
  const strokes = canvas?.strokes ?? [];
  const winnerNames =
    view.winner?.kind === "teams"
      ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean)
      : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  function updateCanvas(next: SketchStroke[]) {
    if (!sketchAction) return;
    if (next.length === 0 && strokes.length > 0) perform(sketchAction.id, { clear: true });
    else if (next.length > strokes.length) {
      const stroke = next.at(-1);
      if (stroke) perform(sketchAction.id, { stroke });
    }
  }

  return (
    <GameSurface theme={theme} className={`${movieMimeStyles.stage} ${movieMimeStyles.drawBattleStage}`}>
      <header className={movieMimeStyles.header}>
        <div>
          <span>BoardForge Original</span>
          <strong>DrawBattle</strong>
        </div>
        <div className={movieMimeStyles.progress}>
          <small>Canvas</small>
          <b>{Math.min(view.round, view.totalRounds)}</b>
          <i>/</i>
          <span>{view.totalRounds}</span>
        </div>
      </header>
      <div className={movieMimeStyles.scoreboard}>
        {view.teams.map((team) => (
          <div className={team.id === activeTeamId ? movieMimeStyles.activeTeam : ""} key={team.id}>
            <i style={{ background: team.color }} />
            <span>{team.name}</span>
            <strong>{view.scores.teams[team.id] ?? 0}</strong>
          </div>
        ))}
      </div>

      {view.status === "completed" ? (
        <section className={movieMimeStyles.final}>
          <span>The gallery is complete</span>
          <div className={movieMimeStyles.trophy}>✎</div>
          <h1>{winnerNames.join(" & ") || "Perfect tie"}</h1>
          <p>
            {winnerNames.length > 1
              ? "share tonight’s drawing battle."
              : winnerNames.length === 1
                ? "wins tonight’s drawing battle."
                : "The teams share the final frame."}
          </p>
          <GameNightReturn gameNightCode={gameNightCode} />
        </section>
      ) : view.phase.id === "select_artist" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{activeTeam?.name ?? "The active team"} owns the next canvas</p>
          <h1>
            {isActiveCaptain
              ? "Choose your artist."
              : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}
          </h1>
          <span>
            {isActiveCaptain
              ? "Pick the player who will turn the next secret idea into art."
              : "The next artist will take over the canvas in a moment."}
          </span>
          <div className={movieMimeStyles.castGrid}>
            {activeTeam?.playerIds.map((id) => {
              const player = view.players.find((candidate) => candidate.id === id);
              return (
                <button
                  type="button"
                  disabled={pending || !selectAction}
                  key={id}
                  onClick={() => selectAction && perform(selectAction.id, { targetPlayerId: id })}
                >
                  <i>{player?.name.slice(0, 1).toUpperCase() ?? "?"}</i>
                  <span>
                    <small>Ready to draw</small>
                    <strong>{player?.name ?? "Player"}</strong>
                  </span>
                  <b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b>
                </button>
              );
            })}
          </div>
          {!isActiveCaptain ? <em>Only the active team captain can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw_prompt" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{isActivePlayer ? "Your canvas is ready" : "Next artist"}</p>
          <h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>
            {isActivePlayer
              ? "Only you can see the idea. Tilt the screen away and get ready to draw."
              : "Look away while the artist discovers the secret idea."}
          </span>
          <div className={movieMimeStyles.secretCard}>
            <small>Secret idea</small>
            <strong>✎</strong>
            <i>?</i>
          </div>
          {drawAction ? (
            <button type="button" disabled={pending} onClick={() => perform(drawAction.id)}>
              <span>{pending ? "Opening the sketchbook…" : "Reveal my idea"}</span>
              <b>↗</b>
            </button>
          ) : (
            <em>Waiting for {activePlayer?.name ?? "the artist"}…</em>
          )}
        </section>
      ) : (
        <section className={movieMimeStyles.drawingRoom}>
          <div className={movieMimeStyles.mimeHeading}>
            <div>
              <p>Every line is live</p>
              <h1>{isActivePlayer ? "Draw the secret." : `What is ${activePlayer?.name ?? "the artist"} drawing?`}</h1>
            </div>
            <div className={movieMimeStyles.timer}>
              <i />
              <span>75</span>
              <small>seconds</small>
            </div>
          </div>
          <div className={movieMimeStyles.drawingGrid}>
            <div className={movieMimeStyles.liveCanvas}>
              <DrawingCanvas
                theme={theme}
                strokes={strokes}
                onChange={updateCanvas}
                label={canvas?.label ?? "Live canvas"}
                disabled={pending || !sketchAction}
              />
              <div className={movieMimeStyles.canvasStatus}>
                <span>
                  <i /> Everyone sees every line
                </span>
                <b>
                  {strokes.length} stroke{strokes.length === 1 ? "" : "s"}
                </b>
              </div>
            </div>
            <aside className={movieMimeStyles.drawingSidebar}>
              {isActivePlayer && prompt?.prompt ? (
                <div className={movieMimeStyles.artistPrompt}>
                  <small>Your secret idea</small>
                  <h2>{prompt.prompt}</h2>
                  <span>{prompt.hint}</span>
                  <p>Draw only · No letters · No numbers · No gestures</p>
                </div>
              ) : (
                <div className={movieMimeStyles.guessPanel}>
                  <small>Shout it out</small>
                  <h2>Name the picture.</h2>
                  <p>Be the first to name it and win a point for your team.</p>
                  {guessAction ? (
                    <TextAnswer
                      theme={theme}
                      label="Your guess"
                      placeholder="What do you see?"
                      value={guess}
                      onChange={setGuess}
                      submitLabel="That’s it"
                      disabled={pending}
                      onSubmit={() => {
                        perform(guessAction.id, { text: guess });
                        setGuess("");
                      }}
                    />
                  ) : (
                    <span className={movieMimeStyles.waitingGuess}>Artists leave the guessing to everyone else.</span>
                  )}
                </div>
              )}
              {passAction ? (
                <button
                  type="button"
                  className={movieMimeStyles.pass}
                  disabled={pending}
                  onClick={() => perform(passAction.id)}
                >
                  Try another idea
                </button>
              ) : null}
            </aside>
          </div>
        </section>
      )}
    </GameSurface>
  );
}
