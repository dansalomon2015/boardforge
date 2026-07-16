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
            aria-label="Code de room"
            maxLength={6}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="CODE"
            value={joinCode}
          />
          <button disabled={joinCode.trim().length !== 6}>Rejoindre</button>
        </form>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> Une soirée. Un jeu. Votre édition.</p>
          <h1>Le cinéma passe<br /><em>à l’action.</em></h1>
          <p className={styles.lead}>
            Des jeux de soirée conçus avec soin, personnalisés pour votre groupe et habillés comme de véritables objets de collection.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/games/movie-mime">
              Préparer une partie <b>↗</b>
            </Link>
            <a className={styles.secondaryAction} href="#games">Découvrir le jeu</a>
          </div>
          <div className={styles.proof}>
            <span><b>24/24</b> playtests</span>
            <span><b>60</b> films audités</span>
            <span><b>20</b> directions artistiques</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="Aperçu de CinéMimes">
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
              <small>Le jeu de mime cinéma</small>
              <h2>Ciné<br />Mimes</h2>
              <p>Piochez. Mimez. Faites exploser le box-office.</p>
            </div>
            <div className={styles.posterFooter}>
              <span>2–12 joueurs</span><span>Équipes</span><span>12+ min</span>
            </div>
          </div>
          <div className={styles.floatingCard}>
            <span>Film secret</span>
            <strong>?</strong>
            <small>À découvrir par le mimeur</small>
          </div>
          <div className={styles.timerChip}><i /> 00:42</div>
        </div>
      </section>

      <section className={styles.catalog} id="games">
        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.eyebrow}><span /> La collection BoardForge</p>
            <h2>Un premier jeu.<br />Aucun compromis.</h2>
          </div>
          <p>Chaque jeu possède son propre moteur, sa direction artistique et une expérience multijoueur pensée jusque dans les détails.</p>
        </div>

        <Link className={styles.gameCard} href="/games/movie-mime">
          <div className={styles.gameArtwork}>
            <span className={styles.gameNumber}>Nº 01</span>
            <div className={styles.clapper}><i /><strong>ACTION!</strong></div>
            <div className={styles.lightCone} />
          </div>
          <div className={styles.gameInfo}>
            <p>Jeu d’équipes · Mime</p>
            <h3>CinéMimes</h3>
            <span>Faites reconnaître des films sans prononcer un mot. Choisissez votre ambiance et laissez BoardForge préparer la sélection.</span>
            <div>
              <b>Créer mon édition</b>
              <strong>→</strong>
            </div>
          </div>
        </Link>
      </section>

      <footer className={styles.footer}>
        <span>BoardForge © 2026</span>
        <p>Designed for real game nights.</p>
      </footer>
    </main>
  );
}
