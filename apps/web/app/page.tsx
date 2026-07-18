"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (joinCode.trim().length !== 6) return;
    router.push(`/room/${joinCode.trim().toUpperCase()}`);
  }

  const joinInput = (className?: string) => (
    <input
      aria-label="Six-character room code"
      className={className}
      inputMode="text"
      maxLength={6}
      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
      placeholder="ROOM CODE"
      value={joinCode}
    />
  );

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>BF</span>
          <span>BoardForge</span>
        </Link>
        <form className={styles.join} onSubmit={joinRoom}>
          <span>Already invited?</span>
          {joinInput()}
          <button type="submit" disabled={joinCode.trim().length !== 6}>
            Join
          </button>
        </form>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span /> Make tonight one to remember.
          </p>
          <h1>
            Feel closer.
            <br />
            <em>Play together.</em>
          </h1>
          <p className={styles.lead}>
            BoardForge turns every phone into part of a shared game table. Beautifully crafted social games bring the
            laughter, rivalry, and little moments of a real game night—wherever your people are.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#games">
              Choose tonight&apos;s game <b>↗</b>
            </a>
          </div>
          <form className={styles.heroJoin} onSubmit={joinRoom}>
            <div>
              <strong>Joining someone?</strong>
              <span>Enter the code they shared with you.</span>
            </div>
            <div className={styles.heroJoinControls}>
              {joinInput(styles.heroJoinInput)}
              <button type="submit" disabled={joinCode.trim().length !== 6}>
                Enter room <b>→</b>
              </button>
            </div>
          </form>
          <div className={styles.proof}>
            <span>
              <b>Pick</b> your mood
            </span>
            <span>
              <b>Invite</b> with one code
            </span>
            <span>
              <b>Play</b> together
            </span>
          </div>
        </div>

        <div className={styles.heroVisual} role="img" aria-label="CineMimes preview">
          <div className={styles.posterBack} />
          <div className={styles.poster}>
            <div className={styles.posterTop}>
              <span>BoardForge Original</span>
              <b>01</b>
            </div>
            <div className={styles.reel}>
              <i />
              <i />
              <i />
              <i />
              <i />
              <strong>🎬</strong>
            </div>
            <div className={styles.posterTitle}>
              <small>The movie-charades showdown</small>
              <h2>
                Cine
                <br />
                Mimes
              </h2>
              <p>Draw. Perform. Take over the box office.</p>
            </div>
            <div className={styles.posterFooter}>
              <span>2–12 players</span>
              <span>Teams</span>
              <span>12+ min</span>
            </div>
          </div>
          <div className={styles.floatingCard}>
            <span>Secret movie</span>
            <strong>?</strong>
            <small>For the performer&apos;s eyes only</small>
          </div>
          <div className={styles.timerChip}>
            <i /> 00:42
          </div>
        </div>
      </section>

      <section className={styles.catalog} id="games">
        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.eyebrow}>
              <span /> The BoardForge collection
            </p>
            <h2>
              Choose tonight&apos;s
              <br />
              main event.
            </h2>
          </div>
          <p>
            Seven crafted experiences, each with its own look, rhythm, and way to play. AI personalizes the content;
            BoardForge keeps every game polished, reliable, and ready for the room.
          </p>
        </div>

        <div className={styles.gamesGrid}>
          <Link className={styles.gameCard} href="/games/movie-mime">
            <div className={styles.gameArtwork}>
              <span className={styles.gameNumber}>Nº 01</span>
              <div className={styles.clapper}>
                <i />
                <strong>ACTION!</strong>
              </div>
              <div className={styles.lightCone} />
            </div>
            <div className={styles.gameInfo}>
              <p>Team game · Charades</p>
              <h3>CineMimes</h3>
              <span>
                Act out famous movies without saying a word. Choose your atmosphere and let BoardForge prepare the
                lineup.
              </span>
              <div>
                <b>Make it ours</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
          <Link className={`${styles.gameCard} ${styles.wordTrapCard}`} href="/games/word-trap">
            <div className={`${styles.gameArtwork} ${styles.wordTrapArtwork}`}>
              <span className={styles.gameNumber}>No. 02</span>
              <div className={styles.wordBolt}>⚡</div>
              <div className={styles.wordCard}>
                <small>SECRET WORD</small>
                <strong>?</strong>
                <span>5 forbidden clues</span>
              </div>
            </div>
            <div className={styles.gameInfo}>
              <p>Team game · Forbidden words</p>
              <h3>WordTrap</h3>
              <span>Give brilliant clues, avoid five dangerous words, and beat the opposing team’s buzzer.</span>
              <div>
                <b>Make it ours</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
          <Link className={`${styles.gameCard} ${styles.drawBattleCard}`} href="/games/draw-battle">
            <div className={`${styles.gameArtwork} ${styles.drawBattleArtwork}`}>
              <span className={styles.gameNumber}>No. 03</span>
              <div className={styles.canvasPaper}>
                <i />
                <i />
                <i />
                <strong>?</strong>
                <small>LIVE CANVAS</small>
              </div>
              <div className={styles.drawPencil}>✎</div>
            </div>
            <div className={styles.gameInfo}>
              <p>Team game · Live drawing</p>
              <h3>DrawBattle</h3>
              <span>Turn a secret idea into questionable art while the room races to work out what it is.</span>
              <div>
                <b>Make it ours</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
          <Link className={`${styles.gameCard} ${styles.soundCheckCard}`} href="/games/sound-check">
            <div className={`${styles.gameArtwork} ${styles.soundCheckArtwork}`}>
              <span className={styles.gameNumber}>No. 04</span>
              <div className={styles.vinyl}>
                <i />
                <i />
                <i />
                <strong>BF</strong>
              </div>
              <div className={styles.soundWave}>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className={styles.gameInfo}>
              <p>Team game · Sound imitation</p>
              <h3>SoundCheck</h3>
              <span>Make the sound. Keep a straight face. Hope someone understands what on earth you are doing.</span>
              <div>
                <b>Make it ours</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
          <Link className={`${styles.gameCard} ${styles.storyChainCard}`} href="/games/story-chain">
            <div className={`${styles.gameArtwork} ${styles.storyChainArtwork}`}>
              <span className={styles.gameNumber}>No. 05</span>
              <div className={styles.storyBook}>
                <small>ONCE UPON A TIME…</small>
                <strong>?</strong>
                <p>The last train arrived without a driver, carrying only a silver suitcase.</p>
                <i>✦</i>
              </div>
              <div className={styles.storyQuill}>⌁</div>
            </div>
            <div className={styles.gameInfo}>
              <p>Cooperative · Creative storytelling</p>
              <h3>StoryChain</h3>
              <span>Take turns writing one shared tale, with a secret word waiting to twist every new chapter.</span>
              <div>
                <b>Make it ours</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
          <Link className={`${styles.gameCard} ${styles.wordDuelCard}`} href="/games/word-duel">
            <div className={`${styles.gameArtwork} ${styles.wordDuelArtwork}`}>
              <span className={styles.gameNumber}>No. 06</span>
              <div className={styles.duelWord}>
                <i>_</i>
                <i className={styles.duelFound}>A</i>
                <i>_</i>
                <i>_</i>
                <i className={styles.duelFound}>E</i>
              </div>
              <div className={styles.duelKeys}>
                {["QWERTY", "ASDFG", "ZXCVB"].map((row) => (
                  <div key={row}>
                    {[...row].map((letter) => (
                      <i
                        className={
                          letter === "A" || letter === "E" ? styles.duelHit : letter === "T" ? styles.duelMiss : ""
                        }
                        key={letter}
                      >
                        {letter}
                      </i>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.gameInfo}>
              <p>Two players · Secret words</p>
              <h3>WordDuel</h3>
              <span>
                Lock in a word, play the keyboard, and crack your rival&apos;s answer before they crack yours.
              </span>
              <div>
                <b>Start the duel</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
          <Link className={`${styles.gameCard} ${styles.secondSenseCard}`} href="/games/second-sense">
            <div className={`${styles.gameArtwork} ${styles.secondSenseArtwork}`}>
              <span className={styles.gameNumber}>No. 07</span>
              <div className={styles.senseOrbit}>
                <i />
                <i />
                <i />
                <div>
                  <small>YOUR TARGET</small>
                  <strong>02.00</strong>
                  <span>SECONDS</span>
                </div>
              </div>
              <div className={styles.senseCut}>
                <span>8</span>
                <i>→</i>
                <span>4</span>
                <i>→</i>
                <span>2</span>
                <i>→</i>
                <b>1</b>
              </div>
            </div>
            <div className={styles.gameInfo}>
              <p>2–12 players · Knockout timing</p>
              <h3>Second Sense</h3>
              <span>
                See the target, hide the clock, and stop on instinct. Only the closest players survive the cut.
              </span>
              <div>
                <b>Trust your timing</b>
                <strong>→</strong>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>BoardForge © 2026</span>
        <p>Designed for real game nights.</p>
      </footer>
    </main>
  );
}
