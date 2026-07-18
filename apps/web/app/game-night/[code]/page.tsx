"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameNightCatalogEntry, GameNightView, JoinGameNightResult, SocketAck } from "@boardforge/shared";
import {
  clearGameNightSession,
  readGameNightSession,
  saveGameNightSession,
  type StoredGameNightSession,
} from "../../../lib/game-night-session";
import { GameNightBoard } from "./game-night-board";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type GameNightPreview = {
  id: string;
  code: string;
  status: "lobby" | "playing" | "completed";
  playerCount: number;
  currentRoomCode: string | null;
};

export default function GameNightLobbyPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code.toUpperCase();
  const socketRef = useRef<Socket | null>(null);
  const [preview, setPreview] = useState<GameNightPreview | null>(null);
  const [view, setView] = useState<GameNightView | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  const [games, setGames] = useState<GameNightCatalogEntry[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  async function openSession(playerName: string, stored?: StoredGameNightSession): Promise<GameNightView> {
    const response = await fetch(`${apiUrl}/api/game-nights/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: playerName.trim(),
        ...(stored ? { playerId: stored.playerId, reconnectToken: stored.reconnectToken } : {}),
      }),
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(failure?.error ?? "The lobby could not be opened.");
    }
    const result = (await response.json()) as JoinGameNightResult;
    saveGameNightSession(result.view.id, {
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      name: playerName.trim(),
    });
    return result.view;
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const response = await fetch(`${apiUrl}/api/game-nights/${code}`);
        if (!response.ok) throw new Error("This Game Night could not be found.");
        const nextPreview = (await response.json()) as GameNightPreview;
        if (cancelled) return;
        setPreview(nextPreview);
        const stored = readGameNightSession(nextPreview.id);
        if (stored) {
          try {
            const nextView = await openSession(stored.name, stored);
            if (!cancelled) setView(nextView);
          } catch (caught) {
            clearGameNightSession(nextPreview.id);
            if (!cancelled) setError(caught instanceof Error ? caught.message : "Your session has expired.");
          }
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Something unexpected happened.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!view) return;
    const stored = readGameNightSession(view.id);
    if (!stored) return;
    const socket = io(apiUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const subscribe = () => {
      setConnected(true);
      socket.emit(
        "game-night:subscribe",
        { code, playerId: stored.playerId, reconnectToken: stored.reconnectToken },
        (response: SocketAck<{ view: GameNightView }>) => {
          if (response.ok) setView(response.data.view);
          else setError(response.error);
        },
      );
    };
    socket.on("connect", subscribe);
    socket.on("disconnect", () => setConnected(false));
    socket.on("game-night:state", (nextView: GameNightView) => setView(nextView));
    socket.on("session:replaced", () => setError("This Game Night session was resumed in another tab."));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, view?.id]);

  useEffect(() => {
    const roomCode = view?.currentRoomCode;
    if (!view || !roomCode) return;
    const stored = readGameNightSession(view.id);
    if (!stored) {
      setError("Your Game Night identity could not be transferred to the active game.");
      return;
    }
    localStorage.setItem(`boardforge:${roomCode}:playerId`, stored.playerId);
    localStorage.setItem(`boardforge:${roomCode}:reconnectToken`, stored.reconnectToken);
    localStorage.setItem(`boardforge:${roomCode}:name`, stored.name);
    router.push(`/room/${roomCode}`);
  }, [router, view?.currentRoomCode, view?.id]);

  const assigned = useMemo(() => new Set(view?.teams.flatMap((team) => team.playerIds) ?? []), [view]);
  const unassignedPlayers = view?.players.filter((player) => !assigned.has(player.id)) ?? [];
  const selfTeamId = view?.teams.find((team) => team.playerIds.includes(view.selfPlayerId))?.id;
  const catalogContext = useMemo(
    () =>
      view
        ? JSON.stringify({
            status: view.status,
            currentRoomCode: view.currentRoomCode,
            players: view.players.map((player) => player.id),
            teams: view.teams.map((team) => ({
              id: team.id,
              playerIds: team.playerIds,
              captainPlayerId: team.captainPlayerId ?? null,
            })),
          })
        : "",
    [view],
  );

  useEffect(() => {
    if (!view || view.status === "lobby") return;
    const controller = new AbortController();
    setGamesLoading(true);
    fetch(`${apiUrl}/api/game-nights/${code}/catalog`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The game collection could not be opened.");
        return response.json() as Promise<{ games: GameNightCatalogEntry[] }>;
      })
      .then((result) => setGames(result.games))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The game collection could not be opened.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setGamesLoading(false);
      });
    return () => controller.abort();
  }, [catalogContext, code, view?.status]);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError("");
    try {
      setView(await openSession(name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something unexpected happened.");
    } finally {
      setPending(false);
    }
  }

  function selectTeam(teamId: string) {
    if (!view || teamId === selfTeamId) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("The live connection is still starting. Try again in a moment.");
      return;
    }
    setPending(true);
    setError("");
    socket.emit(
      "game-night:team:select",
      { code, playerId: view.selfPlayerId, teamId },
      (response: SocketAck<{ view: GameNightView }>) => {
        setPending(false);
        if (response.ok) setView(response.data.view);
        else setError(response.error);
      },
    );
  }

  function openBoard() {
    if (!view?.isHost) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("The live connection is still starting. Try again in a moment.");
      return;
    }
    setPending(true);
    setError("");
    socket.emit(
      "game-night:board:open",
      { code, playerId: view.selfPlayerId },
      (response: SocketAck<{ view: GameNightView }>) => {
        setPending(false);
        if (response.ok) setView(response.data.view);
        else setError(response.error);
      },
    );
  }

  function selectGame(blueprintId: string) {
    if (!view?.isHost) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("The live connection is still starting. Try again in a moment.");
      return;
    }
    setPending(true);
    setError("");
    socket.emit(
      "game-night:game:select",
      { code, playerId: view.selfPlayerId, blueprintId },
      (response: SocketAck<{ view: GameNightView }>) => {
        setPending(false);
        if (response.ok) setView(response.data.view);
        else setError(response.error);
      },
    );
  }

  function selectCaptain(teamId: string, captainPlayerId: string) {
    if (!view?.isHost) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("The live connection is still starting. Try again in a moment.");
      return;
    }
    setPending(true);
    setError("");
    socket.emit(
      "game-night:captain:select",
      { code, playerId: view.selfPlayerId, teamId, captainPlayerId },
      (response: SocketAck<{ view: GameNightView }>) => {
        setPending(false);
        if (response.ok) setView(response.data.view);
        else setError(response.error);
      },
    );
  }

  function launchGame(blueprintId: string) {
    if (!view?.isHost) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("The live connection is still starting. Try again in a moment.");
      return;
    }
    setPending(true);
    setError("");
    socket.emit(
      "game-night:game:launch",
      { code, playerId: view.selfPlayerId, blueprintId },
      (response: SocketAck<{ view: GameNightView; roomCode: string; gameInstanceId: string }>) => {
        setPending(false);
        if (response.ok) setView(response.data.view);
        else setError(response.error);
      },
    );
  }

  function completeGameNight() {
    if (!view?.isHost) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("The live connection is still starting. Try again in a moment.");
      return;
    }
    setPending(true);
    setError("");
    socket.emit(
      "game-night:complete",
      { code, playerId: view.selfPlayerId },
      (response: SocketAck<{ view: GameNightView }>) => {
        setPending(false);
        if (response.ok) setView(response.data.view);
        else setError(response.error);
      },
    );
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(`${window.location.origin}/game-night/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <span>BF</span>
        <p>Setting the table…</p>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className={styles.missing}>
        <p>Invitation unavailable</p>
        <h1>That table isn&apos;t here.</h1>
        <Link href="/">Return to BoardForge</Link>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={styles.joinPage}>
        <nav className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span>BF</span>
            <b>BoardForge</b>
          </Link>
          <div className={styles.codeMini}>
            Invitation <strong>{code}</strong>
          </div>
        </nav>
        <section className={styles.joinCard}>
          <div className={styles.joinStamp}>You&apos;re invited</div>
          <p>Game Night · {preview.playerCount} already at the table</p>
          <h1>Pull up a seat.</h1>
          <span>Enter the name your friends will recognize. You&apos;ll choose your team inside.</span>
          <form onSubmit={join}>
            <label>
              Your name
              <input
                autoComplete="name"
                maxLength={24}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Alex"
                value={name}
              />
            </label>
            <button disabled={pending || !name.trim()} type="submit">
              {pending ? "Joining…" : "Join Game Night"} <b>→</b>
            </button>
          </form>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      </main>
    );
  }

  if (view.status !== "lobby") {
    return (
      <GameNightBoard
        code={code}
        connected={connected}
        copied={copied}
        error={error}
        games={games}
        gamesLoading={gamesLoading}
        onCopyInvite={() => void copyInvite()}
        onEndGameNight={completeGameNight}
        onLaunchGame={launchGame}
        onSelectCaptain={selectCaptain}
        onSelectGame={selectGame}
        pending={pending}
        view={view}
      />
    );
  }

  const emptyTeams = view.teams.filter((team) => team.playerIds.length === 0);
  const allAssigned = unassignedPlayers.length === 0 && emptyTeams.length === 0;
  const waitingCount = unassignedPlayers.length || emptyTeams.length;
  return (
    <main className={styles.lobbyPage}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span>BF</span>
          <b>BoardForge</b>
        </Link>
        <span className={`${styles.live} ${connected ? styles.online : ""}`}>
          <i /> {connected ? "Live lobby" : "Reconnecting"}
        </span>
      </nav>

      <section className={styles.lobbyLayout}>
        <header className={styles.lobbyHeader}>
          <div>
            <p>{view.isHost ? "Your Game Night" : "Tonight's Game Night"}</p>
            <h1>The table is open.</h1>
            <span>
              {view.isHost
                ? "Share the code, then let everyone choose their side."
                : "Pick your team. You can change until the first game begins."}
            </span>
          </div>
          <button className={styles.inviteCode} onClick={() => void copyInvite()} type="button">
            <small>{copied ? "Invite copied" : "Tap to copy invite"}</small>
            <strong>{code}</strong>
            <span>{copied ? "✓ Ready to share" : "Share with your people →"}</span>
          </button>
        </header>

        <div className={styles.lobbyBody}>
          <section className={styles.teamsPanel}>
            <div className={styles.sectionHeading}>
              <span>Choose your team</span>
              <b>{view.teams.length} teams · Up to 6 each</b>
            </div>
            <div className={styles.teamGrid}>
              {view.teams.map((team, index) => {
                const members = view.players.filter((player) => team.playerIds.includes(player.id));
                const selected = team.id === selfTeamId;
                return (
                  <article
                    className={`${styles.teamCard} ${selected ? styles.selected : ""}`}
                    key={team.id}
                    style={{ "--team-color": team.color } as CSSProperties}
                  >
                    <div className={styles.teamTitle}>
                      <i>{index + 1}</i>
                      <span>
                        <small>Team</small>
                        <strong>{team.name}</strong>
                      </span>
                      <b>{members.length}</b>
                    </div>
                    <div className={styles.members}>
                      {members.length ? (
                        members.map((player) => (
                          <span className={player.id === view.selfPlayerId ? styles.self : ""} key={player.id}>
                            {player.name} {player.isHost ? <small>Host</small> : null}
                          </span>
                        ))
                      ) : (
                        <em>Waiting for its first player</em>
                      )}
                    </div>
                    <button disabled={pending || selected} onClick={() => selectTeam(team.id)} type="button">
                      {selected ? "Your team ✓" : "Join this team"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={styles.peoplePanel}>
            <div className={styles.sectionHeading}>
              <span>At the table</span>
              <b>{view.players.length}</b>
            </div>
            <div className={styles.peopleList}>
              {view.players.map((player, index) => (
                <div key={player.id}>
                  <i>{player.name.slice(0, 1).toUpperCase()}</i>
                  <span>
                    <strong>{player.name}</strong>
                    <small>
                      {player.isHost ? "Host" : assigned.has(player.id) ? "Team chosen" : "Choosing a team"}
                    </small>
                  </span>
                  <b className={player.connected ? styles.online : ""} />
                  <em>{index + 1}</em>
                </div>
              ))}
            </div>
            <div className={`${styles.readiness} ${allAssigned ? styles.ready : ""}`}>
              <i>{allAssigned ? "✓" : waitingCount}</i>
              <span>
                <strong>{allAssigned ? "Teams are ready" : "Still choosing"}</strong>
                <small>
                  {allAssigned
                    ? view.isHost
                      ? "You can choose the first game next."
                      : "The host will choose the first game."
                    : unassignedPlayers.length > 0
                      ? `${unassignedPlayers.length} ${unassignedPlayers.length === 1 ? "player needs" : "players need"} a team.`
                      : `${emptyTeams.length} ${emptyTeams.length === 1 ? "team still needs" : "teams still need"} a player.`}
                </small>
              </span>
            </div>
            {view.isHost ? (
              <button
                className={styles.openBoard}
                disabled={!allAssigned || pending || !connected}
                onClick={openBoard}
                type="button"
              >
                <span>
                  <small>{allAssigned ? "Everyone has a side" : "Waiting for the table"}</small>
                  <strong>Open the game board</strong>
                </span>
                <b>→</b>
              </button>
            ) : allAssigned ? (
              <div className={styles.hostWaiting}>
                <i />
                <span>
                  <strong>Ready when the host is</strong>
                  <small>The board will open here for everyone.</small>
                </span>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
      {error ? <p className={styles.toast}>{error}</p> : null}
    </main>
  );
}
