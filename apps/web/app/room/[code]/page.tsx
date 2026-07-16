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
    socket.on("session:replaced", () => setError("Cette session a été reprise dans un autre onglet."));

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
  const isMovieMime = currentTitle === "CinéMimes";

  return (
    <main className={`room-shell ${isMovieMime ? roomChromeStyles.movieRoom : ""}`}>
      <header className="room-topbar">
        <a className="brand" href="/"><span className="brand-mark">BF</span><span>BoardForge</span></a>
        <div className="room-code"><span>SALLE</span><strong>{code}</strong><button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/room/${code}`)}>Copier l’invitation</button></div>
        <span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "En direct" : "Reconnexion"}</span>
      </header>

      {!view ? (
        <section className="join-panel">
          {isMovieMime ? <div className={roomChromeStyles.ticketPunch}>Admit one</div> : null}
          <p className="eyebrow">{isMovieMime ? "Votre séance privée" : "Vous êtes invité"}</p>
          <h1>{isMovieMime ? "Entrez dans la salle." : "Rejoignez la room"}</h1>
          <p>{isMovieMime ? "Choisissez le nom qui apparaîtra au générique de cette partie." : "Choisissez le nom que vos amis verront pendant la partie."}</p>
          {isMovieMime ? <div className={roomChromeStyles.joinCode}><span>Invitation</span><strong>{code}</strong><small>CinéMimes · BoardForge Original</small></div> : null}
          <form onSubmit={join}>
            <label htmlFor="player-name">Votre nom de joueur</label>
            <input id="player-name" autoFocus placeholder="Ex. Camille" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
            <button className="primary-button" disabled={pending || !name.trim()}>Entrer dans la salle <b>→</b></button>
          </form>
        </section>
      ) : view.kind === "lobby" ? (
        <section className="lobby-layout">
          <div className="lobby-hero">
            {isMovieMime ? <div className={roomChromeStyles.lobbyEdition}><span>BoardForge Original</span><b>Nº 01</b></div> : null}
            <p className="eyebrow">{isMovieMime ? "Casting en cours" : "La table se prépare"}</p>
            <h1>{view.game.title}</h1>
            <p>{view.game.description}</p>
            {isMovieMime ? <div className={roomChromeStyles.lobbyFacts}><span>🎬 Mime cinéma</span><span>⏱ 60 secondes</span><span>✦ {view.teamSetup?.teams.length ?? 2} équipes</span></div> : null}
            <div className="lobby-progress"><span style={{ width: `${Math.min(100, (view.players.length / view.game.minPlayers) * 100)}%` }} /></div>
            <small>{view.players.length} joueur(s) au casting · minimum {view.game.minPlayers}</small>
            {view.teamSetup ? <TeamSetup view={view} pending={pending} selectTeam={selectTeam} selectCaptain={selectCaptain} /> : null}
            {self?.isHost ? (
              <button className="primary-button host-start" disabled={!view.canStart || pending} onClick={startGame}>
                {view.canStart ? "Lancer la partie" : view.startBlockReason ?? "La table n’est pas encore prête"} <b>→</b>
              </button>
            ) : <div className="waiting-card">L’hôte lancera la partie lorsque la table sera prête.</div>}
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
  const playerName = (id: string) => view.players.find((player) => player.id === id)?.name ?? "Joueur";
  const isHost = Boolean(view.players.find((player) => player.id === view.selfPlayerId)?.isHost);
  return (
    <section className="team-setup" aria-labelledby="team-setup-title">
      <div className="team-setup-heading">
        <div><p className="preview-label">Composition libre</p><h2 id="team-setup-title">Choisissez votre équipe</h2></div>
        <span>{view.teamSetup.allowUnevenTeams ? "Équipes flexibles" : "Équipes équilibrées"}</span>
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
                {team.playerIds.length ? team.playerIds.map((id) => <span className={id === team.captainPlayerId ? "captain" : ""} key={id}>{id === team.captainPlayerId ? "★ " : ""}{playerName(id)}</span>) : <em>Équipe disponible</em>}
              </div>
              {isHost && team.playerIds.length ? (
                <label className="captain-select">
                  <span>Chef d’équipe</span>
                  <select disabled={pending} onChange={(event) => event.target.value && selectCaptain(team.id, event.target.value)} value={team.captainPlayerId ?? ""}>
                    <option value="">À choisir…</option>
                    {team.playerIds.map((id) => <option key={id} value={id}>{playerName(id)}</option>)}
                  </select>
                </label>
              ) : captainName ? <div className="captain-display"><span>★ Chef</span><strong>{captainName}</strong></div> : null}
              <button disabled={pending || selected || full} onClick={() => selectTeam(team.id)}>
                {selected ? "Votre équipe ✓" : full ? "Équipe complète" : "Rejoindre"}
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
      <div className="rail-heading"><span>AU GÉNÉRIQUE</span><b>{view.players.length}</b></div>
      <div className="player-list">
        {view.players.map((player, index) => (
          <div className={`player-row ${player.id === view.selfPlayerId ? "self" : ""}`} key={player.id}>
            <span className={`avatar avatar-${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</span>
            <div><strong>{player.name}</strong><small>{view.kind === "lobby" && view.teamSetup ? view.teamSetup.teams.find((team) => team.playerIds.includes(player.id))?.name ?? "Choix en attente" : player.isHost ? "Hôte" : player.id === view.selfPlayerId ? "Vous" : "Joueur"}</small></div>
            <i className={player.connected ? "present" : ""} />
          </div>
        ))}
      </div>
      <div className="rail-footer"><span>État sécurisé</span><span>Cartes privées</span></div>
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
          <ActionBlock title="Mission decision" text="Choose privately. The server will reveal only the total number of sabotages.">
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
    if (view.title === "CinéMimes") {
      return <MovieMimeStage view={view} pending={pending} sendAction={sendAction} />;
    }
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
    description: "Ambiance personnalisée par la GameSpec.",
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
          <strong>CinéMimes</strong>
        </div>
        <div className={movieMimeStyles.progress}>
          <small>Film</small><b>{Math.min(view.round, view.totalRounds)}</b><i>/</i><span>{view.totalRounds}</span>
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
          <span>Fin de la séance</span>
          <div className={movieMimeStyles.trophy}>✦</div>
          <h1>{winnerNames.join(" & ") || "Égalité parfaite"}</h1>
          <p>{winnerNames.length ? "remporte le box-office de la soirée." : "Les équipes se partagent l’affiche."}</p>
          <a href="/">Retour à la collection <b>→</b></a>
        </section>
      ) : view.phase.id === "select_mimer" ? (
        <section className={movieMimeStyles.castingStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>Au tour de {activeTeam?.name ?? "l’équipe active"}</p>
          <h1>{isActiveCaptain ? "Choisissez votre mimeur." : `${view.players.find((player) => player.id === activeCaptainId)?.name ?? "Le chef"} fait son choix.`}</h1>
          <span>
            {isActiveCaptain
              ? "Vous êtes chef d’équipe pour cette partie. Confiez la prochaine carte à l’un de vos joueurs."
              : "Le prochain mimeur sera appelé sur scène dans un instant."}
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
                  <span><small>{index === 0 ? "Au casting" : "Prêt à jouer"}</small><strong>{player?.name ?? "Joueur"}</strong></span>
                  <b>{id === activeCaptainId ? "★ Chef" : "Choisir →"}</b>
                </button>
              );
            })}
          </div>
          {!isActiveCaptain ? <em>Seul le chef de {activeTeam?.name ?? "l’équipe"} peut choisir.</em> : null}
        </section>
      ) : view.phase.id === "draw" ? (
        <section className={movieMimeStyles.drawStage}>
          <div className={movieMimeStyles.spotlight} />
          <p>{isActivePlayer ? "Vous êtes à l’affiche" : "Prochain mimeur"}</p>
          <h1>{activePlayer?.name ?? "Le prochain joueur"}</h1>
          <span>
            {isActivePlayer
              ? "Découvrez votre film en secret. Votre équipe ne verra jamais la carte."
              : "Détournez les yeux pendant que le mimeur découvre sa carte."}
          </span>
          <div className={movieMimeStyles.secretCard}>
            <small>Film secret</small>
            <strong>?</strong>
            <i>🎬</i>
          </div>
          {drawAction ? (
            <button disabled={pending} onClick={() => perform(drawAction.id)}>
              <span>{pending ? "Ouverture de la bobine…" : "Découvrir mon film"}</span><b>↗</b>
            </button>
          ) : <em>En attente de {activePlayer?.name ?? "la personne active"}…</em>}
        </section>
      ) : (
        <section className={movieMimeStyles.mimeStage}>
          <div className={movieMimeStyles.mimeHeading}>
            <div>
              <p>Silence, ça mime !</p>
              <h1>{isActivePlayer ? "Faites-le deviner." : `${activePlayer?.name ?? "Le mimeur"} est en scène.`}</h1>
            </div>
            <div className={movieMimeStyles.timer}><i /><span>60</span><small>secondes</small></div>
          </div>

          {isActivePlayer && prompt?.prompt ? (
            <div className={movieMimeStyles.revealedCard}>
              <div><span>Votre film</span><i>{prompt.icon ?? "🎭"}</i></div>
              <h2>{prompt.prompt}</h2>
              {prompt.hint ? <p>{prompt.hint}</p> : null}
              <small>Ne parlez pas · N’écrivez pas · Ne montrez pas l’écran</small>
            </div>
          ) : (
            <div className={movieMimeStyles.audienceCard}>
              <strong>?</strong>
              <div><span>Le titre reste secret</span><p>Regardez le mime et proposez vos réponses à voix haute.</p></div>
            </div>
          )}

          <div className={movieMimeStyles.mimeActions}>
            {successAction ? <button className={movieMimeStyles.success} disabled={pending} onClick={() => perform(successAction.id)}>✓ Film trouvé</button> : null}
            {passAction ? <button className={movieMimeStyles.pass} disabled={pending} onClick={() => perform(passAction.id)}>Passer le film</button> : null}
            {!successAction && !passAction ? <span>Seul le mimeur peut valider le résultat.</span> : null}
          </div>
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
  const playerName = (id: string) => view.players.find((player) => player.id === id)?.name ?? "Joueur";

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
    return false;
  })).map((action) => action.id));
  const fallbackActions = view.availableActions.filter((action) => !handledActionIds.has(action.id));
  const hasVisibleOutcome = view.components.some((component) => component.kind === "outcome" && Boolean((component.data as { visible?: boolean }).visible));

  return (
    <GameSurface theme={theme} className="composed-stage">
      <div className="stage-meta composed-stage-meta"><span>MANCHE {view.round}/{view.totalRounds}</span><span>{view.phase.title}</span></div>
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
            const cards = data.activeCard ? [{ id: data.activeCard.id, label: data.activeCard.title, ...(data.activeCard.body ? { detail: data.activeCard.body } : {}), ...(data.activeCard.icon ? { icon: data.activeCard.icon } : {}) }] : [{ id: "hidden", label: "Carte prête à être piochée", detail: `${data.remaining ?? 0} cartes restantes`, icon: "◆" }];
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
            return <TextAnswer theme={theme} label={data.label ?? "Votre réponse"} value={answer} onChange={setAnswer} {...(data.placeholder ? { placeholder: data.placeholder } : {})} multiline={data.multiline ?? false} maxLength={data.maxLength ?? 180} submitLabel={action?.label ?? "Valider"} disabled={pending || !action} {...(action ? { onSubmit: () => { perform(action.id, { text: answer }); setAnswer(""); } } : {})} key={component.id} />;
          }
          if (component.kind === "drawing") {
            const data = component.data as { label?: string };
            return <LocalDrawing theme={theme} label={data.label ?? "Zone de dessin"} key={component.id} />;
          }
          if (component.kind === "timer") {
            const data = component.data as { seconds?: number; label?: string };
            return <GameTimer theme={theme} seconds={data.seconds ?? 60} totalSeconds={data.seconds ?? 60} {...(data.label ? { label: data.label } : {})} key={component.id} />;
          }
          if (component.kind === "turn") {
            const data = component.data as { activePlayerId?: string; activePlayerName?: string };
            return <TurnIndicator theme={theme} player={data.activePlayerName ?? playerName(data.activePlayerId ?? view.activePlayerId)} instruction={view.selfPlayerId === view.activePlayerId ? "C'est à vous de jouer" : "Préparez-vous pour votre prochain tour"} key={component.id} />;
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
            return <ChallengeCard theme={theme} title={data.title ?? "Défi"} instruction={data.instruction ?? "Relevez le défi."} difficulty={data.difficulty ?? "medium"} {...(data.rewardLabel ? { reward: data.rewardLabel } : {})} {...(data.icon ? { icon: data.icon } : {})} key={component.id} />;
          }
          if (component.kind === "reveal") {
            const data = component.data as { revealed?: boolean; content?: { title: string; description?: string; icon?: string } };
            return <RevealPanel theme={theme} revealed={Boolean(data.revealed)} title={data.content?.title ?? "Révélation verrouillée"} {...(data.content?.description ? { description: data.content.description } : {})} {...(data.content?.icon ? { icon: data.content.icon } : {})} concealedText="Révélation verrouillée" key={component.id} />;
          }
          if (component.kind === "outcome") {
            const data = component.data as { visible?: boolean; title?: string; description?: string };
            return data.visible ? <OutcomeBanner theme={theme} status="success" title={data.title ?? "Partie terminée"} {...(data.description ? { description: data.description } : {})} {...(view.status === "completed" ? { actions: <a className="composed-new-game" href="/">Créer un autre jeu →</a> } : {})} key={component.id} /> : null;
          }
          if (component.kind === "board") {
            const data = component.data as { definition?: { id: string; name: string; layout: "track" | "grid" | "zones"; spaces: Array<{ id: string; label: string }>; tokens: Array<{ id: string; label: string }> }; tokens?: Record<string, { id: string; definitionId: string; ownerType: "global" | "player" | "team"; ownerId: string | null; spaceId: string }> };
            if (!data.definition) return null;
            const ownTeamId = view.teams.find((team) => team.playerIds.includes(view.selfPlayerId))?.id;
            const action = view.availableActions.find((candidate) => candidate.kind === "move" && candidate.boardId === data.definition?.id);
            const tokens = Object.values(data.tokens ?? {}).map((token) => ({ id: token.id, label: data.definition?.tokens.find((definition) => definition.id === token.definitionId)?.label ?? token.id, spaceId: token.spaceId, owned: token.ownerType === "global" || token.ownerId === view.selfPlayerId || token.ownerId === ownTeamId }));
            return <GameBoard theme={theme} title={data.definition.name} layout={data.definition.layout} spaces={data.definition.spaces} tokens={tokens} actionLabel={action?.label ?? "Déplacer"} disabled={pending || !action} {...(action ? { onMove: (tokenId: string, spaceId: string) => perform(action.id, { tokenId, spaceId }) } : {})} key={component.id} />;
          }
          if (component.kind === "card_zone") {
            const data = component.data as { deckId?: string; zone?: "hand" | "draw" | "discard" | "table"; cards?: Array<{ id: string; title: string; body?: string; icon?: string } | string | null> };
            const action = view.availableActions.find((candidate) => candidate.kind === "play_card" && candidate.deckId === data.deckId);
            const cards = (data.cards ?? []).filter((card): card is { id: string; title: string; body?: string; icon?: string } => typeof card === "object" && card !== null && "id" in card);
            const labels = { hand: "Votre main", draw: "Pioche", discard: "Défausse", table: "Cartes en jeu" } as const;
            return <CardZone theme={theme} cards={cards} label={labels[data.zone ?? "table"]} actionLabel={action?.label ?? "Jouer la carte"} disabled={pending || !action} {...(action ? { onPlay: (cardId: string) => perform(action.id, { cardId }) } : {})} key={component.id} />;
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
            return <RandomizerPanel theme={theme} label={data.definition.label} kind={data.definition.kind} {...(result !== undefined ? { result } : {})} actionLabel={action?.label ?? "Lancer"} disabled={pending || !action} {...(action ? { onTrigger: () => perform(action.id) } : {})} key={component.id} />;
          }
          if (component.kind === "buzzer") {
            const data = component.data as { label?: string; claimedByPlayerId?: string };
            const action = view.availableActions.find((candidate) => candidate.kind === "buzz");
            return <Buzzer theme={theme} label={data.label ?? "Buzzer"} {...(data.claimedByPlayerId ? { claimedBy: playerName(data.claimedByPlayerId) } : {})} disabled={pending || !action} {...(action ? { onBuzz: () => perform(action.id) } : {})} key={component.id} />;
          }
          if (component.kind === "ordering") {
            const data = component.data as { items?: Array<{ id: string; label: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "order");
            return <OrderingBoard theme={theme} items={data.items ?? []} actionLabel={action?.label ?? "Valider l’ordre"} disabled={pending || !action} {...(action ? { onSubmit: (orderedIds: string[]) => perform(action.id, { orderedIds }) } : {})} key={component.id} />;
          }
          if (component.kind === "matching") {
            const data = component.data as { items?: Array<{ id: string; label: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "match");
            return <MatchingBoard theme={theme} items={data.items ?? []} actionLabel={action?.label ?? "Valider les associations"} disabled={pending || !action} {...(action ? { onSubmit: (pairs: Array<{ leftId: string; rightId: string }>) => perform(action.id, { pairs }) } : {})} key={component.id} />;
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
          <p className="game-eyebrow">Actions disponibles</p>
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
        <OutcomeBanner theme={theme} status="success" title="Partie terminée" description="Le moteur a appliqué toutes les règles de la GameSpec." actions={<a className="composed-new-game" href="/">Créer un autre jeu →</a>} />
      ) : null}
    </GameSurface>
  );
}

function LocalDrawing({ theme, label }: { theme: GameThemeInput; label: string }) {
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  return <DrawingCanvas theme={theme} label={label} strokes={strokes} onChange={setStrokes} />;
}

function ActionBlock({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <div className="action-block"><div><p className="eyebrow">YOUR MOVE</p><h2>{title}</h2><span>{text}</span></div><div className="action-controls">{children}</div></div>;
}
