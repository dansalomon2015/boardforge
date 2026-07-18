"use client";

import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { GameSurface } from "../../../components/game-ui";
import { GameNightReturn } from "./game-night-return";
import { themeForRoom } from "./stage-shared";
import movieMimeStyles from "./movie-mime.module.css";

export function WordTrapStage({
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
  const selectAction = view.availableActions.find((action) => action.id === "select_clue_giver");
  const drawAction = view.availableActions.find((action) => action.id === "draw_word");
  const guessedAction = view.availableActions.find((action) => action.id === "word_guessed");
  const passAction = view.availableActions.find((action) => action.id === "word_passed");
  const forbiddenAction = view.availableActions.find((action) => action.id === "forbidden_called");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as
    | { prompt?: string; hint?: string }
    | undefined;
  const forbiddenWords =
    prompt?.hint
      ?.replace(/^DO NOT SAY:\s*/i, "")
      .split(" · ")
      .filter(Boolean) ?? [];
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
          <strong>WordTrap</strong>
        </div>
        <div className={movieMimeStyles.progress}>
          <small>Card</small>
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
          <span>The trap is closed</span>
          <div className={movieMimeStyles.trophy}>⚡</div>
          <h1>{winnerNames.join(" & ") || "Perfect tie"}</h1>
          <p>
            {winnerNames.length > 1
              ? "share the battle of words."
              : winnerNames.length === 1
                ? "wins the battle of words."
                : "The teams share the final point."}
          </p>
          <GameNightReturn gameNightCode={gameNightCode} />
        </section>
      ) : view.phase.id === "select_clue_giver" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{activeTeam?.name ?? "The active team"} is up</p>
          <h1>
            {isActiveCaptain
              ? "Choose your clue giver."
              : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}
          </h1>
          <span>
            {isActiveCaptain
              ? "Pick the player who will navigate the forbidden words on the next card."
              : "The next clue giver will step into the trap in a moment."}
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
                    <small>Ready to play</small>
                    <strong>{player?.name ?? "Player"}</strong>
                  </span>
                  <b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b>
                </button>
              );
            })}
          </div>
          {!isActiveCaptain ? <em>Only the active team captain can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{isActivePlayer ? "You are entering the trap" : "Next clue giver"}</p>
          <h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>
            {isActivePlayer
              ? "Only you can see the card. Keep the screen close and choose every clue carefully."
              : "Look away while the clue giver studies the secret card."}
          </span>
          <div className={movieMimeStyles.secretCard}>
            <small>Secret word</small>
            <strong>⚡</strong>
            <i>?</i>
          </div>
          {drawAction ? (
            <button type="button" disabled={pending} onClick={() => perform(drawAction.id)}>
              <span>{pending ? "Opening the trap…" : "Reveal my card"}</span>
              <b>↗</b>
            </button>
          ) : (
            <em>Waiting for {activePlayer?.name ?? "the clue giver"}…</em>
          )}
        </section>
      ) : (
        <section className={movieMimeStyles.mimeStage}>
          <div className={movieMimeStyles.mimeHeading}>
            <div>
              <p>Choose every word carefully</p>
              <h1>{isActivePlayer ? "Make them guess it." : `${activePlayer?.name ?? "The clue giver"} is live.`}</h1>
            </div>
            <div className={movieMimeStyles.timer}>
              <i />
              <span>60</span>
              <small>seconds</small>
            </div>
          </div>
          {isActivePlayer && prompt?.prompt ? (
            <div className={`${movieMimeStyles.revealedCard} ${movieMimeStyles.trapCard}`}>
              <div>
                <span>Your target word</span>
                <i>⚡</i>
              </div>
              <h2>{prompt.prompt}</h2>
              <p className={movieMimeStyles.trapLabel}>Do not say</p>
              <div className={movieMimeStyles.forbiddenList}>
                {forbiddenWords.map((word) => (
                  <b key={word}>{word}</b>
                ))}
              </div>
              <small>No rhymes · No translations · No spelling · Do not show the screen</small>
            </div>
          ) : (
            <div className={movieMimeStyles.audienceCard}>
              <strong>?</strong>
              <div>
                <span>The card stays private</span>
                <p>
                  {forbiddenAction
                    ? "Listen closely. Buzz the moment the clue giver says a forbidden word."
                    : "Call out guesses before the timer runs out."}
                </p>
              </div>
            </div>
          )}
          <div className={movieMimeStyles.mimeActions}>
            {guessedAction ? (
              <button
                type="button"
                className={movieMimeStyles.success}
                disabled={pending}
                onClick={() => perform(guessedAction.id)}
              >
                ✓ Word guessed
              </button>
            ) : null}
            {passAction ? (
              <button
                type="button"
                className={movieMimeStyles.pass}
                disabled={pending}
                onClick={() => perform(passAction.id)}
              >
                Pass card
              </button>
            ) : null}
            {forbiddenAction ? (
              <button
                type="button"
                className={movieMimeStyles.buzzerAction}
                disabled={pending}
                onClick={() => perform(forbiddenAction.id)}
              >
                ⚡ Forbidden word!
              </button>
            ) : null}
            {!guessedAction && !passAction && !forbiddenAction ? <span>Watch, listen, and help your team.</span> : null}
          </div>
        </section>
      )}
    </GameSurface>
  );
}
