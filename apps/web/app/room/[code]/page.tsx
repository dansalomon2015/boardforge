"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type { ComposedGameView, GameAction, JoinRoomResult, RoomView, SocketAck } from "@boardforge/shared";
import { ComposedStageRouter } from "./composed-stages";
import { originalExperience } from "./experience-registry";
import roomChromeStyles from "./room-chrome.module.css";
import { saveGameNightSession } from "../../../lib/game-night-session";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const socketRef = useRef<Socket | null>(null);
  const viewRef = useRef<RoomView | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [roomExperienceId, setRoomExperienceId] = useState<ComposedGameView["experienceId"] | undefined>();

  function saveParentGameNightSession(result: JoinRoomResult, playerName: string) {
    if (!result.gameNightId) return;
    saveGameNightSession(result.gameNightId, {
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      name: playerName,
    });
  }

  useEffect(() => {
    fetch(`${apiUrl}/api/rooms/${code}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ game: { experienceId?: ComposedGameView["experienceId"] } }>)
          : null,
      )
      .then((room) => setRoomExperienceId(room?.game.experienceId))
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    const socket = io(apiUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const resumeSavedSession = () => {
      setConnected(true);
      const savedId = localStorage.getItem(`boardforge:${code}:playerId`);
      const savedName = localStorage.getItem(`boardforge:${code}:name`);
      const savedToken = localStorage.getItem(`boardforge:${code}:reconnectToken`);
      if (!savedId || !savedName || !savedToken) return;
      socket.emit(
        "room:join",
        { code, name: savedName, playerId: savedId, reconnectToken: savedToken },
        (response: SocketAck<JoinRoomResult>) => {
          if (response.ok) {
            setPlayerId(response.data.playerId);
            setView(response.data.view);
            localStorage.setItem(`boardforge:${code}:reconnectToken`, response.data.reconnectToken);
            saveParentGameNightSession(response.data, savedName);
          } else {
            localStorage.removeItem(`boardforge:${code}:playerId`);
            localStorage.removeItem(`boardforge:${code}:reconnectToken`);
            setError(response.error);
          }
        },
      );
    };
    socket.on("connect", resumeSavedSession);
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (nextView: RoomView) => setView(nextView));
    socket.on("session:replaced", () => setError("This session was resumed in another tab."));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  function join(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    socketRef.current?.emit("room:join", { code, name }, (response: SocketAck<JoinRoomResult>) => {
      setPending(false);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setPlayerId(response.data.playerId);
      setView(response.data.view);
      localStorage.setItem(`boardforge:${code}:playerId`, response.data.playerId);
      localStorage.setItem(`boardforge:${code}:reconnectToken`, response.data.reconnectToken);
      localStorage.setItem(`boardforge:${code}:name`, name);
      saveParentGameNightSession(response.data, name);
    });
  }

  function startGame() {
    setPending(true);
    setError("");
    socketRef.current?.emit("room:start", { code, playerId }, (response: SocketAck<{ view: RoomView }>) => {
      setPending(false);
      if (!response.ok) setError(response.error);
    });
  }

  function selectTeam(teamId: string) {
    setPending(true);
    setError("");
    socketRef.current?.emit(
      "room:team:select",
      { code, playerId, teamId },
      (response: SocketAck<{ view: Extract<RoomView, { kind: "lobby" }> }>) => {
        setPending(false);
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setView(response.data.view);
      },
    );
  }

  function selectCaptain(teamId: string, captainPlayerId: string) {
    setPending(true);
    setError("");
    socketRef.current?.emit(
      "room:captain:select",
      { code, playerId, teamId, captainPlayerId },
      (response: SocketAck<{ view: Extract<RoomView, { kind: "lobby" }> }>) => {
        setPending(false);
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setView(response.data.view);
      },
    );
  }

  function sendAction(action: GameAction) {
    if (!viewRef.current || viewRef.current.kind === "lobby") return;
    setPending(true);
    setError("");
    const idempotencyKey = crypto.randomUUID();
    const submit = (attempt: number) => {
      const currentView = viewRef.current;
      if (!currentView || currentView.kind === "lobby") {
        setPending(false);
        return;
      }
      socketRef.current?.emit(
        "game:action",
        { code, playerId, expectedRevision: currentView.revision, idempotencyKey, action },
        (response: SocketAck<{ revision: number }>) => {
          if (!response.ok && response.error.startsWith("Stale room revision") && attempt < 3) {
            window.setTimeout(() => submit(attempt + 1), 80);
            return;
          }
          setPending(false);
          if (!response.ok) setError(response.error);
        },
      );
    };
    submit(0);
  }

  const self = view?.players.find((player) => player.id === playerId);
  const experienceId =
    view?.kind === "lobby" ? view.game.experienceId : view?.kind === "composed" ? view.experienceId : roomExperienceId;
  const experience = originalExperience(experienceId);

  return (
    <main
      className={`room-shell ${experience ? roomChromeStyles.movieRoom : ""}`}
      data-original-game={experience?.dataAttribute}
    >
      <header className="room-topbar">
        <a className="brand" href="/">
          <span className="brand-mark">BF</span>
          <span>BoardForge</span>
        </a>
        <div className="room-code">
          <span>ROOM</span>
          <strong>{code}</strong>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/room/${code}`)}
          >
            Copy invite
          </button>
        </div>
        <span className={`connection ${connected ? "online" : ""}`}>
          <i />
          {connected ? "Live" : "Reconnecting"}
        </span>
      </header>

      {!view ? (
        <section className="join-panel">
          {experience ? <div className={roomChromeStyles.ticketPunch}>Admit one</div> : null}
          <p className="eyebrow">{experience ? "Your private game night" : "You are invited"}</p>
          <h1>{experience ? "Step into the room." : "Join the room"}</h1>
          <p>
            {experience
              ? "Choose the player name that will appear throughout this game."
              : "Choose the name your friends will see during the game."}
          </p>
          {experience ? (
            <div className={roomChromeStyles.joinCode}>
              <span>Invitation</span>
              <strong>{code}</strong>
              <small>{experience.displayName} · BoardForge Original</small>
            </div>
          ) : null}
          <form onSubmit={join}>
            <label htmlFor="player-name">Your player name</label>
            <input
              id="player-name"
              placeholder="e.g. Alex"
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" className="primary-button" disabled={pending || !name.trim()}>
              Enter the room <b>→</b>
            </button>
          </form>
        </section>
      ) : view.kind === "lobby" ? (
        <section className="lobby-layout">
          <div className="lobby-hero">
            {experience ? (
              <div className={roomChromeStyles.lobbyEdition}>
                <span>BoardForge Original</span>
                <b>No. {experience.editionNumber}</b>
              </div>
            ) : null}
            <p className="eyebrow">{experience?.lobbyEyebrow ?? "The table is getting ready"}</p>
            <h1>{view.game.title}</h1>
            <p>{view.game.description}</p>
            {experience ? (
              <div className={roomChromeStyles.lobbyFacts}>
                {experience.facts(view).map((fact) => (
                  <span key={fact}>{fact}</span>
                ))}
              </div>
            ) : null}
            <div className="lobby-progress">
              <span style={{ width: `${Math.min(100, (view.players.length / view.game.minPlayers) * 100)}%` }} />
            </div>
            <small>
              {view.players.length} {view.players.length === 1 ? "friend is" : "friends are"} here ·{" "}
              {view.game.minPlayers} needed to play
            </small>
            {view.teamSetup ? (
              <TeamSetup view={view} pending={pending} selectTeam={selectTeam} selectCaptain={selectCaptain} />
            ) : null}
            {self?.isHost ? (
              <button
                type="button"
                className="primary-button host-start"
                disabled={!view.canStart || pending}
                onClick={startGame}
              >
                {view.canStart
                  ? "Start the game"
                  : (view.startBlockReason ?? experience?.waitingPrompt ?? "The room is not ready yet")}{" "}
                <b>→</b>
              </button>
            ) : (
              <div className="waiting-card">
                {view.teamSetup
                  ? "The host will start when every team is ready."
                  : "The host will start when everyone is ready."}
              </div>
            )}
          </div>
          <PlayerRail view={view} />
        </section>
      ) : (
        <section className="game-layout">
          <GameStage view={view} isHost={Boolean(self?.isHost)} pending={pending} sendAction={sendAction} />
          <PlayerRail view={view} />
        </section>
      )}

      {error ? (
        <div className="toast-error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}

function TeamSetup({
  view,
  pending,
  selectTeam,
  selectCaptain,
}: {
  view: Extract<RoomView, { kind: "lobby" }>;
  pending: boolean;
  selectTeam: (teamId: string) => void;
  selectCaptain: (teamId: string, captainPlayerId: string) => void;
}) {
  if (!view.teamSetup) return null;
  const playerName = (id: string) => view.players.find((player) => player.id === id)?.name ?? "Player";
  const isHost = Boolean(view.players.find((player) => player.id === view.selfPlayerId)?.isHost);
  return (
    <section className="team-setup" aria-labelledby="team-setup-title">
      <div className="team-setup-heading">
        <div>
          <p className="preview-label">Pick your side</p>
          <h2 id="team-setup-title">Choose your team</h2>
        </div>
        <span>{view.teamSetup.allowUnevenTeams ? "Everyone is welcome" : "Keep it even"}</span>
      </div>
      <div className="team-choice-grid">
        {view.teamSetup.teams.map((team) => {
          const selected = view.teamSetup?.selfTeamId === team.id;
          const full = Boolean(team.maxMembers && team.playerIds.length >= team.maxMembers);
          const captainName = team.captainPlayerId ? playerName(team.captainPlayerId) : null;
          return (
            <article
              className={`team-choice-card ${selected ? "selected" : ""}`}
              style={{ "--team-color": team.color } as CSSProperties}
              key={team.id}
            >
              <div className="team-choice-title">
                <i />
                <strong>{team.name}</strong>
                <small>
                  {team.playerIds.length}
                  {team.maxMembers ? `/${team.maxMembers}` : ""}
                </small>
              </div>
              <div className="team-member-pills">
                {team.playerIds.length ? (
                  team.playerIds.map((id) => (
                    <span className={id === team.captainPlayerId ? "captain" : ""} key={id}>
                      {id === team.captainPlayerId ? "★ " : ""}
                      {playerName(id)}
                    </span>
                  ))
                ) : (
                  <em>Available team</em>
                )}
              </div>
              {isHost && team.playerIds.length ? (
                <label className="captain-select">
                  <span>Team captain</span>
                  <select
                    disabled={pending}
                    onChange={(event) => event.target.value && selectCaptain(team.id, event.target.value)}
                    value={team.captainPlayerId ?? ""}
                  >
                    <option value="">Choose one…</option>
                    {team.playerIds.map((id) => (
                      <option key={id} value={id}>
                        {playerName(id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : captainName ? (
                <div className="captain-display">
                  <span>★ Captain</span>
                  <strong>{captainName}</strong>
                </div>
              ) : null}
              <button type="button" disabled={pending || selected || full} onClick={() => selectTeam(team.id)}>
                {selected ? "Your team ✓" : full ? "Team full" : "Join team"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlayerRail({ view }: { view: RoomView }) {
  return (
    <aside className="player-rail">
      <div className="rail-heading">
        <span>PLAYERS</span>
        <b>{view.players.length}</b>
      </div>
      <div className="player-list">
        {view.players.map((player, index) => (
          <div className={`player-row ${player.id === view.selfPlayerId ? "self" : ""}`} key={player.id}>
            <span className={`avatar avatar-${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{player.name}</strong>
              <small>
                {view.kind === "lobby" && view.teamSetup
                  ? (view.teamSetup.teams.find((team) => team.playerIds.includes(player.id))?.name ??
                    "Waiting for team")
                  : player.isHost
                    ? "Host"
                    : player.id === view.selfPlayerId
                      ? "You"
                      : "Player"}
              </small>
            </div>
            <i className={player.connected ? "present" : ""} />
          </div>
        ))}
      </div>
      <div className="rail-footer">
        <span>One room</span>
        <span>One great night</span>
      </div>
    </aside>
  );
}

function GameStage({
  view,
  isHost,
  pending,
  sendAction,
}: {
  view: Exclude<RoomView, { kind: "lobby" }>;
  isHost: boolean;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  if (view.kind === "hidden_roles") {
    return (
      <div className="stage-panel hidden-stage">
        <div className="stage-meta">
          <span>
            ROUND {view.round}/{view.totalRounds}
          </span>
          <span>{view.phase}</span>
        </div>
        <div className={`role-card team-${view.ownRole.team}`}>
          <p>YOUR SECRET ROLE</p>
          <h1>{view.ownRole.name}</h1>
          <span>{view.ownRole.objective}</span>
        </div>
        <div className="score-strip">
          <div>
            <span>Crew</span>
            <strong>{view.scores.crew}</strong>
          </div>
          <div>
            <span>Saboteurs</span>
            <strong>{view.scores.saboteur}</strong>
          </div>
        </div>

        {view.phase === "mission" ? (
          <ActionBlock
            title="Mission decision"
            text="Everyone chooses in secret. You will only discover how many sabotages slipped through."
          >
            <button
              type="button"
              disabled={pending || view.submitted}
              onClick={() => sendAction({ type: "SUBMIT_MISSION", choice: "success" })}
            >
              Secure mission
            </button>
            {view.ownRole.team === "saboteur" ? (
              <button
                type="button"
                className="danger"
                disabled={pending || view.submitted}
                onClick={() => sendAction({ type: "SUBMIT_MISSION", choice: "sabotage" })}
              >
                Sabotage
              </button>
            ) : null}
            {view.submitted ? <p className="submitted">Decision locked. Waiting for the crew…</p> : null}
          </ActionBlock>
        ) : null}

        {view.phase === "vote" ? (
          <ActionBlock
            title={`${view.lastReveal?.sabotages ?? 0} sabotage(s) detected`}
            text="Discuss, then vote for the player you suspect."
          >
            <div className="choice-grid">
              {view.players.map((player) => (
                <button
                  type="button"
                  disabled={pending || view.submitted}
                  key={player.id}
                  onClick={() => sendAction({ type: "CAST_VOTE", targetPlayerId: player.id })}
                >
                  {player.name}
                </button>
              ))}
            </div>
            {view.submitted ? <p className="submitted">Vote locked.</p> : null}
          </ActionBlock>
        ) : null}

        {view.phase === "reveal" ? (
          <ActionBlock
            title="Round complete"
            text={`${view.lastReveal?.suspectedPlayerName ?? "No one"} drew the most suspicion.`}
          >
            {isHost ? (
              <button type="button" disabled={pending} onClick={() => sendAction({ type: "ADVANCE" })}>
                Start next round →
              </button>
            ) : (
              <p className="submitted">Waiting for the host…</p>
            )}
          </ActionBlock>
        ) : null}

        {view.phase === "completed" ? (
          <div className="winner-card">
            <p>GAME COMPLETE</p>
            <h2>{view.winner === "crew" ? "Crew wins" : "Saboteurs win"}</h2>
            <a href="/">Forge another game →</a>
          </div>
        ) : null}
      </div>
    );
  }

  if (view.kind === "composed") {
    return <ComposedStageRouter view={view} isHost={isHost} pending={pending} sendAction={sendAction} />;
  }

  const selfScore = view.scores[view.selfPlayerId] ?? 0;
  const selectedName = view.players.find((player) => player.id === view.reveal?.mostVotedPlayerId)?.name;
  return (
    <div className="stage-panel quiz-stage">
      <div className="stage-meta">
        <span>
          QUESTION {view.round}/{view.totalRounds}
        </span>
        <span>{view.phase}</span>
      </div>
      <div className="quiz-score">
        <span>Your score</span>
        <strong>{selfScore}</strong>
      </div>
      <div className="question-card">
        <p>{view.question.type === "trivia" ? "QUICK QUIZ" : "GROUP VOTE"}</p>
        <h1>{view.question.prompt}</h1>
      </div>

      {view.phase === "answer" && view.question.type === "trivia" ? (
        <ActionBlock title="Lock your answer" text="Answers stay private until everyone has chosen.">
          <div className="choice-grid options">
            {view.question.options?.map((option) => (
              <button
                type="button"
                key={option.id}
                disabled={pending || view.submitted}
                onClick={() => sendAction({ type: "SUBMIT_ANSWER", optionId: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
          {view.submitted ? <p className="submitted">Answer locked.</p> : null}
        </ActionBlock>
      ) : null}

      {view.phase === "answer" && view.question.type === "player_vote" ? (
        <ActionBlock title="Cast your vote" text="Votes remain anonymous until the reveal.">
          <div className="choice-grid">
            {view.players.map((player) => (
              <button
                type="button"
                key={player.id}
                disabled={pending || view.submitted}
                onClick={() => sendAction({ type: "CAST_PLAYER_VOTE", targetPlayerId: player.id })}
              >
                {player.name}
              </button>
            ))}
          </div>
          {view.submitted ? <p className="submitted">Vote locked.</p> : null}
        </ActionBlock>
      ) : null}

      {view.phase === "reveal" ? (
        <ActionBlock
          title={selectedName ? `${selectedName} wins the group vote` : "Answer revealed"}
          text={view.reveal?.explanation ?? "Round complete."}
        >
          {isHost ? (
            <button type="button" disabled={pending} onClick={() => sendAction({ type: "ADVANCE" })}>
              {view.round === view.totalRounds ? "Reveal final scores" : "Next question"} →
            </button>
          ) : (
            <p className="submitted">Waiting for the host…</p>
          )}
        </ActionBlock>
      ) : null}

      {view.phase === "completed" ? (
        <div className="winner-card">
          <p>FINAL SCORE</p>
          <h2>{view.winnerPlayerIds?.includes(view.selfPlayerId) ? "You win!" : "Game complete"}</h2>
          <a href="/">Forge another game →</a>
        </div>
      ) : null}
    </div>
  );
}

function ActionBlock({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="action-block">
      <div>
        <p className="eyebrow">YOUR MOVE</p>
        <h2>{title}</h2>
        <span>{text}</span>
      </div>
      <div className="action-controls">{children}</div>
    </div>
  );
}
