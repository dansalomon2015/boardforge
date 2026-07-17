"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { gameThemeStyle, gameThemes, type GameThemeName } from "../../../components/game-ui";
import baseStyles from "../movie-mime/page.module.css";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const themeIds = [
  "minimal",
  "arcade",
  "cyberpunk",
  "candy",
  "noir",
  "cosmic",
] as const satisfies readonly GameThemeName[];
const difficulties = [
  { id: "easy", name: "Quick Words", range: "4–6", note: "Fast and friendly" },
  { id: "classic", name: "Classic Duel", range: "5–9", note: "The perfect balance" },
  { id: "expert", name: "Long Game", range: "7–12", note: "For fearless wordsmiths" },
] as const;
const previewRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export default function WordDuelSetupPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<GameThemeName>("minimal");
  const [difficulty, setDifficulty] = useState<(typeof difficulties)[number]["id"]>("classic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeTheme = gameThemes[theme];
  const activeDifficulty = difficulties.find((item) => item.id === difficulty)!;
  const previewStyle = useMemo(() => gameThemeStyle(theme) as CSSProperties, [theme]);

  async function prepareGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const blueprintResponse = await fetch(`${apiUrl}/api/word-duel/blueprints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ themeId: theme, difficulty }),
      });
      if (!blueprintResponse.ok) throw new Error("Tonight's duel could not be prepared.");
      const prepared = (await blueprintResponse.json()) as {
        blueprintId: string;
        releaseStatus: "release_ready" | "needs_review";
      };
      if (prepared.releaseStatus !== "release_ready")
        throw new Error("This duel needs another rules check. Try again.");
      const roomResponse = await fetch(`${apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blueprintId: prepared.blueprintId }),
      });
      if (!roomResponse.ok) throw new Error("The duel room could not be opened.");
      const room = (await roomResponse.json()) as { code: string };
      router.push(`/room/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something unexpected happened.");
      setBusy(false);
    }
  }

  return (
    <main className={`${baseStyles.page} ${styles.page}`}>
      <nav className={baseStyles.nav}>
        <Link className={baseStyles.brand} href="/">
          <span>BF</span>
          <b>BoardForge</b>
        </Link>
        <Link className={baseStyles.back} href="/">
          ← Back to the collection
        </Link>
      </nav>
      <form className={baseStyles.layout} onSubmit={prepareGame}>
        <section className={baseStyles.configuration}>
          <div className={baseStyles.titleBlock}>
            <p>BoardForge Original No. 06</p>
            <h1>
              Pick a word.
              <br />
              <em>Start a duel.</em>
            </h1>
            <span>
              Two players lock in one secret word each. Every letter is a move. Every correct guess brings the answer
              closer.
            </span>
          </div>

          <fieldset className={baseStyles.fieldset}>
            <legend>
              <b>01</b>
              <span>Choose the word range</span>
              <small>Both players follow the same limit</small>
            </legend>
            <div className={styles.difficultyGrid}>
              {difficulties.map((item) => (
                <button
                  className={difficulty === item.id ? styles.selected : ""}
                  key={item.id}
                  onClick={() => setDifficulty(item.id)}
                  type="button"
                >
                  <span>{item.name}</span>
                  <strong>{item.range}</strong>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={baseStyles.fieldset}>
            <legend>
              <b>02</b>
              <span>Choose the arena</span>
              <small>Set the tone of the showdown</small>
            </legend>
            <div className={baseStyles.themeGrid}>
              {themeIds.map((themeId) => {
                const item = gameThemes[themeId];
                return (
                  <button
                    className={theme === themeId ? baseStyles.selectedTheme : ""}
                    key={themeId}
                    onClick={() => setTheme(themeId)}
                    style={
                      {
                        "--swatch-a": item.colors.primary,
                        "--swatch-b": item.colors.secondary,
                        "--swatch-c": item.colors.accent,
                      } as CSSProperties
                    }
                    type="button"
                  >
                    <span>
                      <i />
                      <i />
                      <i />
                    </span>
                    <b>{item.emoji}</b>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <section className={styles.rules}>
            <p>How it plays</p>
            <div>
              <span>01</span>
              <strong>Lock a secret word</strong>
              <small>Your opponent only sees its length.</small>
            </div>
            <div>
              <span>02</span>
              <strong>Play one letter per turn</strong>
              <small>Used keys stay disabled on your keyboard.</small>
            </div>
            <div>
              <span>03</span>
              <strong>Crack the whole word</strong>
              <small>Reveal every letter or risk a full-word guess.</small>
            </div>
          </section>
          {error ? (
            <p className={baseStyles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button className={baseStyles.submit} disabled={busy} type="submit">
            <span>{busy ? "Setting the keys…" : "Open the WordDuel room"}</span>
            <b>{busy ? "•••" : "↗"}</b>
          </button>
          <p className={baseStyles.submitNote}>
            Made for exactly two players. No word is ever shown to the other screen.
          </p>
        </section>

        <aside className={baseStyles.previewColumn}>
          <div className={baseStyles.sticky}>
            <p className={baseStyles.previewLabel}>Tonight&apos;s arena</p>
            <div className={styles.preview} style={previewStyle}>
              <div className={styles.previewTop}>
                <span>BoardForge Original</span>
                <b>No. 06</b>
              </div>
              <div className={styles.previewTitle}>
                <small>Head-to-head word game</small>
                <h2>
                  Word
                  <br />
                  <em>Duel</em>
                </h2>
              </div>
              <div className={styles.previewWord}>
                {["_", "A", "_", "_", "E", "_"].map((letter, index) => (
                  <i className={letter !== "_" ? styles.found : ""} key={index}>
                    {letter}
                  </i>
                ))}
              </div>
              <div className={styles.previewKeyboard}>
                {previewRows.map((row) => (
                  <div key={row}>
                    {[...row].map((letter) => (
                      <i
                        className={
                          letter === "A" || letter === "E"
                            ? styles.hit
                            : letter === "R" || letter === "T"
                              ? styles.miss
                              : ""
                        }
                        key={letter}
                      >
                        {letter}
                      </i>
                    ))}
                  </div>
                ))}
              </div>
              <div className={styles.previewFooter}>
                <span>
                  <b>{activeDifficulty.range}</b> letters
                </span>
                <span>
                  <b>2</b> players
                </span>
                <span>
                  <b>1</b> winner
                </span>
              </div>
            </div>
            <div className={baseStyles.previewDetails}>
              <div>
                <span>Word range</span>
                <b>{activeDifficulty.name}</b>
              </div>
              <div>
                <span>Arena</span>
                <b>{activeTheme.name}</b>
              </div>
              <div>
                <span>Best with</span>
                <b>Your sharpest rival</b>
              </div>
            </div>
          </div>
        </aside>
      </form>
      {busy ? (
        <div className={`${baseStyles.loading} ${styles.loading}`} aria-live="polite">
          <div className={styles.loadingKeys}>
            <i>W</i>
            <i>O</i>
            <i>W</i>
          </div>
          <p>Your arena is almost ready…</p>
          <small>Testing every key · locking the vault · opening the room</small>
        </div>
      ) : null}
    </main>
  );
}
