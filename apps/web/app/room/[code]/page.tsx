"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type { ComposedGameView, ComposedTheme, GameAction, JoinRoomResult, RoomView, SocketAck } from "@boardforge/shared";
import {
  Buzzer,
  CardDeck,
  CardZone,
  ChallengeCard,
  ClueList,
  ChoiceGrid,
  DrawingCanvas,
  GameBoard,
  GameButton,
  GameHeader,
  GameSurface,
  GameTimer,
  MatchingBoard,
  MediaPanel,
  OrderingBoard,
  OutcomeBanner,
  PlayerStrip,
  PromptCard,
  RandomizerPanel,
  ResourcePanel,
  RevealPanel,
  RoundTracker,
  ScoreBoard,
  TeamBoard,
  TextAnswer,
  TurnIndicator,
  type GameTheme,
  type GameThemeInput,
  type GameThemeName,
  type SketchStroke,
} from "../../../components/game-ui";
import movieMimeStyles from "./movie-mime.module.css";
import roomChromeStyles from "./room-chrome.module.css";
import soundCheckStyles from "./sound-check.module.css";
import storyChainStyles from "./story-chain.module.css";
import wordDuelStyles from "./word-duel.module.css";

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
  const [roomTitle, setRoomTitle] = useState("");

  useEffect(() => {
    fetch(`${apiUrl}/api/rooms/${code}`)
      .then((response) => response.ok ? response.json() as Promise<{ game: { title: string } }> : null)
      .then((room) => setRoomTitle(room?.game.title ?? ""))
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    const socket = io(apiUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (nextView: RoomView) => setView(nextView));
    socket.on("session:replaced", () => setError("This session was resumed in another tab."));

    const savedId = localStorage.getItem(`boardforge:${code}:playerId`);
    const savedName = localStorage.getItem(`boardforge:${code}:name`);
    const savedToken = localStorage.getItem(`boardforge:${code}:reconnectToken`);
    if (savedId && savedName && savedToken) {
      setName(savedName);
      socket.emit(
        "room:join",
        { code, name: savedName, playerId: savedId, reconnectToken: savedToken },
        (response: SocketAck<JoinRoomResult>) => {
          if (response.ok) {
            setPlayerId(response.data.playerId);
            setView(response.data.view);
            localStorage.setItem(`boardforge:${code}:reconnectToken`, response.data.reconnectToken);
          } else {
            localStorage.removeItem(`boardforge:${code}:playerId`);
            localStorage.removeItem(`boardforge:${code}:reconnectToken`);
            setError(response.error);
          }
        },
      );
    }

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
    socketRef.current?.emit(
      "room:join",
      { code, name },
      (response: SocketAck<JoinRoomResult>) => {
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
      },
    );
  }

  function startGame() {
    setPending(true);
    setError("");
    socketRef.current?.emit(
      "room:start",
      { code, playerId },
      (response: SocketAck<{ view: RoomView }>) => {
        setPending(false);
        if (!response.ok) setError(response.error);
      },
    );
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
  const currentTitle = view?.kind === "lobby" ? view.game.title : view?.kind === "composed" ? view.title : roomTitle;
  const isMovieMime = currentTitle === "CinéMimes" || currentTitle === "CineMimes";
  const isWordTrap = currentTitle === "WordTrap";
  const isDrawBattle = currentTitle === "DrawBattle";
  const isSoundCheck = currentTitle === "SoundCheck";
  const isStoryChain = currentTitle === "StoryChain";
  const isWordDuel = currentTitle === "WordDuel";
  const isOriginal = isMovieMime || isWordTrap || isDrawBattle || isSoundCheck || isStoryChain || isWordDuel;

  return (
    <main className={`room-shell ${isOriginal ? roomChromeStyles.movieRoom : ""}`} data-original-game={isWordDuel ? "word-duel" : isStoryChain ? "story-chain" : isSoundCheck ? "sound-check" : isDrawBattle ? "draw-battle" : isWordTrap ? "word-trap" : isMovieMime ? "cinemimes" : undefined}>
      <header className="room-topbar">
        <a className="brand" href="/"><span className="brand-mark">BF</span><span>BoardForge</span></a>
        <div className="room-code"><span>ROOM</span><strong>{code}</strong><button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/room/${code}`)}>Copy invite</button></div>
        <span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "Live" : "Reconnecting"}</span>
      </header>

      {!view ? (
        <section className="join-panel">
          {isOriginal ? <div className={roomChromeStyles.ticketPunch}>Admit one</div> : null}
          <p className="eyebrow">{isOriginal ? "Your private game night" : "You are invited"}</p>
          <h1>{isOriginal ? "Step into the room." : "Join the room"}</h1>
          <p>{isOriginal ? "Choose the player name that will appear throughout this game." : "Choose the name your friends will see during the game."}</p>
          {isOriginal ? <div className={roomChromeStyles.joinCode}><span>Invitation</span><strong>{code}</strong><small>{isWordDuel ? "WordDuel" : isStoryChain ? "StoryChain" : isSoundCheck ? "SoundCheck" : isDrawBattle ? "DrawBattle" : isWordTrap ? "WordTrap" : "CineMimes"} · BoardForge Original</small></div> : null}
          <form onSubmit={join}>
            <label htmlFor="player-name">Your player name</label>
            <input id="player-name" autoFocus placeholder="e.g. Alex" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
            <button className="primary-button" disabled={pending || !name.trim()}>Enter the room <b>→</b></button>
          </form>
        </section>
      ) : view.kind === "lobby" ? (
        <section className="lobby-layout">
          <div className="lobby-hero">
            {isOriginal ? <div className={roomChromeStyles.lobbyEdition}><span>BoardForge Original</span><b>No. {isWordDuel ? "06" : isStoryChain ? "05" : isSoundCheck ? "04" : isDrawBattle ? "03" : isWordTrap ? "02" : "01"}</b></div> : null}
            <p className="eyebrow">{isWordDuel ? "The challenger is waiting" : isStoryChain ? "The first page is waiting" : isSoundCheck ? "The studio is warming up" : isDrawBattle ? "The gallery is opening" : isWordTrap ? "Teams are entering the trap" : isMovieMime ? "Casting in progress" : "The table is getting ready"}</p>
            <h1>{view.game.title}</h1>
            <p>{view.game.description}</p>
            {isOriginal ? <div className={roomChromeStyles.lobbyFacts}>{isWordDuel ? <><span>W Secret words</span><span>⌨ Playable keyboard</span><span>⚔ Exactly 2 players</span></> : isStoryChain ? <><span>✦ One shared story</span><span>⌁ Secret twists</span><span>♡ No teams, no score</span></> : <><span>{isSoundCheck ? "◖ Voice-only sounds" : isDrawBattle ? "✎ Live drawing" : isWordTrap ? "⚡ Forbidden words" : "🎬 Movie charades"}</span><span>⏱ {isDrawBattle ? "75" : "60"} seconds</span><span>✦ {view.teamSetup?.teams.length ?? 2} teams</span></>}</div> : null}
            <div className="lobby-progress"><span style={{ width: `${Math.min(100, (view.players.length / view.game.minPlayers) * 100)}%` }} /></div>
            <small>{view.players.length} {view.players.length === 1 ? "friend is" : "friends are"} here · {view.game.minPlayers} needed to play</small>
            {view.teamSetup ? <TeamSetup view={view} pending={pending} selectTeam={selectTeam} selectCaptain={selectCaptain} /> : null}
            {self?.isHost ? (
              <button className="primary-button host-start" disabled={!view.canStart || pending} onClick={startGame}>
                {view.canStart ? "Start the game" : isWordDuel ? "Invite your rival" : isStoryChain ? "Invite one more storyteller" : view.startBlockReason ?? "The room is not ready yet"} <b>→</b>
              </button>
            ) : <div className="waiting-card">{view.teamSetup ? "The host will start when every team is ready." : "The host will start when everyone is ready."}</div>}
          </div>
          <PlayerRail view={view} />
        </section>
      ) : (
        <section className="game-layout">
          <GameStage view={view} isHost={Boolean(self?.isHost)} pending={pending} sendAction={sendAction} />
          <PlayerRail view={view} />
        </section>
      )}

      {error ? <div className="toast-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div> : null}
    </main>
  );
}

function TeamSetup({ view, pending, selectTeam, selectCaptain }: {
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
        <div><p className="preview-label">Pick your side</p><h2 id="team-setup-title">Choose your team</h2></div>
        <span>{view.teamSetup.allowUnevenTeams ? "Everyone is welcome" : "Keep it even"}</span>
      </div>
      <div className="team-choice-grid">
        {view.teamSetup.teams.map((team) => {
          const selected = view.teamSetup?.selfTeamId === team.id;
          const full = Boolean(team.maxMembers && team.playerIds.length >= team.maxMembers);
          const captainName = team.captainPlayerId ? playerName(team.captainPlayerId) : null;
          return (
            <article className={`team-choice-card ${selected ? "selected" : ""}`} style={{ "--team-color": team.color } as CSSProperties} key={team.id}>
              <div className="team-choice-title"><i /><strong>{team.name}</strong><small>{team.playerIds.length}{team.maxMembers ? `/${team.maxMembers}` : ""}</small></div>
              <div className="team-member-pills">
                {team.playerIds.length ? team.playerIds.map((id) => <span className={id === team.captainPlayerId ? "captain" : ""} key={id}>{id === team.captainPlayerId ? "★ " : ""}{playerName(id)}</span>) : <em>Available team</em>}
              </div>
              {isHost && team.playerIds.length ? (
                <label className="captain-select">
                  <span>Team captain</span>
                  <select disabled={pending} onChange={(event) => event.target.value && selectCaptain(team.id, event.target.value)} value={team.captainPlayerId ?? ""}>
                    <option value="">Choose one…</option>
                    {team.playerIds.map((id) => <option key={id} value={id}>{playerName(id)}</option>)}
                  </select>
                </label>
              ) : captainName ? <div className="captain-display"><span>★ Captain</span><strong>{captainName}</strong></div> : null}
              <button disabled={pending || selected || full} onClick={() => selectTeam(team.id)}>
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
      <div className="rail-heading"><span>PLAYERS</span><b>{view.players.length}</b></div>
      <div className="player-list">
        {view.players.map((player, index) => (
          <div className={`player-row ${player.id === view.selfPlayerId ? "self" : ""}`} key={player.id}>
            <span className={`avatar avatar-${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</span>
            <div><strong>{player.name}</strong><small>{view.kind === "lobby" && view.teamSetup ? view.teamSetup.teams.find((team) => team.playerIds.includes(player.id))?.name ?? "Waiting for team" : player.isHost ? "Host" : player.id === view.selfPlayerId ? "You" : "Player"}</small></div>
            <i className={player.connected ? "present" : ""} />
          </div>
        ))}
      </div>
      <div className="rail-footer"><span>One room</span><span>One great night</span></div>
    </aside>
  );
}

