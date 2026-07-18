import Link from "next/link";
import type { CSSProperties } from "react";
import type { GameNightCatalogEntry, GameNightView } from "@boardforge/shared";
import { GameNightCatalog } from "./game-night-catalog";
import styles from "./page.module.css";

type GameNightBoardProps = {
  code: string;
  connected: boolean;
  copied: boolean;
  error: string;
  games: GameNightCatalogEntry[];
  gamesLoading: boolean;
  onCopyInvite: () => void;
  onLaunchGame: (blueprintId: string) => void;
  onSelectCaptain: (teamId: string, captainPlayerId: string) => void;
  onSelectGame: (blueprintId: string) => void;
  pending: boolean;
  view: GameNightView;
};

export function GameNightBoard({
  code,
  connected,
  copied,
  error,
  games,
  gamesLoading,
  onCopyInvite,
  onLaunchGame,
  onSelectCaptain,
  onSelectGame,
  pending,
  view,
}: GameNightBoardProps) {
  const ranking = [...view.teams].sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name),
  );
  const host = view.players.find((player) => player.isHost);
  const selectedGame = games.find((entry) => entry.id === view.selectedBlueprintId);

  return (
    <main className={styles.boardPage}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span>BF</span>
          <b>BoardForge</b>
        </Link>
        <div className={styles.boardNavMeta}>
          <span className={`${styles.live} ${connected ? styles.online : ""}`}>
            <i /> {connected ? "Live board" : "Reconnecting"}
          </span>
          <button onClick={onCopyInvite} type="button">
            <small>{copied ? "Copied" : "Invite code"}</small>
            <strong>{code}</strong>
          </button>
        </div>
      </nav>

      <section className={styles.boardLayout}>
        <header className={styles.boardHero}>
          <div>
            <p>Game Night · {view.gamesPlayed ? `${view.gamesPlayed} played` : "Opening round"}</p>
            <h1>The night is on.</h1>
            <span>
              {view.isHost
                ? "Your teams are set. Choose the game that will write the first score."
                : `${host?.name ?? "The host"} is setting up what comes next.`}
            </span>
          </div>
          <div className={styles.nightTally}>
            <small>Tonight so far</small>
            <strong>{view.gamesPlayed.toString().padStart(2, "0")}</strong>
            <span>{view.gamesPlayed === 1 ? "game played" : "games played"}</span>
          </div>
        </header>

        <div className={styles.boardGrid}>
          <section className={styles.standingsPanel}>
            <div className={styles.boardSectionTitle}>
              <div>
                <small>Live standings</small>
                <h2>Every point counts.</h2>
              </div>
              <span>Win 3 · Tie 1</span>
            </div>
            <div className={styles.scoreGrid}>
              {ranking.map((team, index) => {
                const members = view.players.filter((player) => team.playerIds.includes(player.id));
                return (
                  <article
                    className={styles.scoreCard}
                    key={team.id}
                    style={{ "--team-color": team.color } as CSSProperties}
                  >
                    <div className={styles.scoreRank}>
                      <i>{index + 1}</i>
                      <span>{index === 0 ? "Leading" : "In the chase"}</span>
                    </div>
                    <div className={styles.scoreValue}>
                      <strong>{team.score}</strong>
                      <small>pts</small>
                    </div>
                    <h3>{team.name}</h3>
                    <div className={styles.boardMembers}>
                      {members.map((player) => (
                        <span key={player.id}>
                          <i className={player.connected ? styles.online : ""} />
                          {player.name}
                          {team.captainPlayerId === player.id ? <small>Captain</small> : null}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={styles.nextGamePanel}>
            {view.currentRoomCode ? (
              <>
                <p>Now playing</p>
                <h2>A game is waiting.</h2>
                <span>Step into the room with your Game Night identity and team.</span>
                <Link href={`/room/${view.currentRoomCode}`}>
                  Join active game <b>→</b>
                </Link>
              </>
            ) : (
              <>
                <p>{selectedGame ? "Coming up" : view.isHost ? "Your move" : "Up next"}</p>
                <h2>
                  {selectedGame
                    ? `${selectedGame.game.title} is next.`
                    : view.isHost
                      ? "Choose the next spark."
                      : "The next game is coming."}
                </h2>
                <span>
                  {selectedGame
                    ? view.isHost
                      ? "Get the teams ready, then set up the round before everyone enters."
                      : `Stay close — ${host?.name ?? "the host"} is getting the teams ready.`
                    : view.isHost
                      ? "Pick a game that fits the teams at your table."
                      : `Stay close — ${host?.name ?? "the host"} is choosing for the room.`}
                </span>
                <div className={styles.hostBadge}>
                  <i>{host?.name.slice(0, 1).toUpperCase() ?? "H"}</i>
                  <span>
                    <small>Tonight&apos;s host</small>
                    <strong>{host?.name ?? "Host"}</strong>
                  </span>
                </div>
              </>
            )}
          </aside>
        </div>
        {!view.currentRoomCode ? (
          <GameNightCatalog
            games={games}
            isHost={view.isHost}
            loading={gamesLoading}
            onLaunch={onLaunchGame}
            onSelectCaptain={onSelectCaptain}
            onSelect={onSelectGame}
            pending={pending}
            selectedBlueprintId={view.selectedBlueprintId}
            teams={view.teams}
            players={view.players}
          />
        ) : null}
      </section>
      {error ? <p className={styles.toast}>{error}</p> : null}
    </main>
  );
}
