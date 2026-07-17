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

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>BF</span>
          <span>BoardForge</span>
        </Link>
        <form className={styles.join} onSubmit={joinRoom}>
          <input
            aria-label="Room code"
            maxLength={6}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="CODE"
            value={joinCode}
          />
          <button disabled={joinCode.trim().length !== 6}>Join</button>
        </form>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> Make tonight one to remember.</p>
          <h1>Your game night,<br /><em>beautifully made.</em></h1>
          <p className={styles.lead}>
            Pick a game, make it yours, and invite everyone in. BoardForge sets the scene for laughter, rivalry, and the stories you will retell tomorrow.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/games/movie-mime">
              Choose tonight&apos;s game <b>↗</b>
            </Link>
            <a className={styles.secondaryAction} href="#games">Explore the collection</a>
          </div>
          <div className={styles.proof}>
            <span><b>Pick</b> your mood</span>
            <span><b>Invite</b> with one code</span>
            <span><b>Play</b> together</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="CineMimes preview">
          <div className={styles.posterBack} />
          <div className={styles.poster}>
            <div className={styles.posterTop}>
              <span>BoardForge Original</span>
              <b>01</b>
            </div>
            <div className={styles.reel}>
              <i /><i /><i /><i /><i />
              <strong>🎬</strong>
            </div>
            <div className={styles.posterTitle}>
              <small>The movie-charades showdown</small>
              <h2>Cine<br />Mimes</h2>
              <p>Draw. Perform. Take over the box office.</p>
            </div>
            <div className={styles.posterFooter}>
              <span>2–12 players</span><span>Teams</span><span>12+ min</span>
            </div>
          </div>
          <div className={styles.floatingCard}>
            <span>Secret movie</span>
            <strong>?</strong>
            <small>For the performer&apos;s eyes only</small>
          </div>
          <div className={styles.timerChip}><i /> 00:42</div>
        </div>
      </section>

      <section className={styles.catalog} id="games">
        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.eyebrow}><span /> The BoardForge collection</p>
            <h2>Choose tonight&apos;s<br />main event.</h2>
          </div>
          <p>Five games, five completely different moods. Choose your favorite, add your people, and let the night take it from there.</p>
        </div>

        <div className={styles.gamesGrid}>
        <Link className={styles.gameCard} href="/games/movie-mime">
          <div className={styles.gameArtwork}>
            <span className={styles.gameNumber}>Nº 01</span>
            <div className={styles.clapper}><i /><strong>ACTION!</strong></div>
            <div className={styles.lightCone} />
          </div>
          <div className={styles.gameInfo}>
            <p>Team game · Charades</p>
            <h3>CineMimes</h3>
            <span>Act out famous movies without saying a word. Choose your atmosphere and let BoardForge prepare the lineup.</span>
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
            <div className={styles.wordCard}><small>SECRET WORD</small><strong>?</strong><span>5 forbidden clues</span></div>
          </div>
          <div className={styles.gameInfo}>
            <p>Team game · Forbidden words</p><h3>WordTrap</h3>
            <span>Give brilliant clues, avoid five dangerous words, and beat the opposing team’s buzzer.</span>
            <div><b>Make it ours</b><strong>→</strong></div>
          </div>
        </Link>
        <Link className={`${styles.gameCard} ${styles.drawBattleCard}`} href="/games/draw-battle">
          <div className={`${styles.gameArtwork} ${styles.drawBattleArtwork}`}>
            <span className={styles.gameNumber}>No. 03</span>
            <div className={styles.canvasPaper}><i /><i /><i /><strong>?</strong><small>LIVE CANVAS</small></div>
            <div className={styles.drawPencil}>✎</div>
          </div>
          <div className={styles.gameInfo}>
            <p>Team game · Live drawing</p><h3>DrawBattle</h3>
            <span>Turn a secret idea into questionable art while the room races to work out what it is.</span>
            <div><b>Make it ours</b><strong>→</strong></div>
          </div>
        </Link>
        <Link className={`${styles.gameCard} ${styles.soundCheckCard}`} href="/games/sound-check">
          <div className={`${styles.gameArtwork} ${styles.soundCheckArtwork}`}>
            <span className={styles.gameNumber}>No. 04</span>
            <div className={styles.vinyl}><i /><i /><i /><strong>BF</strong></div>
            <div className={styles.soundWave}><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className={styles.gameInfo}>
            <p>Team game · Sound imitation</p><h3>SoundCheck</h3>
            <span>Make the sound. Keep a straight face. Hope someone understands what on earth you are doing.</span>
            <div><b>Make it ours</b><strong>→</strong></div>
          </div>
        </Link>
        <Link className={`${styles.gameCard} ${styles.storyChainCard}`} href="/games/story-chain">
          <div className={`${styles.gameArtwork} ${styles.storyChainArtwork}`}>
            <span className={styles.gameNumber}>No. 05</span>
            <div className={styles.storyBook}><small>ONCE UPON A TIME…</small><strong>?</strong><p>The last train arrived without a driver, carrying only a silver suitcase.</p><i>✦</i></div>
            <div className={styles.storyQuill}>⌁</div>
          </div>
          <div className={styles.gameInfo}>
            <p>Cooperative · Creative storytelling</p><h3>StoryChain</h3>
            <span>Take turns writing one shared tale, with a secret word waiting to twist every new chapter.</span>
            <div><b>Make it ours</b><strong>→</strong></div>
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
