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
          <p className={styles.eyebrow}><span /> One night. One game. Your edition.</p>
          <h1>Game night,<br /><em>forged beautifully.</em></h1>
          <p className={styles.lead}>
            Premium social games, personalized for your group and designed like collectible objects worth bringing to the table.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/games/movie-mime">
              Build a game <b>↗</b>
            </Link>
            <a className={styles.secondaryAction} href="#games">Explore the collection</a>
          </div>
          <div className={styles.proof}>
            <span><b>24/24</b> playtests</span>
            <span><b>110</b> audited cards</span>
            <span><b>20</b> art directions</span>
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
            <small>Performer access only</small>
          </div>
          <div className={styles.timerChip}><i /> 00:42</div>
        </div>
      </section>

      <section className={styles.catalog} id="games">
        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.eyebrow}><span /> The BoardForge collection</p>
            <h2>Two real games.<br />No compromises.</h2>
          </div>
          <p>Every title has its own tuned rule loop, art direction, private information model, and multiplayer experience.</p>
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
              <b>Build my edition</b>
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
            <div><b>Build my edition</b><strong>→</strong></div>
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
