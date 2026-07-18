import type { GameNightCatalogEntry } from "@boardforge/shared";
import styles from "./page.module.css";

const gameMarks: Record<string, string> = {
  movie_mime: "▶",
  word_trap: "W",
  draw_battle: "✎",
  sound_check: "♪",
};

type GameNightCatalogProps = {
  games: GameNightCatalogEntry[];
  isHost: boolean;
  loading: boolean;
  onSelect: (blueprintId: string) => void;
  pending: boolean;
  selectedBlueprintId: string | null;
};

export function GameNightCatalog({
  games,
  isHost,
  loading,
  onSelect,
  pending,
  selectedBlueprintId,
}: GameNightCatalogProps) {
  return (
    <section className={styles.gameShelf}>
      <header className={styles.gameShelfHeader}>
        <div>
          <small>The Game Night collection</small>
          <h2>Pick the next adventure.</h2>
        </div>
        <p>
          {isHost
            ? "Choose the energy for the next round. BoardForge checks every team before anyone enters."
            : "Browse the collection while your host chooses what the room will play next."}
        </p>
      </header>

      {loading ? (
        <div className={styles.shelfLoading}>
          <i />
          <span>Opening the game shelf…</span>
        </div>
      ) : (
        <div className={styles.catalogGrid}>
          {games.map((entry, index) => {
            const selected = selectedBlueprintId === entry.id;
            const canPrepare =
              entry.compatibility.compatible ||
              entry.compatibility.reasons.every((reason) => reason.code === "CAPTAIN_REQUIRED");
            const experienceId = entry.game.experienceId ?? "generic";
            return (
              <article
                className={`${styles.catalogCard} ${selected ? styles.catalogSelected : ""}`}
                data-game={experienceId}
                key={entry.id}
              >
                <div className={styles.catalogArtwork}>
                  <span>No. {(index + 1).toString().padStart(2, "0")}</span>
                  <strong>{gameMarks[experienceId] ?? "BF"}</strong>
                  <small>{entry.game.durationMinutes} min</small>
                </div>
                <div className={styles.catalogInfo}>
                  <div className={styles.catalogStatus}>
                    <span>
                      {entry.game.minPlayers}–{entry.game.maxPlayers} players
                    </span>
                    <b className={entry.compatibility.compatible ? styles.gameReady : ""}>
                      {entry.compatibility.compatible ? "Ready" : canPrepare ? "Needs captains" : "Not a fit"}
                    </b>
                  </div>
                  <h3>{entry.game.title}</h3>
                  <p>{entry.game.description}</p>
                  {entry.compatibility.compatible ? (
                    <div className={styles.fitMessage}>✓ A perfect fit for tonight&apos;s teams.</div>
                  ) : (
                    <ul className={styles.compatibilityReasons}>
                      {entry.compatibility.reasons.slice(0, 2).map((reason) => (
                        <li key={`${reason.code}:${reason.message}`}>{reason.message}</li>
                      ))}
                    </ul>
                  )}
                  {isHost ? (
                    <button
                      disabled={!canPrepare || pending || selected}
                      onClick={() => onSelect(entry.id)}
                      type="button"
                    >
                      <span>
                        {selected ? "Chosen for the next round" : canPrepare ? "Choose this game" : "Unavailable"}
                      </span>
                      <b>{selected ? "✓" : "→"}</b>
                    </button>
                  ) : (
                    <div className={styles.guestChoice}>{selected ? "✓ Host's choice" : "Waiting for the host"}</div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
