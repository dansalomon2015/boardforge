import Link from "next/link";
import type { CSSProperties } from "react";
import type { GameNightCatalogEntry, GameNightView } from "@boardforge/shared";
import { rankGameNightTeams } from "../../../lib/game-night-ranking";
import styles from "./page.module.css";

type GameNightFinaleProps = {
  code: string;
  connected: boolean;
  copied: boolean;
  games: GameNightCatalogEntry[];
  onCopyInvite: () => void;
  view: GameNightView;
};

export function GameNightFinale({ code, connected, copied, games, onCopyInvite, view }: GameNightFinaleProps) {
  const ranking = rankGameNightTeams(view.teams);
  const winningScore = ranking[0]?.score ?? 0;
  const champions = ranking.filter((team) => team.score === winningScore);
  const championNames = champions.map((team) => team.name);
  const gameTitle = (blueprintId: string) =>
    games.find((entry) => entry.id === blueprintId)?.game.title ?? "BoardForge Original";

  return (
    <main className={styles.finalePage}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span>BF</span>
          <b>BoardForge</b>
        </Link>
        <div className={styles.boardNavMeta}>
          <span className={`${styles.live} ${connected ? styles.online : ""}`}>
            <i /> {connected ? "Final board" : "Reconnecting"}
          </span>
          <button onClick={onCopyInvite} type="button">
            <small>{copied ? "Copied" : "Night code"}</small>
            <strong>{code}</strong>
          </button>
        </div>
      </nav>

      <section className={styles.finaleLayout}>
        <header className={styles.finaleHero}>
          <div className={styles.finaleEyebrow}>
            <span /> Game Night complete <span />
          </div>
          <div className={styles.finaleCrown}>✦</div>
          <p>
            {view.gamesPlayed} {view.gamesPlayed === 1 ? "game" : "games"} · One unforgettable table
          </p>
          <h1>{champions.length > 1 ? "Shared glory." : "We have a champion."}</h1>
          <h2>{championNames.join(" & ")}</h2>
          <span>
            {champions.length > 1
              ? `They finish level on ${winningScore} ${winningScore === 1 ? "point" : "points"} and share the top of the night.`
              : `${championNames[0] ?? "The winning team"} takes the night with ${winningScore} ${winningScore === 1 ? "point" : "points"}.`}
          </span>
        </header>

        <section className={styles.podiumSection} aria-label="Final podium">
          <div className={styles.podiumGrid}>
            {ranking.map((team) => {
              const rank = team.rank;
              const members = view.players.filter((player) => team.playerIds.includes(player.id));
              return (
                <article
                  className={`${styles.podiumCard} ${rank === 1 ? styles.podiumWinner : ""}`}
                  key={team.id}
                  style={{ "--team-color": team.color } as CSSProperties}
                >
                  <div className={styles.podiumRank}>
                    <small>{rank === 1 ? (champions.length > 1 ? "Co-champion" : "Champion") : `Place ${rank}`}</small>
                    <strong>{rank.toString().padStart(2, "0")}</strong>
                  </div>
                  <i />
                  <h3>{team.name}</h3>
                  <div className={styles.podiumScore}>
                    <strong>{team.score}</strong>
                    <small>{team.score === 1 ? "point" : "points"}</small>
                  </div>
                  <p>{members.map((player) => player.name).join(" · ")}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.finaleHistory}>
          <header>
            <div>
              <small>The night in review</small>
              <h2>Every round, remembered.</h2>
            </div>
            <span>
              {view.history.length.toString().padStart(2, "0")}{" "}
              {view.history.length === 1 ? "final result" : "final results"}
            </span>
          </header>
          <div>
            {view.history.map((result) => {
              const awardedNames = result.awards
                .map((award) => view.teams.find((team) => team.id === award.teamId)?.name)
                .filter((name): name is string => Boolean(name));
              return (
                <article key={result.gameInstanceId}>
                  <i>{result.ordinal.toString().padStart(2, "0")}</i>
                  <span>
                    <small>Game {result.ordinal}</small>
                    <strong>{gameTitle(result.blueprintId)}</strong>
                  </span>
                  <p>{awardedNames.length ? awardedNames.join(" & ") : "No global points awarded"}</p>
                  <b>Final ✓</b>
                </article>
              );
            })}
          </div>
        </section>

        <footer className={styles.finaleFooter}>
          <div>
            <small>Same people. A brand-new story.</small>
            <h2>Ready for another night?</h2>
          </div>
          <Link href="/game-night/new">
            Start a new Game Night <b>→</b>
          </Link>
        </footer>
      </section>
    </main>
  );
}