function GameStage({ view, isHost, pending, sendAction }: {
  view: Exclude<RoomView, { kind: "lobby" }>;
  isHost: boolean;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  if (view.kind === "hidden_roles") {
    return (
      <div className="stage-panel hidden-stage">
        <div className="stage-meta"><span>ROUND {view.round}/{view.totalRounds}</span><span>{view.phase}</span></div>
        <div className={`role-card team-${view.ownRole.team}`}>
          <p>YOUR SECRET ROLE</p><h1>{view.ownRole.name}</h1><span>{view.ownRole.objective}</span>
        </div>
        <div className="score-strip"><div><span>Crew</span><strong>{view.scores.crew}</strong></div><div><span>Saboteurs</span><strong>{view.scores.saboteur}</strong></div></div>

        {view.phase === "mission" ? (
          <ActionBlock title="Mission decision" text="Everyone chooses in secret. You will only discover how many sabotages slipped through.">
            <button disabled={pending || view.submitted} onClick={() => sendAction({ type: "SUBMIT_MISSION", choice: "success" })}>Secure mission</button>
            {view.ownRole.team === "saboteur" ? <button className="danger" disabled={pending || view.submitted} onClick={() => sendAction({ type: "SUBMIT_MISSION", choice: "sabotage" })}>Sabotage</button> : null}
            {view.submitted ? <p className="submitted">Decision locked. Waiting for the crew…</p> : null}
          </ActionBlock>
        ) : null}

        {view.phase === "vote" ? (
          <ActionBlock title={`${view.lastReveal?.sabotages ?? 0} sabotage(s) detected`} text="Discuss, then vote for the player you suspect.">
            <div className="choice-grid">{view.players.map((player) => <button disabled={pending || view.submitted} key={player.id} onClick={() => sendAction({ type: "CAST_VOTE", targetPlayerId: player.id })}>{player.name}</button>)}</div>
            {view.submitted ? <p className="submitted">Vote locked.</p> : null}
          </ActionBlock>
        ) : null}

        {view.phase === "reveal" ? (
          <ActionBlock title="Round complete" text={`${view.lastReveal?.suspectedPlayerName ?? "No one"} drew the most suspicion.`}>
            {isHost ? <button disabled={pending} onClick={() => sendAction({ type: "ADVANCE" })}>Start next round →</button> : <p className="submitted">Waiting for the host…</p>}
          </ActionBlock>
        ) : null}

        {view.phase === "completed" ? <div className="winner-card"><p>GAME COMPLETE</p><h2>{view.winner === "crew" ? "Crew wins" : "Saboteurs win"}</h2><a href="/">Forge another game →</a></div> : null}
      </div>
    );
  }

  if (view.kind === "composed") {
    if (view.title === "CinéMimes" || view.title === "CineMimes") {
      return <MovieMimeStage view={view} pending={pending} sendAction={sendAction} />;
    }
    if (view.title === "WordTrap") return <WordTrapStage view={view} pending={pending} sendAction={sendAction} />;
    if (view.title === "DrawBattle") return <DrawBattleStage view={view} pending={pending} sendAction={sendAction} />;
    if (view.title === "SoundCheck") return <SoundCheckStage view={view} pending={pending} sendAction={sendAction} />;
    if (view.title === "StoryChain") return <StoryChainStage view={view} pending={pending} sendAction={sendAction} />;
    if (view.title === "WordDuel") return <WordDuelStage view={view} pending={pending} sendAction={sendAction} />;
    return <ComposedStage view={view} pending={pending} sendAction={sendAction} />;
  }

  const selfScore = view.scores[view.selfPlayerId] ?? 0;
  const selectedName = view.players.find((player) => player.id === view.reveal?.mostVotedPlayerId)?.name;
  return (
    <div className="stage-panel quiz-stage">
      <div className="stage-meta"><span>QUESTION {view.round}/{view.totalRounds}</span><span>{view.phase}</span></div>
      <div className="quiz-score"><span>Your score</span><strong>{selfScore}</strong></div>
      <div className="question-card"><p>{view.question.type === "trivia" ? "QUICK QUIZ" : "GROUP VOTE"}</p><h1>{view.question.prompt}</h1></div>

      {view.phase === "answer" && view.question.type === "trivia" ? (
        <ActionBlock title="Lock your answer" text="Answers stay private until everyone has chosen.">
          <div className="choice-grid options">{view.question.options?.map((option) => <button key={option.id} disabled={pending || view.submitted} onClick={() => sendAction({ type: "SUBMIT_ANSWER", optionId: option.id })}>{option.label}</button>)}</div>
          {view.submitted ? <p className="submitted">Answer locked.</p> : null}
        </ActionBlock>
      ) : null}

      {view.phase === "answer" && view.question.type === "player_vote" ? (
        <ActionBlock title="Cast your vote" text="Votes remain anonymous until the reveal.">
          <div className="choice-grid">{view.players.map((player) => <button key={player.id} disabled={pending || view.submitted} onClick={() => sendAction({ type: "CAST_PLAYER_VOTE", targetPlayerId: player.id })}>{player.name}</button>)}</div>
          {view.submitted ? <p className="submitted">Vote locked.</p> : null}
        </ActionBlock>
      ) : null}

      {view.phase === "reveal" ? (
        <ActionBlock title={selectedName ? `${selectedName} wins the group vote` : "Answer revealed"} text={view.reveal?.explanation ?? "Round complete."}>
          {isHost ? <button disabled={pending} onClick={() => sendAction({ type: "ADVANCE" })}>{view.round === view.totalRounds ? "Reveal final scores" : "Next question"} →</button> : <p className="submitted">Waiting for the host…</p>}
        </ActionBlock>
      ) : null}

      {view.phase === "completed" ? <div className="winner-card"><p>FINAL SCORE</p><h2>{view.winnerPlayerIds?.includes(view.selfPlayerId) ? "You win!" : "Game complete"}</h2><a href="/">Forge another game →</a></div> : null}
    </div>
  );
}

function themeForRoom(theme: ComposedTheme): GameThemeInput {
  if (typeof theme === "string") return theme as GameThemeName;
  const customTheme: GameTheme = {
    id: theme.id,
    name: theme.name,
    emoji: "🎲",
    description: "Custom atmosphere defined by the GameSpec.",
    colors: theme.colors,
    radius: theme.radius,
    shadow: "0 18px 55px rgba(0, 0, 0, .2)",
  };
  return customTheme;
}

function MovieMimeStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
  const activeTeam = view.teams.find((team) => team.id === activeTeamId);
  const activeCaptainId = activeTeamId ? view.captainByTeam[activeTeamId] : undefined;
  const isActiveCaptain = view.selfPlayerId === activeCaptainId;
  const selectMimerAction = view.availableActions.find((action) => action.id === "select_mimer");
  const drawAction = view.availableActions.find((action) => action.id === "draw_film");
  const successAction = view.availableActions.find((action) => action.id === "film_guessed");
  const passAction = view.availableActions.find((action) => action.id === "film_passed");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as {
    prompt?: string;
    hint?: string;
    icon?: string;
  } | undefined;
  const winnerNames = view.winner?.kind === "teams"
    ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean)
    : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  return (
    <GameSurface theme={theme} className={movieMimeStyles.stage}>
      <header className={movieMimeStyles.header}>
        <div>
          <span>BoardForge Original</span>
          <strong>CineMimes</strong>
        </div>
        <div className={movieMimeStyles.progress}>
          <small>Movie</small><b>{Math.min(view.round, view.totalRounds)}</b><i>/</i><span>{view.totalRounds}</span>
        </div>
      </header>

      <div className={movieMimeStyles.scoreboard}>
        {view.teams.map((team) => (
          <div className={team.id === activeTeamId ? movieMimeStyles.activeTeam : ""} key={team.id}>
            <i style={{ background: team.color }} />
            <span>{team.name}</span>
            <strong>{view.scores.teams[team.id] ?? 0}</strong>
          </div>
        ))}
      </div>

      {view.status === "completed" ? (
        <section className={movieMimeStyles.final}>
          <span>That is a wrap</span>
          <div className={movieMimeStyles.trophy}>✦</div>
          <h1>{winnerNames.join(" & ") || "Perfect tie"}</h1>
          <p>{winnerNames.length ? "wins tonight’s box office." : "The teams share top billing."}</p>
          <a href="/">Back to the collection <b>→</b></a>
        </section>
      ) : view.phase.id === "select_mimer" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{activeTeam?.name ?? "The active team"} is up</p>
          <h1>{isActiveCaptain ? "Choose your performer." : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}</h1>
          <span>
            {isActiveCaptain
              ? "You are this team’s captain. Choose who will act out the next movie."
              : "The next performer will step into the spotlight in a moment."}
          </span>
          <div className={movieMimeStyles.castGrid}>
            {activeTeam?.playerIds.map((id, index) => {
              const player = view.players.find((candidate) => candidate.id === id);
              return (
                <button
                  disabled={pending || !selectMimerAction}
                  key={id}
                  onClick={() => selectMimerAction && perform(selectMimerAction.id, { targetPlayerId: id })}
                >
                  <i>{player?.name.slice(0, 1).toUpperCase() ?? "?"}</i>
                  <span><small>{index === 0 ? "In the cast" : "Ready to play"}</small><strong>{player?.name ?? "Player"}</strong></span>
                  <b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b>
                </button>
              );
            })}
          </div>
          {!isActiveCaptain ? <em>Only the captain of {activeTeam?.name ?? "the active team"} can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{isActivePlayer ? "You are in the spotlight" : "Next performer"}</p>
          <h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>
            {isActivePlayer
              ? "Only you can see the title. Keep the screen close and get ready to perform."
              : "Look away while the performer studies the secret movie."}
          </span>
          <div className={movieMimeStyles.secretCard}>
            <small>Secret movie</small>
            <strong>?</strong>
            <i>🎬</i>
          </div>
          {drawAction ? (
            <button disabled={pending} onClick={() => perform(drawAction.id)}>
              <span>{pending ? "Opening the reel…" : "Reveal my movie"}</span><b>↗</b>
            </button>
          ) : <em>Waiting for {activePlayer?.name ?? "the performer"}…</em>}
        </section>
      ) : (
        <section className={movieMimeStyles.mimeStage}>
          <div className={movieMimeStyles.mimeHeading}>
            <div>
              <p>Lights, camera, mime!</p>
              <h1>{isActivePlayer ? "Make them guess it." : `${activePlayer?.name ?? "The performer"} is on stage.`}</h1>
            </div>
            <div className={movieMimeStyles.timer}><i /><span>60</span><small>seconds</small></div>
          </div>

          {isActivePlayer && prompt?.prompt ? (
            <div className={movieMimeStyles.revealedCard}>
              <div><span>Your movie</span><i>{prompt.icon ?? "🎭"}</i></div>
              <h2>{prompt.prompt}</h2>
              {prompt.hint ? <p>{prompt.hint}</p> : null}
              <small>No speaking · No writing · Do not show the screen</small>
            </div>
          ) : (
            <div className={movieMimeStyles.audienceCard}>
              <strong>?</strong>
              <div><span>The title stays private</span><p>Watch the performance and call out your guesses.</p></div>
            </div>
          )}

          <div className={movieMimeStyles.mimeActions}>
            {successAction ? <button className={movieMimeStyles.success} disabled={pending} onClick={() => perform(successAction.id)}>✓ Movie guessed</button> : null}
            {passAction ? <button className={movieMimeStyles.pass} disabled={pending} onClick={() => perform(passAction.id)}>Pass movie</button> : null}
            {!successAction && !passAction ? <span>Only the performer can confirm the result.</span> : null}
          </div>
        </section>
      )}
    </GameSurface>
  );
}

function WordTrapStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
  const activeTeam = view.teams.find((team) => team.id === activeTeamId);
  const activeCaptainId = activeTeamId ? view.captainByTeam[activeTeamId] : undefined;
  const isActiveCaptain = view.selfPlayerId === activeCaptainId;
  const selectAction = view.availableActions.find((action) => action.id === "select_clue_giver");
  const drawAction = view.availableActions.find((action) => action.id === "draw_word");
  const guessedAction = view.availableActions.find((action) => action.id === "word_guessed");
  const passAction = view.availableActions.find((action) => action.id === "word_passed");
  const forbiddenAction = view.availableActions.find((action) => action.id === "forbidden_called");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as { prompt?: string; hint?: string } | undefined;
  const forbiddenWords = prompt?.hint?.replace(/^DO NOT SAY:\s*/i, "").split(" · ").filter(Boolean) ?? [];
  const winnerNames = view.winner?.kind === "teams" ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean) : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  return (
    <GameSurface theme={theme} className={movieMimeStyles.stage}>
      <header className={movieMimeStyles.header}>
        <div><span>BoardForge Original</span><strong>WordTrap</strong></div>
        <div className={movieMimeStyles.progress}><small>Card</small><b>{Math.min(view.round, view.totalRounds)}</b><i>/</i><span>{view.totalRounds}</span></div>
      </header>
      <div className={movieMimeStyles.scoreboard}>
        {view.teams.map((team) => <div className={team.id === activeTeamId ? movieMimeStyles.activeTeam : ""} key={team.id}><i style={{ background: team.color }} /><span>{team.name}</span><strong>{view.scores.teams[team.id] ?? 0}</strong></div>)}
      </div>

      {view.status === "completed" ? (
        <section className={movieMimeStyles.final}>
          <span>The trap is closed</span><div className={movieMimeStyles.trophy}>⚡</div>
          <h1>{winnerNames.join(" & ") || "Perfect tie"}</h1>
          <p>{winnerNames.length ? "wins the battle of words." : "The teams share the final point."}</p>
          <a href="/">Back to the collection <b>→</b></a>
        </section>
      ) : view.phase.id === "select_clue_giver" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} /><p>{activeTeam?.name ?? "The active team"} is up</p>
          <h1>{isActiveCaptain ? "Choose your clue giver." : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}</h1>
          <span>{isActiveCaptain ? "Pick the player who will navigate the forbidden words on the next card." : "The next clue giver will step into the trap in a moment."}</span>
          <div className={movieMimeStyles.castGrid}>
            {activeTeam?.playerIds.map((id) => {
              const player = view.players.find((candidate) => candidate.id === id);
              return <button disabled={pending || !selectAction} key={id} onClick={() => selectAction && perform(selectAction.id, { targetPlayerId: id })}>
                <i>{player?.name.slice(0, 1).toUpperCase() ?? "?"}</i><span><small>Ready to play</small><strong>{player?.name ?? "Player"}</strong></span><b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b>
              </button>;
            })}
          </div>
          {!isActiveCaptain ? <em>Only the active team captain can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} /><p>{isActivePlayer ? "You are entering the trap" : "Next clue giver"}</p>
          <h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>{isActivePlayer ? "Only you can see the card. Keep the screen close and choose every clue carefully." : "Look away while the clue giver studies the secret card."}</span>
          <div className={movieMimeStyles.secretCard}><small>Secret word</small><strong>⚡</strong><i>?</i></div>
          {drawAction ? <button disabled={pending} onClick={() => perform(drawAction.id)}><span>{pending ? "Opening the trap…" : "Reveal my card"}</span><b>↗</b></button> : <em>Waiting for {activePlayer?.name ?? "the clue giver"}…</em>}
        </section>
      ) : (
        <section className={movieMimeStyles.mimeStage}>
          <div className={movieMimeStyles.mimeHeading}>
            <div><p>Choose every word carefully</p><h1>{isActivePlayer ? "Make them guess it." : `${activePlayer?.name ?? "The clue giver"} is live.`}</h1></div>
            <div className={movieMimeStyles.timer}><i /><span>60</span><small>seconds</small></div>
          </div>
          {isActivePlayer && prompt?.prompt ? (
            <div className={`${movieMimeStyles.revealedCard} ${movieMimeStyles.trapCard}`}>
              <div><span>Your target word</span><i>⚡</i></div><h2>{prompt.prompt}</h2>
              <p className={movieMimeStyles.trapLabel}>Do not say</p>
              <div className={movieMimeStyles.forbiddenList}>{forbiddenWords.map((word) => <b key={word}>{word}</b>)}</div>
              <small>No rhymes · No translations · No spelling · Do not show the screen</small>
            </div>
          ) : (
            <div className={movieMimeStyles.audienceCard}><strong>?</strong><div><span>The card stays private</span><p>{forbiddenAction ? "Listen closely. Buzz the moment the clue giver says a forbidden word." : "Call out guesses before the timer runs out."}</p></div></div>
          )}
          <div className={movieMimeStyles.mimeActions}>
            {guessedAction ? <button className={movieMimeStyles.success} disabled={pending} onClick={() => perform(guessedAction.id)}>✓ Word guessed</button> : null}
            {passAction ? <button className={movieMimeStyles.pass} disabled={pending} onClick={() => perform(passAction.id)}>Pass card</button> : null}
            {forbiddenAction ? <button className={movieMimeStyles.buzzerAction} disabled={pending} onClick={() => perform(forbiddenAction.id)}>⚡ Forbidden word!</button> : null}
            {!guessedAction && !passAction && !forbiddenAction ? <span>Watch, listen, and help your team.</span> : null}
          </div>
        </section>
      )}
    </GameSurface>
  );
}

function DrawBattleStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [guess, setGuess] = useState("");
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
  const activeTeam = view.teams.find((team) => team.id === activeTeamId);
  const activeCaptainId = activeTeamId ? view.captainByTeam[activeTeamId] : undefined;
  const isActiveCaptain = view.selfPlayerId === activeCaptainId;
  const selectAction = view.availableActions.find((action) => action.id === "select_artist");
  const drawAction = view.availableActions.find((action) => action.id === "draw_prompt");
  const sketchAction = view.availableActions.find((action) => action.id === "draw_stroke");
  const guessAction = view.availableActions.find((action) => action.id === "submit_guess");
  const passAction = view.availableActions.find((action) => action.id === "pass_prompt");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as { prompt?: string; hint?: string } | undefined;
  const canvas = view.components.find((component) => component.kind === "drawing")?.data as { label?: string; strokes?: SketchStroke[] } | undefined;
  const strokes = canvas?.strokes ?? [];
  const winnerNames = view.winner?.kind === "teams" ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean) : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  function updateCanvas(next: SketchStroke[]) {
    if (!sketchAction) return;
    if (next.length === 0 && strokes.length > 0) perform(sketchAction.id, { clear: true });
    else if (next.length > strokes.length) {
      const stroke = next.at(-1);
      if (stroke) perform(sketchAction.id, { stroke });
    }
  }

  return (
    <GameSurface theme={theme} className={`${movieMimeStyles.stage} ${movieMimeStyles.drawBattleStage}`}>
      <header className={movieMimeStyles.header}>
        <div><span>BoardForge Original</span><strong>DrawBattle</strong></div>
        <div className={movieMimeStyles.progress}><small>Canvas</small><b>{Math.min(view.round, view.totalRounds)}</b><i>/</i><span>{view.totalRounds}</span></div>
      </header>
      <div className={movieMimeStyles.scoreboard}>
        {view.teams.map((team) => <div className={team.id === activeTeamId ? movieMimeStyles.activeTeam : ""} key={team.id}><i style={{ background: team.color }} /><span>{team.name}</span><strong>{view.scores.teams[team.id] ?? 0}</strong></div>)}
      </div>

      {view.status === "completed" ? (
        <section className={movieMimeStyles.final}><span>The gallery is complete</span><div className={movieMimeStyles.trophy}>✎</div><h1>{winnerNames.join(" & ") || "Perfect tie"}</h1><p>{winnerNames.length ? "wins tonight’s drawing battle." : "The teams share the final frame."}</p><a href="/">Back to the collection <b>→</b></a></section>
      ) : view.phase.id === "select_artist" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} /><p>{activeTeam?.name ?? "The active team"} owns the next canvas</p>
          <h1>{isActiveCaptain ? "Choose your artist." : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}</h1>
          <span>{isActiveCaptain ? "Pick the player who will turn the next secret idea into art." : "The next artist will take over the canvas in a moment."}</span>
          <div className={movieMimeStyles.castGrid}>{activeTeam?.playerIds.map((id) => {
            const player = view.players.find((candidate) => candidate.id === id);
            return <button disabled={pending || !selectAction} key={id} onClick={() => selectAction && perform(selectAction.id, { targetPlayerId: id })}><i>{player?.name.slice(0, 1).toUpperCase() ?? "?"}</i><span><small>Ready to draw</small><strong>{player?.name ?? "Player"}</strong></span><b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b></button>;
          })}</div>
          {!isActiveCaptain ? <em>Only the active team captain can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw_prompt" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} /><p>{isActivePlayer ? "Your canvas is ready" : "Next artist"}</p><h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>{isActivePlayer ? "Only you can see the idea. Tilt the screen away and get ready to draw." : "Look away while the artist discovers the secret idea."}</span>
          <div className={movieMimeStyles.secretCard}><small>Secret idea</small><strong>✎</strong><i>?</i></div>
          {drawAction ? <button disabled={pending} onClick={() => perform(drawAction.id)}><span>{pending ? "Opening the sketchbook…" : "Reveal my idea"}</span><b>↗</b></button> : <em>Waiting for {activePlayer?.name ?? "the artist"}…</em>}
        </section>
      ) : (
        <section className={movieMimeStyles.drawingRoom}>
          <div className={movieMimeStyles.mimeHeading}><div><p>Every line is live</p><h1>{isActivePlayer ? "Draw the secret." : `What is ${activePlayer?.name ?? "the artist"} drawing?`}</h1></div><div className={movieMimeStyles.timer}><i /><span>75</span><small>seconds</small></div></div>
          <div className={movieMimeStyles.drawingGrid}>
            <div className={movieMimeStyles.liveCanvas}>
              <DrawingCanvas theme={theme} strokes={strokes} onChange={updateCanvas} label={canvas?.label ?? "Live canvas"} disabled={pending || !sketchAction} />
              <div className={movieMimeStyles.canvasStatus}><span><i /> Everyone sees every line</span><b>{strokes.length} stroke{strokes.length === 1 ? "" : "s"}</b></div>
            </div>
            <aside className={movieMimeStyles.drawingSidebar}>
              {isActivePlayer && prompt?.prompt ? <div className={movieMimeStyles.artistPrompt}><small>Your secret idea</small><h2>{prompt.prompt}</h2><span>{prompt.hint}</span><p>Draw only · No letters · No numbers · No gestures</p></div> : <div className={movieMimeStyles.guessPanel}><small>Shout it out</small><h2>Name the picture.</h2><p>Be the first to name it and win a point for your team.</p>{guessAction ? <TextAnswer theme={theme} label="Your guess" placeholder="What do you see?" value={guess} onChange={setGuess} submitLabel="That’s it" disabled={pending} onSubmit={() => { perform(guessAction.id, { text: guess }); setGuess(""); }} /> : <span className={movieMimeStyles.waitingGuess}>Artists leave the guessing to everyone else.</span>}</div>}
              {passAction ? <button className={movieMimeStyles.pass} disabled={pending} onClick={() => perform(passAction.id)}>Try another idea</button> : null}
            </aside>
          </div>
        </section>
      )}
    </GameSurface>
  );
}

function SoundCheckStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [guess, setGuess] = useState("");
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
  const activeTeam = view.teams.find((team) => team.id === activeTeamId);
  const activeCaptainId = activeTeamId ? view.captainByTeam[activeTeamId] : undefined;
  const isActiveCaptain = view.selfPlayerId === activeCaptainId;
  const selectAction = view.availableActions.find((action) => action.id === "select_performer");
  const drawAction = view.availableActions.find((action) => action.id === "draw_sound");
  const guessAction = view.availableActions.find((action) => action.id === "submit_guess");
  const passAction = view.availableActions.find((action) => action.id === "pass_sound");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as { prompt?: string; hint?: string } | undefined;
  const winnerNames = view.winner?.kind === "teams" ? view.winner.ids.map((id) => view.teams.find((team) => team.id === id)?.name).filter(Boolean) : [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  return (
    <GameSurface theme={theme} className={`${movieMimeStyles.stage} ${soundCheckStyles.stage}`}>
      <header className={movieMimeStyles.header}>
        <div><span>BoardForge Original</span><strong>SoundCheck</strong></div>
        <div className={movieMimeStyles.progress}><small>Track</small><b>{Math.min(view.round, view.totalRounds)}</b><i>/</i><span>{view.totalRounds}</span></div>
      </header>
      <div className={movieMimeStyles.scoreboard}>
        {view.teams.map((team) => <div className={team.id === activeTeamId ? movieMimeStyles.activeTeam : ""} key={team.id}><i style={{ background: team.color }} /><span>{team.name}</span><strong>{view.scores.teams[team.id] ?? 0}</strong></div>)}
      </div>

      {view.status === "completed" ? (
        <section className={movieMimeStyles.final}><span>The final track has ended</span><div className={`${movieMimeStyles.trophy} ${soundCheckStyles.recordTrophy}`}>◖</div><h1>{winnerNames.join(" & ") || "Perfect tie"}</h1><p>{winnerNames.length ? "wins tonight’s SoundCheck session." : "The teams share the final mix."}</p><a href="/">Back to the collection <b>→</b></a></section>
      ) : view.phase.id === "select_performer" ? (
        <section className={`${movieMimeStyles.castingStage} ${soundCheckStyles.casting}`}>
          <div className={soundCheckStyles.equalizer} aria-hidden="true">{Array.from({ length: 17 }, (_, index) => <i key={index} />)}</div>
          <p>{activeTeam?.name ?? "The active team"} owns the next track</p>
          <h1>{isActiveCaptain ? "Choose your performer." : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "The captain"} is choosing.`}</h1>
          <span>{isActiveCaptain ? "Pick the player brave enough to take on the next mystery sound." : "The next voice will step into the spotlight in a moment."}</span>
          <div className={movieMimeStyles.castGrid}>{activeTeam?.playerIds.map((id) => {
            const player = view.players.find((candidate) => candidate.id === id);
            return <button disabled={pending || !selectAction} key={id} onClick={() => selectAction && perform(selectAction.id, { targetPlayerId: id })}><i>{player?.name.slice(0, 1).toUpperCase() ?? "?"}</i><span><small>Ready on vocals</small><strong>{player?.name ?? "Player"}</strong></span><b>{id === activeCaptainId ? "★ Captain" : "Choose →"}</b></button>;
          })}</div>
          {!isActiveCaptain ? <em>Only the active team captain can choose.</em> : null}
        </section>
      ) : view.phase.id === "draw_sound" ? (
        <section className={`${movieMimeStyles.drawStage} ${soundCheckStyles.reveal}`}>
          <div className={soundCheckStyles.record}><i /><i /><strong>BF</strong></div><p>{isActivePlayer ? "Your mystery track is ready" : "Next performer"}</p><h1>{activePlayer?.name ?? "The next player"}</h1>
          <span>{isActivePlayer ? "Only you can see the sound. Keep the screen close, then give it everything." : "Look away while the performer discovers the secret sound."}</span>
          <div className={`${movieMimeStyles.secretCard} ${soundCheckStyles.secretSleeve}`}><small>Secret sound</small><strong>◖</strong><i>?</i></div>
          {drawAction ? <button disabled={pending} onClick={() => perform(drawAction.id)}><span>{pending ? "Dropping the needle…" : "Reveal my sound"}</span><b>↗</b></button> : <em>Waiting for {activePlayer?.name ?? "the performer"}…</em>}
        </section>
      ) : (
        <section className={soundCheckStyles.liveRoom}>
          <div className={movieMimeStyles.mimeHeading}><div><p>The studio is live</p><h1>{isActivePlayer ? "Make the sound." : `What is ${activePlayer?.name ?? "the performer"} imitating?`}</h1></div><div className={movieMimeStyles.timer}><i /><span>60</span><small>seconds</small></div></div>
          <div className={soundCheckStyles.performanceGrid}>
            <div className={soundCheckStyles.performanceStage}>
              <div className={soundCheckStyles.onAir}><i /> On air</div>
              <div className={soundCheckStyles.waveform} aria-hidden="true">{Array.from({ length: 31 }, (_, index) => <i key={index} />)}</div>
              <div className={soundCheckStyles.performer}><span>{activePlayer?.name.slice(0, 1).toUpperCase() ?? "?"}</span><div><small>Now performing</small><strong>{activePlayer?.name ?? "Player"}</strong></div></div>
              <p>Voice only · No words · No gestures · No props</p>
            </div>
            <aside className={soundCheckStyles.controlPanel}>
              {isActivePlayer && prompt?.prompt ? <div className={soundCheckStyles.performerPrompt}><small>Your secret sound</small><h2>{prompt.prompt}</h2><span>{prompt.hint}</span><p>Recreate it using only your voice. Do not say any part of the answer.</p></div> : <div className={soundCheckStyles.guessPanel}><small>Shout it out</small><h2>Name that sound.</h2><p>Be the first to name it and win a point for your team.</p>{guessAction ? <TextAnswer theme={theme} label="Your guess" placeholder="What do you hear?" value={guess} onChange={setGuess} submitLabel="That’s it" disabled={pending} onSubmit={() => { perform(guessAction.id, { text: guess }); setGuess(""); }} /> : <span className={soundCheckStyles.waiting}>Performers leave the guessing to everyone else.</span>}</div>}
              {passAction ? <button className={soundCheckStyles.pass} disabled={pending} onClick={() => perform(passAction.id)}>Pass this sound</button> : null}
            </aside>
          </div>
        </section>
      )}
    </GameSurface>
  );
}

function StoryChainStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [contribution, setContribution] = useState("");
  const theme = themeForRoom(view.theme);
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const isActivePlayer = view.selfPlayerId === view.activePlayerId;
  const drawAction = view.availableActions.find((action) => action.id === "draw_twist");
  const writeAction = view.availableActions.find((action) => action.id === "continue_story");
  const prompt = view.components.find((component) => component.kind === "prompt")?.data as { prompt?: string; hint?: string } | undefined;
  const story = view.components.find((component) => component.kind === "story")?.data as { opening?: string; entries?: Array<{ sequence: number; round: number; actorId: string; actorName: string; text: string }> } | undefined;
  const entries = story?.entries ?? [];

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  function submitContribution() {
    if (!writeAction || !contribution.trim()) return;
    perform(writeAction.id, { text: contribution.trim() });
    setContribution("");
  }

  return (
    <GameSurface theme={theme} className={storyChainStyles.stage}>
      <header className={storyChainStyles.header}>
        <div><span>BoardForge Original No. 05</span><strong>StoryChain</strong></div>
        <div className={storyChainStyles.chapter}><small>Chapter</small><b>{Math.min(view.round, view.totalRounds)}</b><i>/</i><span>{view.totalRounds}</span></div>
      </header>

      {view.status === "completed" ? (
        <section className={storyChainStyles.final}>
          <div className={storyChainStyles.finalHeading}><span>Our one-of-a-kind story</span><h1>{view.components.find((component) => component.kind === "header")?.data.title as string ?? "The story we made"}</h1><p>Written tonight by {view.players.map((player) => player.name).join(", ")}.</p></div>
          <article className={storyChainStyles.manuscript}><p className={storyChainStyles.opening}>{story?.opening}</p>{entries.map((entry) => <p key={entry.sequence}>{entry.text}<small>— {entry.actorName}</small></p>)}<div className={storyChainStyles.theEnd}>The End</div></article>
          <div className={storyChainStyles.finalActions}><button onClick={() => void navigator.clipboard.writeText([story?.opening, ...entries.map((entry) => entry.text)].filter(Boolean).join("\n\n"))}>Copy our story</button><a href="/">Choose another game <b>→</b></a></div>
        </section>
      ) : (
        <div className={storyChainStyles.workspace}>
          <section className={storyChainStyles.storyPane}>
            <div className={storyChainStyles.storyMeta}><span><i /> Story in progress</span><b>{entries.length + 1} {entries.length ? "pages" : "page"}</b></div>
            <article className={storyChainStyles.paper}>
              <p className={storyChainStyles.opening}>{story?.opening}</p>
              {entries.map((entry, index) => <div className={storyChainStyles.entry} key={entry.sequence}><span>{String(index + 2).padStart(2, "0")}</span><p>{entry.text}</p><small>{entry.actorName}</small></div>)}
              <div className={storyChainStyles.cursorLine}><i /> The next line belongs to {activePlayer?.name ?? "our next writer"}.</div>
            </article>
          </section>

          <aside className={storyChainStyles.writerPane}>
            <div className={storyChainStyles.writer}><span>{activePlayer?.name.slice(0, 1).toUpperCase() ?? "?"}</span><div><small>Now writing</small><strong>{activePlayer?.name ?? "Player"}</strong></div>{isActivePlayer ? <b>Your turn</b> : null}</div>
            {view.phase.id === "draw_twist" ? (
              <div className={storyChainStyles.sealedTwist}><span>Secret twist</span><div>✦</div><h2>{isActivePlayer ? "Open your prompt." : "A new twist is being drawn."}</h2><p>{isActivePlayer ? "Keep it private. Your sentence must weave this word naturally into the story." : `Only ${activePlayer?.name ?? "the writer"} can see what comes next.`}</p>{drawAction ? <button disabled={pending} onClick={() => perform(drawAction.id)}>{pending ? "Opening…" : "Reveal my twist"} <b>↗</b></button> : <small>Waiting for the writer…</small>}</div>
            ) : isActivePlayer && prompt?.prompt ? (
              <div className={storyChainStyles.writeCard}>
                <small>Your sentence must include</small><h2>{prompt.prompt}</h2><p>{prompt.hint}</p>
                <label htmlFor="story-contribution">Continue in one or two sentences</label><textarea id="story-contribution" autoFocus maxLength={320} onChange={(event) => setContribution(event.target.value)} placeholder="And then…" rows={6} value={contribution} />
                <div className={storyChainStyles.writeFooter}><span>{contribution.length}/320</span><button disabled={pending || !contribution.trim()} onClick={submitContribution}>{pending ? "Adding…" : "Add to the story"} <b>→</b></button></div>
              </div>
            ) : (
              <div className={storyChainStyles.readerCard}><span>Read along</span><h2>{activePlayer?.name ?? "The writer"} is choosing the next words.</h2><p>You will see the new chapter the moment it is added. Their secret twist stays hidden until then.</p><div><i /><i /><i /></div></div>
            )}
          </aside>
        </div>
      )}
    </GameSurface>
  );
}

function WordDuelStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [secretWord, setSecretWord] = useState("");
  const [solveGuess, setSolveGuess] = useState("");
  const [solveOpen, setSolveOpen] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const theme = themeForRoom(view.theme);
  const board = view.components.find((component) => component.kind === "word_duel")?.data as {
    minLength?: number; maxLength?: number; hasSubmitted?: boolean; submittedPlayerIds?: string[]; ownWord?: string;
    opponentId?: string; opponentName?: string; opponentMask?: string[]; wordLength?: number | null;
    keyboard?: Array<{ letter: string; state: "available" | "correct" | "wrong" }>;
    misses?: string[]; incorrectWordAttempts?: string[];
    lastGuess?: { actorId: string; kind: "letter" | "word"; value?: string; correct: boolean; revealedCount: number } | null;
  } | undefined;
  const lockAction = view.availableActions.find((action) => action.id === "lock_word");
  const letterAction = view.availableActions.find((action) => action.id === "guess_letter");
  const solveAction = view.availableActions.find((action) => action.id === "solve_word");
  const isMyTurn = view.activePlayerId === view.selfPlayerId;
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId);
  const winnerId = view.winner?.kind === "players" ? view.winner.ids[0] : undefined;
  const winner = view.players.find((player) => player.id === winnerId);
  const keyboard = board?.keyboard ?? [];
  const mask = board?.opponentMask ?? [];

  function perform(actionId: string, text: string) {
    sendAction({ type: "COMPOSED_ACTION", actionId, payload: { text } });
  }

  useEffect(() => {
    if (!board?.lastGuess?.correct || board.lastGuess.kind !== "letter") return;
    setCelebration(true);
    const timeout = window.setTimeout(() => setCelebration(false), 950);
    return () => window.clearTimeout(timeout);
  }, [view.revision, board?.lastGuess?.correct, board?.lastGuess?.kind]);

  useEffect(() => {
    if (!isMyTurn || pending || solveOpen || !letterAction) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const letter = event.key.toUpperCase();
      if (!/^[A-Z]$/.test(letter) || keyboard.find((key) => key.letter === letter)?.state !== "available") return;
      perform(letterAction.id, letter);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isMyTurn, pending, solveOpen, letterAction, keyboard]);

  function lockWord(event: FormEvent) {
    event.preventDefault();
    if (lockAction && secretWord.length >= (board?.minLength ?? 4) && secretWord.length <= (board?.maxLength ?? 12)) perform(lockAction.id, secretWord);
  }

  function submitSolve(event: FormEvent) {
    event.preventDefault();
    if (!solveAction || !solveGuess.trim()) return;
    perform(solveAction.id, solveGuess);
    setSolveGuess("");
    setSolveOpen(false);
  }

  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const playerReady = (playerId: string) => board?.submittedPlayerIds?.includes(playerId) ?? false;

  return (
    <GameSurface theme={theme} className={wordDuelStyles.stage}>
      <header className={wordDuelStyles.header}><div><span>BoardForge Original No. 06</span><strong>WordDuel</strong></div><div className={wordDuelStyles.versus}><span>{view.players[0]?.name ?? "Player 1"}</span><b>VS</b><span>{view.players[1]?.name ?? "Player 2"}</span></div></header>

      {view.status === "completed" ? (
        <section className={wordDuelStyles.final}>
          <div className={wordDuelStyles.finalBurst}><i>W</i><span /><span /><span /></div><small>The word has been cracked</small><h1>{winnerId === view.selfPlayerId ? "You win the duel." : `${winner?.name ?? "Your rival"} wins.`}</h1>
          <div className={wordDuelStyles.finalWords}><div><span>{board?.opponentName}&apos;s word</span><strong>{mask.join("")}</strong></div><b>VS</b><div><span>Your word</span><strong>{board?.ownWord}</strong></div></div>
          <p>{winnerId === view.selfPlayerId ? "Every key led you here. Beautifully played." : "A sharp duel deserves a rematch."}</p><a href="/games/word-duel">Play another duel <b>→</b></a>
        </section>
      ) : view.phase.id === "choose_words" ? (
        <section className={wordDuelStyles.vault}>
          <div className={wordDuelStyles.vaultIntro}><span>Private word vault</span><h1>Choose your secret.</h1><p>Pick one English word with {board?.minLength} to {board?.maxLength} letters. No spaces, names, or abbreviations. Your rival will only see the number of tiles.</p><div className={wordDuelStyles.readyPlayers}>{view.players.map((player) => <div className={playerReady(player.id) ? wordDuelStyles.ready : ""} key={player.id}><i>{player.name.slice(0, 1).toUpperCase()}</i><span><strong>{player.name}</strong><small>{playerReady(player.id) ? "Word locked" : "Choosing a word…"}</small></span><b>{playerReady(player.id) ? "✓" : "•••"}</b></div>)}</div></div>
          <div className={wordDuelStyles.vaultCard}>{board?.hasSubmitted ? <><div className={wordDuelStyles.lockedIcon}>✓</div><span>Your word is safe</span><h2>{board.ownWord?.replace(/./g, "•")}</h2><p>Only the server knows what you chose. The duel begins when your rival locks theirs.</p><small>Waiting inside the vault…</small></> : <form onSubmit={lockWord}><span>Your secret word</span><div className={wordDuelStyles.secretInput}><input autoComplete="off" autoFocus maxLength={board?.maxLength ?? 12} onChange={(event) => setSecretWord(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="TYPE YOUR WORD" type="password" value={secretWord} /><b>{secretWord.length}/{board?.maxLength}</b></div><div className={wordDuelStyles.secretTiles}>{Array.from({ length: Math.max(secretWord.length, board?.minLength ?? 4) }, (_, index) => <i className={secretWord[index] ? wordDuelStyles.filled : ""} key={index}>{secretWord[index] ? "•" : ""}</i>)}</div><button disabled={pending || secretWord.length < (board?.minLength ?? 4) || secretWord.length > (board?.maxLength ?? 12)}>Lock my word <b>→</b></button><small>Your word never appears on your opponent&apos;s device.</small></form>}</div>
        </section>
      ) : (
        <section className={wordDuelStyles.arena}>
          {celebration ? <div className={wordDuelStyles.celebration}><span>✦</span><strong>{board?.lastGuess?.revealedCount === 1 ? "Nice hit!" : `${board?.lastGuess?.revealedCount} letters found!`}</strong><i /><i /><i /></div> : null}
          <div className={wordDuelStyles.turnBar}><div className={isMyTurn ? wordDuelStyles.yourTurn : ""}><i>{activePlayer?.name.slice(0, 1).toUpperCase()}</i><span><small>{isMyTurn ? "Your move" : "Now playing"}</small><strong>{isMyTurn ? "Choose a letter" : `${activePlayer?.name} is thinking`}</strong></span></div><p>{board?.lastGuess ? board.lastGuess.kind === "letter" ? board.lastGuess.correct ? `${view.players.find((player) => player.id === board.lastGuess?.actorId)?.name} found ${board.lastGuess.value}.` : `${board.lastGuess.value} was not in the word.` : board.lastGuess.correct ? "The full word was cracked." : "The full-word attempt missed." : "The first key is waiting."}</p></div>
          <div className={wordDuelStyles.wordArea}><span>{board?.opponentName}&apos;s secret word · {board?.wordLength} letters</span><div className={wordDuelStyles.wordTiles}>{mask.map((letter, index) => <i className={letter !== "_" ? wordDuelStyles.revealed : ""} key={`${index}-${letter}`}>{letter === "_" ? "" : letter}</i>)}</div><div className={wordDuelStyles.misses}><small>Misses</small>{board?.misses?.length ? board.misses.map((letter) => <b key={letter}>{letter}</b>) : <span>None yet</span>}</div></div>
          <div className={wordDuelStyles.keyboardArea}><div className={wordDuelStyles.keyboardHeading}><div><span>Your keyboard</span><small>Every key can be played once</small></div><button disabled={!isMyTurn || pending || !solveAction} onClick={() => setSolveOpen(true)}>I know the word <b>↗</b></button></div><div className={wordDuelStyles.keyboard}>{rows.map((row) => <div key={row}>{[...row].map((letter) => { const key = keyboard.find((candidate) => candidate.letter === letter); return <button aria-label={`Play letter ${letter}`} className={key?.state === "correct" ? wordDuelStyles.correctKey : key?.state === "wrong" ? wordDuelStyles.wrongKey : ""} disabled={!isMyTurn || pending || key?.state !== "available"} key={letter} onClick={() => letterAction && perform(letterAction.id, letter)}><span>{letter}</span>{key?.state === "correct" ? <i>✓</i> : key?.state === "wrong" ? <i>×</i> : null}</button>; })}</div>)}</div><p>{isMyTurn ? "Tap a key or use your physical keyboard." : `Your keyboard unlocks after ${activePlayer?.name ?? "your rival"} plays.`}</p></div>
          {solveOpen ? <div className={wordDuelStyles.solveBackdrop} onClick={() => setSolveOpen(false)}><form className={wordDuelStyles.solveCard} onClick={(event) => event.stopPropagation()} onSubmit={submitSolve}><span>Risk the whole word</span><h2>Think you&apos;ve cracked it?</h2><p>A wrong answer ends your turn. No extra letters will be revealed.</p><input autoFocus maxLength={board?.maxLength ?? 12} minLength={board?.minLength ?? 4} onChange={(event) => setSolveGuess(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder={`${board?.wordLength ?? "?"} LETTER WORD`} value={solveGuess} /><div><button onClick={() => setSolveOpen(false)} type="button">Not yet</button><button disabled={pending || solveGuess.length !== board?.wordLength} type="submit">Solve it <b>→</b></button></div></form></div> : null}
        </section>
      )}
    </GameSurface>
  );
}

function ComposedStage({ view, pending, sendAction }: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [answer, setAnswer] = useState("");
  const theme = themeForRoom(view.theme);
  const playerName = (id: string) => view.players.find((player) => player.id === id)?.name ?? "Player";

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  const handledActionIds = new Set(view.availableActions.filter((action) => view.components.some((component) => {
    if (action.kind === "choose") return component.kind === "choices";
    if (action.kind === "text") return component.kind === "text_input";
    if (action.kind === "draw") return (component.kind === "deck" || component.kind === "card_zone") && component.data.deckId === action.deckId;
    if (action.kind === "play_card") return component.kind === "card_zone" && component.data.deckId === action.deckId && component.data.zone === "hand";
    if (action.kind === "move") return component.kind === "board" && (component.data.definition as { id?: string } | undefined)?.id === action.boardId;
    if (action.kind === "randomize") return component.kind === "randomizer" && (component.data.definition as { id?: string } | undefined)?.id === action.randomizerId;
    if (action.kind === "buzz") return component.kind === "buzzer";
    if (action.kind === "order") return component.kind === "ordering";
    if (action.kind === "match") return component.kind === "matching";
    if (action.kind === "sketch") return component.kind === "drawing";
    return false;
  })).map((action) => action.id));
  const fallbackActions = view.availableActions.filter((action) => !handledActionIds.has(action.id));
  const hasVisibleOutcome = view.components.some((component) => component.kind === "outcome" && Boolean((component.data as { visible?: boolean }).visible));

  return (
    <GameSurface theme={theme} className="composed-stage">
      <div className="stage-meta composed-stage-meta"><span>ROUND {view.round}/{view.totalRounds}</span><span>{view.phase.title}</span></div>
      <div className="composed-component-stack">
        {view.components.map((component) => {
          if (component.kind === "header") {
            const data = component.data as { eyebrow?: string; title?: string; description?: string; icon?: string };
            return <GameHeader theme={theme} title={data.title ?? view.title} {...(data.eyebrow ? { eyebrow: data.eyebrow } : {})} {...(data.description ? { description: data.description } : {})} {...(data.icon ? { icon: data.icon } : {})} key={component.id} />;
          }
          if (component.kind === "prompt") {
            const data = component.data as { category?: string; prompt?: string; hint?: string; icon?: string };
            return <PromptCard theme={theme} prompt={data.prompt ?? ""} {...(data.category ? { category: data.category } : {})} {...(data.hint ? { hint: data.hint } : {})} {...(data.icon ? { icon: data.icon } : {})} key={component.id} />;
          }
          if (component.kind === "deck") {
            const data = component.data as { label?: string; remaining?: number; activeCard?: { id: string; title: string; body?: string; icon?: string } };
            const cards = data.activeCard ? [{ id: data.activeCard.id, label: data.activeCard.title, ...(data.activeCard.body ? { detail: data.activeCard.body } : {}), ...(data.activeCard.icon ? { icon: data.activeCard.icon } : {}) }] : [{ id: "hidden", label: "Card ready to draw", detail: `${data.remaining ?? 0} cards remaining`, icon: "◆" }];
            const action = view.availableActions.find((candidate) => candidate.kind === "draw" && candidate.deckId === component.data.deckId);
            return <CardDeck theme={theme} cards={cards} {...(data.label ? { label: data.label } : {})} {...(action ? { onDraw: () => perform(action.id) } : {})} key={component.id} />;
          }
          if (component.kind === "choices") {
            const data = component.data as { title?: string; columns?: 1 | 2 | 3; choices?: Array<{ id: string; label: string; description?: string; icon?: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "choose");
            return <div className="composed-control-block" key={component.id}>{data.title ? <p className="game-eyebrow">{data.title}</p> : null}<ChoiceGrid theme={theme} choices={data.choices ?? []} columns={data.columns ?? 2} disabled={pending || !action} {...(action ? { onSelect: (choiceId: string) => perform(action.id, { choiceId }) } : {})} /></div>;
          }
          if (component.kind === "text_input") {
            const data = component.data as { label?: string; placeholder?: string; multiline?: boolean; maxLength?: number };
            const action = view.availableActions.find((candidate) => candidate.kind === "text");
            return <TextAnswer theme={theme} label={data.label ?? "Your answer"} value={answer} onChange={setAnswer} {...(data.placeholder ? { placeholder: data.placeholder } : {})} multiline={data.multiline ?? false} maxLength={data.maxLength ?? 180} submitLabel={action?.label ?? "Submit"} disabled={pending || !action} {...(action ? { onSubmit: () => { perform(action.id, { text: answer }); setAnswer(""); } } : {})} key={component.id} />;
          }
          if (component.kind === "drawing") {
            const data = component.data as { label?: string; strokes?: SketchStroke[] };
            const action = view.availableActions.find((candidate) => candidate.kind === "sketch");
            if (!action) return <DrawingCanvas theme={theme} strokes={data.strokes ?? []} onChange={() => {}} label={data.label ?? "Drawing area"} disabled key={component.id} />;
            return <DrawingCanvas theme={theme} strokes={data.strokes ?? []} onChange={(next) => {
              if (!next.length && data.strokes?.length) perform(action.id, { clear: true });
              else {
                const stroke = next.at(-1);
                if (stroke && next.length > (data.strokes?.length ?? 0)) perform(action.id, { stroke });
              }
            }} label={data.label ?? "Drawing area"} disabled={pending} key={component.id} />;
          }
          if (component.kind === "timer") {
            const data = component.data as { seconds?: number; label?: string };
            return <GameTimer theme={theme} seconds={data.seconds ?? 60} totalSeconds={data.seconds ?? 60} {...(data.label ? { label: data.label } : {})} key={component.id} />;
          }
          if (component.kind === "turn") {
            const data = component.data as { activePlayerId?: string; activePlayerName?: string };
            return <TurnIndicator theme={theme} player={data.activePlayerName ?? playerName(data.activePlayerId ?? view.activePlayerId)} instruction={view.selfPlayerId === view.activePlayerId ? "It is your turn" : "Get ready for your next turn"} key={component.id} />;
          }
          if (component.kind === "round") {
            const data = component.data as { current?: number; total?: number; label?: string };
            return <RoundTracker theme={theme} current={data.current ?? view.round} total={data.total ?? view.totalRounds} {...(data.label ? { label: data.label } : {})} key={component.id} />;
          }
          if (component.kind === "teams") {
            const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
            return <TeamBoard theme={theme} {...(activeTeamId ? { activeTeamId } : {})} teams={view.teams.map((team) => ({ id: team.id, name: team.name, members: team.playerIds.map(playerName), score: view.scores.teams[team.id] ?? 0 }))} key={component.id} />;
          }
          if (component.kind === "players") {
            return <PlayerStrip theme={theme} activePlayerId={view.activePlayerId} players={view.players.map((player) => ({ id: player.id, name: player.name, status: player.id === view.activePlayerId ? "playing" : player.connected ? "ready" : "waiting" }))} key={component.id} />;
          }
          if (component.kind === "scores") {
            const data = component.data as { title?: string };
            const entries = view.teams.length ? view.teams.map((team) => ({ id: team.id, label: team.name, score: view.scores.teams[team.id] ?? 0 })) : view.players.map((player) => ({ id: player.id, label: player.name, score: view.scores.players[player.id] ?? 0 }));
            return <ScoreBoard theme={theme} {...(data.title ? { title: data.title } : {})} entries={entries} key={component.id} />;
          }
          if (component.kind === "clues") {
            const data = component.data as { title?: string; clues?: Array<{ id: string; text?: string }> };
            const clues = (data.clues ?? []).map((clue) => clue.text ?? null);
            return <ClueList theme={theme} clues={clues} revealed={clues.length} {...(data.title ? { title: data.title } : {})} key={component.id} />;
          }
          if (component.kind === "challenge") {
            const data = component.data as { title?: string; instruction?: string; difficulty?: "easy" | "medium" | "hard"; rewardLabel?: string; icon?: string };
            return <ChallengeCard theme={theme} title={data.title ?? "Challenge"} instruction={data.instruction ?? "Complete the challenge."} difficulty={data.difficulty ?? "medium"} {...(data.rewardLabel ? { reward: data.rewardLabel } : {})} {...(data.icon ? { icon: data.icon } : {})} key={component.id} />;
          }
          if (component.kind === "reveal") {
            const data = component.data as { revealed?: boolean; content?: { title: string; description?: string; icon?: string } };
            return <RevealPanel theme={theme} revealed={Boolean(data.revealed)} title={data.content?.title ?? "Reveal locked"} {...(data.content?.description ? { description: data.content.description } : {})} {...(data.content?.icon ? { icon: data.content.icon } : {})} concealedText="Reveal locked" key={component.id} />;
          }
          if (component.kind === "outcome") {
            const data = component.data as { visible?: boolean; title?: string; description?: string };
            return data.visible ? <OutcomeBanner theme={theme} status="success" title={data.title ?? "Game complete"} {...(data.description ? { description: data.description } : {})} {...(view.status === "completed" ? { actions: <a className="composed-new-game" href="/">Choose another game →</a> } : {})} key={component.id} /> : null;
          }
          if (component.kind === "board") {
            const data = component.data as { definition?: { id: string; name: string; layout: "track" | "grid" | "zones"; spaces: Array<{ id: string; label: string }>; tokens: Array<{ id: string; label: string }> }; tokens?: Record<string, { id: string; definitionId: string; ownerType: "global" | "player" | "team"; ownerId: string | null; spaceId: string }> };
            if (!data.definition) return null;
            const ownTeamId = view.teams.find((team) => team.playerIds.includes(view.selfPlayerId))?.id;
            const action = view.availableActions.find((candidate) => candidate.kind === "move" && candidate.boardId === data.definition?.id);
            const tokens = Object.values(data.tokens ?? {}).map((token) => ({ id: token.id, label: data.definition?.tokens.find((definition) => definition.id === token.definitionId)?.label ?? token.id, spaceId: token.spaceId, owned: token.ownerType === "global" || token.ownerId === view.selfPlayerId || token.ownerId === ownTeamId }));
            return <GameBoard theme={theme} title={data.definition.name} layout={data.definition.layout} spaces={data.definition.spaces} tokens={tokens} actionLabel={action?.label ?? "Move"} disabled={pending || !action} {...(action ? { onMove: (tokenId: string, spaceId: string) => perform(action.id, { tokenId, spaceId }) } : {})} key={component.id} />;
          }
          if (component.kind === "card_zone") {
            const data = component.data as { deckId?: string; zone?: "hand" | "draw" | "discard" | "table"; cards?: Array<{ id: string; title: string; body?: string; icon?: string } | string | null> };
            const action = view.availableActions.find((candidate) => candidate.kind === "play_card" && candidate.deckId === data.deckId);
            const cards = (data.cards ?? []).filter((card): card is { id: string; title: string; body?: string; icon?: string } => typeof card === "object" && card !== null && "id" in card);
            const labels = { hand: "Your hand", draw: "Draw pile", discard: "Discard pile", table: "Cards in play" } as const;
            return <CardZone theme={theme} cards={cards} label={labels[data.zone ?? "table"]} actionLabel={action?.label ?? "Play card"} disabled={pending || !action} {...(action ? { onPlay: (cardId: string) => perform(action.id, { cardId }) } : {})} key={component.id} />;
          }
          if (component.kind === "resources") {
            const data = component.data as { definitions?: Array<{ id: string; name: string; icon?: string; scope: "global" | "player" | "team"; min: number; max: number }>; global?: Record<string, number>; own?: Record<string, number>; team?: Record<string, number> };
            const resources = (data.definitions ?? []).map((definition) => ({ ...definition, value: definition.scope === "global" ? data.global?.[definition.id] ?? 0 : definition.scope === "team" ? data.team?.[definition.id] ?? 0 : data.own?.[definition.id] ?? 0 }));
            return <ResourcePanel theme={theme} resources={resources} key={component.id} />;
          }
          if (component.kind === "randomizer") {
            const data = component.data as { definition?: { id: string; kind: "die"; label: string } | { id: string; kind: "spinner"; label: string; options: Array<{ id: string; label: string }> }; result?: string | number };
            if (!data.definition) return null;
            const action = view.availableActions.find((candidate) => candidate.kind === "randomize" && candidate.randomizerId === data.definition?.id);
            const result = data.definition.kind === "spinner" && typeof data.result === "string" ? data.definition.options.find((option) => option.id === data.result)?.label ?? data.result : data.result;
            return <RandomizerPanel theme={theme} label={data.definition.label} kind={data.definition.kind} {...(result !== undefined ? { result } : {})} actionLabel={action?.label ?? "Roll"} disabled={pending || !action} {...(action ? { onTrigger: () => perform(action.id) } : {})} key={component.id} />;
          }
          if (component.kind === "buzzer") {
            const data = component.data as { label?: string; claimedByPlayerId?: string };
            const action = view.availableActions.find((candidate) => candidate.kind === "buzz");
            return <Buzzer theme={theme} label={data.label ?? "Buzzer"} {...(data.claimedByPlayerId ? { claimedBy: playerName(data.claimedByPlayerId) } : {})} disabled={pending || !action} {...(action ? { onBuzz: () => perform(action.id) } : {})} key={component.id} />;
          }
          if (component.kind === "ordering") {
            const data = component.data as { items?: Array<{ id: string; label: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "order");
            return <OrderingBoard theme={theme} items={data.items ?? []} actionLabel={action?.label ?? "Submit order"} disabled={pending || !action} {...(action ? { onSubmit: (orderedIds: string[]) => perform(action.id, { orderedIds }) } : {})} key={component.id} />;
          }
          if (component.kind === "matching") {
            const data = component.data as { items?: Array<{ id: string; label: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "match");
            return <MatchingBoard theme={theme} items={data.items ?? []} actionLabel={action?.label ?? "Submit matches"} disabled={pending || !action} {...(action ? { onSubmit: (pairs: Array<{ leftId: string; rightId: string }>) => perform(action.id, { pairs }) } : {})} key={component.id} />;
          }
          if (component.kind === "media") {
            const data = component.data as { media?: { kind: "image" | "audio" | "video"; title: string; url: string; alt: string } };
            return data.media ? <MediaPanel theme={theme} {...data.media} key={component.id} /> : null;
          }
          return null;
        })}
      </div>

      {view.status === "playing" && fallbackActions.length ? (
        <div className="composed-actions-panel">
          <p className="game-eyebrow">Available actions</p>
          {fallbackActions.map((action) => {
            if (action.kind === "choose" && action.options) {
              const options = action.options.map((option) => ({ id: option.id, label: option.label, ...(option.description ? { description: option.description } : {}), ...(option.icon ? { icon: option.icon } : {}) }));
              return <ChoiceGrid theme={theme} choices={options} onSelect={(choiceId) => perform(action.id, { choiceId })} disabled={pending} key={action.id} />;
            }
            if (action.kind === "text") {
              return <TextAnswer theme={theme} value={answer} onChange={setAnswer} onSubmit={() => { perform(action.id, { text: answer }); setAnswer(""); }} submitLabel={action.label} disabled={pending} key={action.id} />;
            }
            const directlyExecutable = ["advance", "draw", "resource", "randomize", "buzz", "complete_challenge"].includes(action.kind);
            return <GameButton theme={theme} disabled={pending || !directlyExecutable} onClick={() => perform(action.id)} key={action.id}>{action.label}</GameButton>;
          })}
        </div>
      ) : null}

      {view.status === "completed" && !hasVisibleOutcome ? (
        <OutcomeBanner theme={theme} status="success" title="What a night." description="One winner, plenty of stories, and every reason to play again." actions={<a className="composed-new-game" href="/">Choose another game →</a>} />
      ) : null}
    </GameSurface>
  );
}

function ActionBlock({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <div className="action-block"><div><p className="eyebrow">YOUR MOVE</p><h2>{title}</h2><span>{text}</span></div><div className="action-controls">{children}</div></div>;
}
