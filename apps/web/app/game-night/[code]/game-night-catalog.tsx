import type { CSSProperties } from "react";
import type { GameNightCatalogEntry, GameNightView, PublicPlayer } from "@boardforge/shared";
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
  onLaunch: (blueprintId: string) => void;
  onSelect: (blueprintId: string) => void;
  onSelectCaptain: (teamId: string, captainPlayerId: string) => void;
  pending: boolean;
  players: PublicPlayer[];
  selectedBlueprintId: string | null;
  teams: GameNightView["teams"];
};

export function GameNightCatalog({
  games,
  isHost,
  loading,
  onLaunch,
  onSelect,
  onSelectCaptain,
  pending,
  players,
  selectedBlueprintId,
  teams,
}: GameNightCatalogProps) {
  const selectedGame = games.find((entry) => entry.id === selectedBlueprintId);

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

      {selectedGame ? (
        <section className={styles.gameSetup} data-game={selectedGame.game.experienceId ?? "generic"}>
          <div className={styles.setupIntro}>
            <span>Next game</span>
            <strong>{gameMarks[selectedGame.game.experienceId ?? "generic"] ?? "BF"}</strong>
            <div>
              <small>Team setup</small>
              <h3>{selectedGame.game.title}</h3>
              <p>Each captain will choose the active player when their team&apos;s turn begins.</p>
            </div>
          </div>
          {selectedGame.compatibility.requiresCaptains ? (
            <div className={styles.captainGrid}>
              {teams.map((team) => {
                const members = players.filter((player) => team.playerIds.includes(player.id));
                return (
                  <article key={team.id} style={{ "--team-color": team.color } as CSSProperties}>
                    <header>
                      <i />
                      <span>
                        <small>Choose captain</small>
                        <strong>{team.name}</strong>
                      </span>
                      <b>{team.captainPlayerId ? "✓" : "—"}</b>
                    </header>
                    <div>
                      {members.map((player) => {
                        const selected = team.captainPlayerId === player.id;
                        return isHost ? (
                          <button
                            aria-label={`Choose ${player.name} as captain of ${team.name}`}
                            aria-pressed={selected}
                            disabled={pending}
                            key={player.id}
                            onClick={() => onSelectCaptain(team.id, player.id)}
                            type="button"
                          >
                            <i>{player.name.slice(0, 1).toUpperCase()}</i>
                            <span>{player.name}</span>
                            <b>{selected ? "Captain" : "Choose"}</b>
                          </button>
                        ) : (
                          <span className={selected ? styles.captainChosen : ""} key={player.id}>
                            <i>{player.name.slice(0, 1).toUpperCase()}</i>
                            <b>{player.name}</b>
                            <small>{selected ? "Captain" : "Team member"}</small>
                          </span>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          <footer className={styles.setupFooter}>
            <div>
              <i className={selectedGame.compatibility.compatible ? styles.setupReady : ""} />
              <span>
                <strong>{selectedGame.compatibility.compatible ? "Teams are ready" : "A few choices remain"}</strong>
                <small>
                  {selectedGame.compatibility.compatible
                    ? "BoardForge has checked every player and team."
                    : (selectedGame.compatibility.reasons[0]?.message ?? "Complete the setup to continue.")}
                </small>
              </span>
            </div>
            {isHost ? (
              <button
                disabled={!selectedGame.compatibility.compatible || pending}
                onClick={() => onLaunch(selectedGame.id)}
                type="button"
              >
                <span>{pending ? "Preparing the room…" : `Start ${selectedGame.game.title}`}</span>
                <b>→</b>
              </button>
            ) : (
              <p>The game will open automatically when the host starts it.</p>
            )}
          </footer>
        </section>
      ) : null}

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
