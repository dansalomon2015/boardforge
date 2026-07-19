"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ComposedGameView, GameAction } from "@boardforge/shared";
import { GameSurface } from "../../../components/game-ui";
import { themeForRoom } from "./stage-shared";
import wordDuelStyles from "./word-duel.module.css";

export function WordDuelStage({
  view,
  pending,
  sendAction,
}: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [secretWord, setSecretWord] = useState("");
  const [solveGuess, setSolveGuess] = useState("");
  const [solveOpen, setSolveOpen] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const theme = themeForRoom(view.theme);
  const board = view.components.find((component) => component.kind === "word_duel")?.data as
    | {
        minLength?: number;
        maxLength?: number;
        hasSubmitted?: boolean;
        submittedPlayerIds?: string[];
        ownWord?: string;
        opponentId?: string;
        opponentName?: string;
        opponentMask?: string[];
        wordLength?: number | null;
        keyboard?: Array<{ letter: string; state: "available" | "correct" | "wrong" }>;
        misses?: string[];
        incorrectWordAttempts?: string[];
        lastGuess?: {
          actorId: string;
          kind: "letter" | "word";
          value?: string;
          correct: boolean;
          revealedCount: number;
        } | null;
      }
    | undefined;
  const lockAction = view.availableActions.find((action) => action.id === "lock_word");
  const letterAction = view.availableActions.find((action) => action.id === "guess_letter");
  const solveAction = view.availableActions.find((action) => action.id === "solve_word");
  const isMyTurn = view.activePlayerId === view.selfPlayerId;
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const winnerId = view.winner?.kind === "players" ? view.winner.ids[0] : undefined;
  const winner = view.players.find((player) => player.id === winnerId);
  const keyboard = board?.keyboard ?? [];
  const mask = board?.opponentMask ?? [];

  function perform(actionId: string, text: string) {
    sendAction({ type: "COMPOSED_ACTION", actionId, payload: { text } });
  }

  useEffect(() => {
    if (!board?.lastGuess?.correct || board.lastGuess.kind !== "letter") {
      setCelebration(false);
      return;
    }
    setCelebration(true);
    const timeout = window.setTimeout(() => setCelebration(false), 950);
    return () => window.clearTimeout(timeout);
  }, [board?.lastGuess?.actorId, board?.lastGuess?.correct, board?.lastGuess?.kind, board?.lastGuess?.value]);

  useEffect(() => {
    if (!isMyTurn || pending || solveOpen || !letterAction) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const letter = event.key.toUpperCase();
      if (!/^[A-Z]$/.test(letter) || keyboard.find((key) => key.letter === letter)?.state !== "available") return;
      perform(letterAction.id, letter);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isMyTurn, pending, solveOpen, letterAction, keyboard]);

  function lockWord(event: FormEvent) {
    event.preventDefault();
    if (lockAction && secretWord.length >= (board?.minLength ?? 4) && secretWord.length <= (board?.maxLength ?? 12))
      perform(lockAction.id, secretWord);
  }

  function submitSolve(event: FormEvent) {
    event.preventDefault();
    if (!solveAction || !solveGuess.trim()) return;
    perform(solveAction.id, solveGuess);
    setSolveGuess("");
    setSolveOpen(false);
  }

  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const playerReady = (playerId: string) => board?.submittedPlayerIds?.includes(playerId) ?? false;

  return (
    <GameSurface theme={theme} className={wordDuelStyles.stage}>
      <header className={wordDuelStyles.header}>
        <div>
          <span>BoardForge Original No. 06</span>
          <strong>WordDuel</strong>
        </div>
        <div className={wordDuelStyles.versus}>
          <span>{view.players[0]?.name ?? "Player 1"}</span>
          <b>VS</b>
          <span>{view.players[1]?.name ?? "Player 2"}</span>
        </div>
      </header>

      {view.status === "completed" ? (
        <section className={wordDuelStyles.final}>
          <div className={wordDuelStyles.finalBurst}>
            <i>W</i>
            <span />
            <span />
            <span />
          </div>
          <small>The word has been cracked</small>
          <h1>{winnerId === view.selfPlayerId ? "You win the duel." : `${winner?.name ?? "Your rival"} wins.`}</h1>
          <div className={wordDuelStyles.finalWords}>
            <div>
              <span>{board?.opponentName}&apos;s word</span>
              <strong>{mask.join("")}</strong>
            </div>
            <b>VS</b>
            <div>
              <span>Your word</span>
              <strong>{board?.ownWord}</strong>
            </div>
          </div>
          <p>
            {winnerId === view.selfPlayerId
              ? "Every key led you here. Beautifully played."
              : "A sharp duel deserves a rematch."}
          </p>
          <a href="/games/word-duel">
            Play another duel <b>→</b>
          </a>
        </section>
      ) : view.phase.id === "choose_words" ? (
        <section className={wordDuelStyles.vault}>
          <div className={wordDuelStyles.vaultIntro}>
            <span>Private word vault</span>
            <h1>Choose your secret.</h1>
            <p>
              Pick one English word with {board?.minLength} to {board?.maxLength} letters. No spaces, names, or
              abbreviations. Your rival will only see the number of tiles.
            </p>
            <div className={wordDuelStyles.readyPlayers}>
              {view.players.map((player) => (
                <div className={playerReady(player.id) ? wordDuelStyles.ready : ""} key={player.id}>
                  <i>{player.name.slice(0, 1).toUpperCase()}</i>
                  <span>
                    <strong>{player.name}</strong>
                    <small>{playerReady(player.id) ? "Word locked" : "Choosing a word…"}</small>
                  </span>
                  <b>{playerReady(player.id) ? "✓" : "•••"}</b>
                </div>
              ))}
            </div>
          </div>
          <div className={wordDuelStyles.vaultCard}>
            {board?.hasSubmitted ? (
              <>
                <div className={wordDuelStyles.lockedIcon}>✓</div>
                <span>Your word is safe</span>
                <h2>{board.ownWord?.replace(/./g, "•")}</h2>
                <p>Only the server knows what you chose. The duel begins when your rival locks theirs.</p>
                <small>Waiting inside the vault…</small>
              </>
            ) : (
              <form onSubmit={lockWord}>
                <span>Your secret word</span>
                <div className={wordDuelStyles.secretInput}>
                  <input
                    autoComplete="off"
                    maxLength={board?.maxLength ?? 12}
                    onChange={(event) => setSecretWord(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    placeholder="TYPE YOUR WORD"
                    type="password"
                    value={secretWord}
                  />
                  <b>
                    {secretWord.length}/{board?.maxLength}
                  </b>
                </div>
                <div className={wordDuelStyles.secretTiles}>
                  {Array.from({ length: Math.max(secretWord.length, board?.minLength ?? 4) }, (_, index) => (
                    <i className={secretWord[index] ? wordDuelStyles.filled : ""} key={index}>
                      {secretWord[index] ? "•" : ""}
                    </i>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={
                    pending ||
                    secretWord.length < (board?.minLength ?? 4) ||
                    secretWord.length > (board?.maxLength ?? 12)
                  }
                >
                  Lock my word <b>→</b>
                </button>
                <small>Your word never appears on your opponent&apos;s device.</small>
              </form>
            )}
          </div>
        </section>
      ) : (
        <section className={wordDuelStyles.arena}>
          {celebration ? (
            <div className={wordDuelStyles.celebration}>
              <span>✦</span>
              <strong>
                {board?.lastGuess?.revealedCount === 1
                  ? "Nice hit!"
                  : `${board?.lastGuess?.revealedCount} letters found!`}
              </strong>
              <i />
              <i />
              <i />
            </div>
          ) : null}
          <div className={wordDuelStyles.turnBar}>
            <div className={isMyTurn ? wordDuelStyles.yourTurn : ""}>
              <i>{activePlayer?.name.slice(0, 1).toUpperCase()}</i>
              <span>
                <small>{isMyTurn ? "Your move" : "Now playing"}</small>
                <strong>{isMyTurn ? "Choose a letter" : `${activePlayer?.name} is thinking`}</strong>
              </span>
            </div>
            <p>
              {board?.lastGuess
                ? board.lastGuess.kind === "letter"
                  ? board.lastGuess.correct
                    ? `${view.players.find((player) => player.id === board.lastGuess?.actorId)?.name} found ${board.lastGuess.value}.`
                    : `${board.lastGuess.value} was not in the word.`
                  : board.lastGuess.correct
                    ? "The full word was cracked."
                    : "The full-word attempt missed."
                : "The first key is waiting."}
            </p>
          </div>
          <div className={wordDuelStyles.wordArea}>
            <span>
              {board?.opponentName}&apos;s secret word · {board?.wordLength} letters
            </span>
            <div className={wordDuelStyles.wordTiles}>
              {mask.map((letter, index) => (
                <i className={letter !== "_" ? wordDuelStyles.revealed : ""} key={`${index}-${letter}`}>
                  {letter === "_" ? "" : letter}
                </i>
              ))}
            </div>
            <div className={wordDuelStyles.misses}>
              <small>Misses</small>
              {board?.misses?.length ? (
                board.misses.map((letter) => <b key={letter}>{letter}</b>)
              ) : (
                <span>None yet</span>
              )}
            </div>
          </div>
          <div className={wordDuelStyles.keyboardArea}>
            <div className={wordDuelStyles.keyboardHeading}>
              <div>
                <span>Your keyboard</span>
                <small>Every key can be played once</small>
              </div>
              <button type="button" disabled={!isMyTurn || pending || !solveAction} onClick={() => setSolveOpen(true)}>
                I know the word <b>↗</b>
              </button>
            </div>
            <div className={wordDuelStyles.keyboard}>
              {rows.map((row) => (
                <div key={row}>
                  {[...row].map((letter) => {
                    const key = keyboard.find((candidate) => candidate.letter === letter);
                    return (
                      <button
                        type="button"
                        aria-label={`Play letter ${letter}`}
                        className={
                          key?.state === "correct"
                            ? wordDuelStyles.correctKey
                            : key?.state === "wrong"
                              ? wordDuelStyles.wrongKey
                              : ""
                        }
                        disabled={!isMyTurn || pending || key?.state !== "available"}
                        key={letter}
                        onClick={() => letterAction && perform(letterAction.id, letter)}
                      >
                        <span>{letter}</span>
                        {key?.state === "correct" ? <i>✓</i> : key?.state === "wrong" ? <i>×</i> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p>
              {isMyTurn
                ? "Tap a key or use your physical keyboard."
                : `Your keyboard unlocks after ${activePlayer?.name ?? "your rival"} plays.`}
            </p>
          </div>
          {solveOpen ? (
            <div className={wordDuelStyles.solveBackdrop} role="presentation">
              <form aria-modal="true" className={wordDuelStyles.solveCard} onSubmit={submitSolve} role="dialog">
                <span>Risk the whole word</span>
                <h2>Think you&apos;ve cracked it?</h2>
                <p>A wrong answer ends your turn. No extra letters will be revealed.</p>
                <input
                  maxLength={board?.maxLength ?? 12}
                  minLength={board?.minLength ?? 4}
                  onChange={(event) => setSolveGuess(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  placeholder={`${board?.wordLength ?? "?"} LETTER WORD`}
                  value={solveGuess}
                />
                <div>
                  <button type="button" onClick={() => setSolveOpen(false)}>
                    Not yet
                  </button>
                  <button disabled={pending || solveGuess.length !== board?.wordLength} type="submit">
                    Solve it <b>→</b>
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </section>
      )}
    </GameSurface>
  );
}
