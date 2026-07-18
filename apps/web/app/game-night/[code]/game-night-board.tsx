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
  const latestResult = view.history[view.history.length - 1];
  const latestAwards =
    latestResult?.awards.map((award) => ({ ...award, team: view.teams.find((team) => team.id === award.teamId) })) ??
    [];
  const latestWinnerNames = latestAwards
    .map((award) => award.team?.name)
    .filter((name): name is string => Boolean(name));
  const gameTitle = (blueprintId: string) =>
    games.find((entry) => entry.id === blueprintId)?.game.title ?? "BoardForge Original";

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
                ? view.gamesPlayed
                  ? "The standings are live. Choose the next game and keep the night moving."
                  : "Your teams are set. Choose the game that will write the first score."
                : `${host?.name ?? "The host"} is setting up what comes next.`}
            </span>
          </div>
          <div className={styles.nightTally}>
            <small>Tonight so far</small>
            <strong>{view.gamesPlayed.toString().padStart(2, "0")}</strong>
            <span>{view.gamesPlayed === 1 ? "game played" : "games played"}</span>
          </div>
        </header>

        {latestResult ? (
          <section className={styles.resultSpotlight}>
            <div className={styles.resultMark}>
              <small>Round {latestResult.ordinal.toString().padStart(2, "0")}</small>
              <strong>✦</strong>
            </div>
            <div className={styles.resultCopy}>
              <small>{gameTitle(latestResult.blueprintId)} · Final result</small>
              <h2>
                {latestWinnerNames.length > 1
                  ? `${latestWinnerNames.join(" & ")} share the win.`
                  : latestWinnerNames.length === 1
                    ? `${latestWinnerNames[0]} takes the round.`
                    : "A great game, all the way to the end."}
              </h2>
              <p>The result is locked and the Game Night standings are up to date.</p>
            </div>
            <div className={styles.resultAwards}>
              {latestAwards.length ? (
                latestAwards.map((award) => (
                  <span key={award.teamId} style={{ "--team-color": award.team?.color ?? "#ffd54a" } as CSSProperties}>
                    <i />
                    <small>{award.team?.name ?? "Team"}</small>
                    <strong>+{award.points}</strong>
                    <b>pts</b>
                  </span>
                ))
              ) : (
                <span>
                  <small>Global score</small>
                  <strong>—</strong>
                  <b>No points</b>
                </span>
              )}
            </div>
          </section>
        ) : null}

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
                      <span>
                        {index === 0 ? "Leading" : team.score === ranking[0]?.score ? "Tied for lead" : "In the chase"}
                      </span>
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
        {view.history.length ? (
          <section className={styles.historyPanel}>
            <header>
              <div>
                <small>Tonight&apos;s story</small>
                <h2>Every game leaves a mark.</h2>
              </div>
              <span>{view.history.length.toString().padStart(2, "0")} results saved</span>
            </header>
            <div className={styles.historyList}>
              {[...view.history].reverse().map((result) => {
                const awards = result.awards.map((award) => ({
                  ...award,
                  team: view.teams.find((team) => team.id === award.teamId),
                }));
                return (
                  <article key={result.gameInstanceId}>
                    <i>{result.ordinal.toString().padStart(2, "0")}</i>
                    <div>
                      <small>Game {result.ordinal}</small>
                      <strong>{gameTitle(result.blueprintId)}</strong>
                    </div>
                    <div className={styles.historyAwards}>
                      {awards.length ? (
                        awards.map((award) => (
                          <span key={award.teamId}>
                            {award.team?.name ?? "Team"} <b>+{award.points}</b>
                          </span>
                        ))
                      ) : (
                        <span>No global points</span>
                      )}
                    </div>
                    <b>Recorded ✓</b>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
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
