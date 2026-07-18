"use client";

import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { GameSurface } from "../../../components/game-ui";
import { GameNightReturn } from "./game-night-return";
import { themeForRoom } from "./stage-shared";
import movieMimeStyles from "./movie-mime.module.css";

export function MovieMimeStage({
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
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
  const activeTeam = view.teams.find((team) => team.id === activeTeamId);
  const activeCaptainId = activeTeamId ? view.captainByTeam[activeTeamId] : undefined;
  const isActiveCaptain = view.selfPlayerId === activeCaptainId;
  const selectMimerAction = view.availableActions.find((action) => action.id === "select_mimer");
  const drawAction = view.availableActions.find((action) => action.id === "draw_film");
  const successAction = view.availableActions.find((action) => action.id === "film_guessed");
  const passAction = view.availableActions.find((action) => action.id === "film_passed");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as
    | {
        prompt?: string;
        hint?: string;
        icon?: string;
      }
    | undefined;
  const winnerNames =
    view.winner?.kind === "teams"
      ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean)
      : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  return (
    <GameSurface theme={theme} className={movieMimeStyles.stage}>
      <header className={movieMimeStyles.header}>
        <div>
          <span>BoardForge Original</span>
          <strong>CineMimes</strong>
        </div>
        <div className={movieMimeStyles.progress}>
          <small>Movie</small>
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
          <span>That is a wrap</span>
          <div className={movieMimeStyles.trophy}>✦</div>
          <h1>{winnerNames.join(" & ") || "Perfect tie"}</h1>
          <p>
            {winnerNames.length > 1
              ? "share tonight’s box office."
              : winnerNames.length === 1
                ? "wins tonight’s box office."
                : "The teams share top billing."}
          </p>
          <GameNightReturn gameNightCode={gameNightCode} />
        </section>
      ) : view.phase.id === "select_mimer" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{activeTeam?.name ?? "The active team"} is up</p>
          <h1>
            {isActiveCaptain
              ? "Choose your performer."
              : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}
          </h1>
          <span>
            {isActiveCaptain
              ? "You are this team’s captain. Choose who will act out the next movie."
              : "The next performer will step into the spotlight in a moment."}
          </span>
          <div className={movieMimeStyles.castGrid}>
            {activeTeam?.playerIds.map((id, index) => {
              const player = view.players.find((candidate) => candidate.id === id);
              return (
                <button
                  type="button"
                  disabled={pending || !selectMimerAction}
                  key={id}
                  onClick={() => selectMimerAction && perform(selectMimerAction.id, { targetPlayerId: id })}
                >
                  <i>{player?.name.slice(0, 1).toUpperCase() ?? "?"}</i>
                  <span>
                    <small>{index === 0 ? "In the cast" : "Ready to play"}</small>
                    <strong>{player?.name ?? "Player"}</strong>
                  </span>
                  <b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b>
                </button>
              );
            })}
          </div>
          {!isActiveCaptain ? <em>Only the captain of {activeTeam?.name ?? "the active team"} can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{isActivePlayer ? "You are in the spotlight" : "Next performer"}</p>
          <h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>
            {isActivePlayer
              ? "Only you can see the title. Keep the screen close and get ready to perform."
              : "Look away while the performer studies the secret movie."}
          </span>
          <div className={movieMimeStyles.secretCard}>
            <small>Secret movie</small>
            <strong>?</strong>
            <i>🎬</i>
          </div>
          {drawAction ? (
            <button type="button" disabled={pending} onClick={() => perform(drawAction.id)}>
              <span>{pending ? "Opening the reel…" : "Reveal my movie"}</span>
              <b>↗</b>
            </button>
          ) : (
            <em>Waiting for {activePlayer?.name ?? "the performer"}…</em>
          )}
        </section>
      ) : (
        <section className={movieMimeStyles.mimeStage}>
          <div className={movieMimeStyles.mimeHeading}>
            <div>
              <p>Lights, camera, mime!</p>
              <h1>
                {isActivePlayer ? "Make them guess it." : `${activePlayer?.name ?? "The performer"} is on stage.`}
              </h1>
            </div>
            <div className={movieMimeStyles.timer}>
              <i />
              <span>60</span>
              <small>seconds</small>
            </div>
          </div>

          {isActivePlayer && prompt?.prompt ? (
            <div className={movieMimeStyles.revealedCard}>
              <div>
                <span>Your movie</span>
                <i>{prompt.icon ?? "🎭"}</i>
              </div>
              <h2>{prompt.prompt}</h2>
              {prompt.hint ? <p>{prompt.hint}</p> : null}
              <small>No speaking · No writing · Do not show the screen</small>
            </div>
          ) : (
            <div className={movieMimeStyles.audienceCard}>
              <strong>?</strong>
              <div>
                <span>The title stays private</span>
                <p>Watch the performance and call out your guesses.</p>
              </div>
            </div>
          )}

          <div className={movieMimeStyles.mimeActions}>
            {successAction ? (
              <button
                type="button"
                className={movieMimeStyles.success}
                disabled={pending}
                onClick={() => perform(successAction.id)}
              >
                ✓ Movie guessed
              </button>
            ) : null}
            {passAction ? (
              <button
                type="button"
                className={movieMimeStyles.pass}
                disabled={pending}
                onClick={() => perform(passAction.id)}
              >
                Pass movie
              </button>
            ) : null}
            {!successAction && !passAction ? <span>Only the performer can confirm the result.</span> : null}
          </div>
        </section>
      )}
    </GameSurface>
  );
}
