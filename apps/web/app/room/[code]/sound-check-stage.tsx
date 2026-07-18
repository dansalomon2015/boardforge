"use client";

import { useState } from "react";
import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { GameSurface, TextAnswer } from "../../../components/game-ui";
import { GameNightReturn } from "./game-night-return";
import { themeForRoom } from "./stage-shared";
import movieMimeStyles from "./movie-mime.module.css";
import soundCheckStyles from "./sound-check.module.css";

export function SoundCheckStage({
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
  const selectAction = view.availableActions.find((action) => action.id === "select_performer");
  const drawAction = view.availableActions.find((action) => action.id === "draw_sound");
  const guessAction = view.availableActions.find((action) => action.id === "submit_guess");
  const passAction = view.availableActions.find((action) => action.id === "pass_sound");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as
    | { prompt?: string; hint?: string }
    | undefined;
  const winnerNames =
    view.winner?.kind === "teams"
      ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean)
      : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  return (
    <GameSurface theme={theme} className={`${movieMimeStyles.stage} ${soundCheckStyles.stage}`}>
      <header className={movieMimeStyles.header}>
        <div>
          <span>BoardForge Original</span>
          <strong>SoundCheck</strong>
        </div>
        <div className={movieMimeStyles.progress}>
          <small>Track</small>
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
          <span>The final track has ended</span>
          <div className={`${movieMimeStyles.trophy} ${soundCheckStyles.recordTrophy}`}>◖</div>
          <h1>{winnerNames.join(" & ") || "Perfect tie"}</h1>
          <p>
            {winnerNames.length > 1
              ? "share tonight’s SoundCheck session."
              : winnerNames.length === 1
                ? "wins tonight’s SoundCheck session."
                : "The teams share the final mix."}
          </p>
          <GameNightReturn gameNightCode={gameNightCode} />
        </section>
      ) : view.phase.id === "select_performer" ? (
        <section className={`${movieMimeStyles.castingStage} ${soundCheckStyles.casting}`}>
          <div className={soundCheckStyles.equalizer} aria-hidden="true">
            {Array.from({ length: 17 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <p>{activeTeam?.name ?? "The active team"} owns the next track</p>
          <h1>
            {isActiveCaptain
              ? "Choose your performer."
              : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}
          </h1>
          <span>
            {isActiveCaptain
              ? "Pick the player brave enough to take on the next mystery sound."
              : "The next voice will step into the spotlight in a moment."}
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
                    <small>Ready on vocals</small>
                    <strong>{player?.name ?? "Player"}</strong>
                  </span>
                  <b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b>
                </button>
              );
            })}
          </div>
          {!isActiveCaptain ? <em>Only the active team captain can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw_sound" ? (
        <section className={`${movieMimeStyles.drawStage} ${soundCheckStyles.reveal}`}>
          <div className={soundCheckStyles.record}>
            <i />
            <i />
            <strong>BF</strong>
          </div>
          <p>{isActivePlayer ? "Your mystery track is ready" : "Next performer"}</p>
          <h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>
            {isActivePlayer
              ? "Only you can see the sound. Keep the screen close, then give it everything."
              : "Look away while the performer discovers the secret sound."}
          </span>
          <div className={`${movieMimeStyles.secretCard} ${soundCheckStyles.secretSleeve}`}>
            <small>Secret sound</small>
            <strong>◖</strong>
            <i>?</i>
          </div>
          {drawAction ? (
            <button type="button" disabled={pending} onClick={() => perform(drawAction.id)}>
              <span>{pending ? "Dropping the needle…" : "Reveal my sound"}</span>
              <b>↗</b>
            </button>
          ) : (
            <em>Waiting for {activePlayer?.name ?? "the performer"}…</em>
          )}
        </section>
      ) : (
        <section className={soundCheckStyles.liveRoom}>
          <div className={movieMimeStyles.mimeHeading}>
            <div>
              <p>The studio is live</p>
              <h1>
                {isActivePlayer ? "Make the sound." : `What is ${activePlayer?.name ?? "the performer"} imitating?`}
              </h1>
            </div>
            <div className={movieMimeStyles.timer}>
              <i />
              <span>60</span>
              <small>seconds</small>
            </div>
          </div>
          <div className={soundCheckStyles.performanceGrid}>
            <div className={soundCheckStyles.performanceStage}>
              <div className={soundCheckStyles.onAir}>
                <i /> On air
              </div>
              <div className={soundCheckStyles.waveform} aria-hidden="true">
                {Array.from({ length: 31 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <div className={soundCheckStyles.performer}>
                <span>{activePlayer?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
                <div>
                  <small>Now performing</small>
                  <strong>{activePlayer?.name ?? "Player"}</strong>
                </div>
              </div>
              <p>Voice only · No words · No gestures · No props</p>
            </div>
            <aside className={soundCheckStyles.controlPanel}>
              {isActivePlayer && prompt?.prompt ? (
                <div className={soundCheckStyles.performerPrompt}>
                  <small>Your secret sound</small>
                  <h2>{prompt.prompt}</h2>
                  <span>{prompt.hint}</span>
                  <p>Recreate it using only your voice. Do not say any part of the answer.</p>
                </div>
              ) : (
                <div className={soundCheckStyles.guessPanel}>
                  <small>Shout it out</small>
                  <h2>Name that sound.</h2>
                  <p>Be the first to name it and win a point for your team.</p>
                  {guessAction ? (
                    <TextAnswer
                      theme={theme}
                      label="Your guess"
                      placeholder="What do you hear?"
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
                    <span className={soundCheckStyles.waiting}>Performers leave the guessing to everyone else.</span>
                  )}
                </div>
              )}
              {passAction ? (
                <button
                  type="button"
                  className={soundCheckStyles.pass}
                  disabled={pending}
                  onClick={() => perform(passAction.id)}
                >
                  Pass this sound
                </button>
              ) : null}
            </aside>
          </div>
        </section>
      )}
    </GameSurface>
  );
}
