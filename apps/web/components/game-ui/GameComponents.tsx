"use client";

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { gameThemeStyle, resolveGameTheme, type GameThemeInput } from "./themes";

type ThemedProps = {
  theme?: GameThemeInput | undefined;
  className?: string | undefined;
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function themedStyle(theme: GameThemeInput | undefined, style?: CSSProperties): CSSProperties {
  return { ...gameThemeStyle(theme), ...style };
}

export function GameSurface({ theme = "minimal", className, children }: ThemedProps & { children: ReactNode }) {
  const resolved = resolveGameTheme(theme);
  return (
    <section
      className={classes("game-ui", "game-surface", className)}
      style={themedStyle(theme)}
      data-game-theme={resolved.id}
    >
      {children}
    </section>
  );
}

export function GameHeader({
  theme,
  className,
  eyebrow,
  title,
  description,
  icon,
  actions,
}: ThemedProps & {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={classes("game-ui", "game-header", className)} style={themedStyle(theme)}>
      {icon ? (
        <div className="game-header__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="game-header__copy">
        {eyebrow ? <span className="game-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="game-header__actions">{actions}</div> : null}
    </header>
  );
}

export function GameButton({
  theme,
  className,
  variant = "primary",
  ...props
}: ThemedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  }) {
  return (
    <button
      type="button"
      {...props}
      className={classes("game-ui", "game-button", `game-button--${variant}`, className)}
      style={themedStyle(theme, props.style)}
    />
  );
}

export function PromptCard({
  theme,
  className,
  category,
  prompt,
  hint,
  icon = "✦",
  footer,
}: ThemedProps & {
  category?: string;
  prompt: string;
  hint?: string;
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className={classes("game-ui", "prompt-card", className)} style={themedStyle(theme)}>
      <div className="prompt-card__top">
        <span>{category ?? "Your turn"}</span>
        <b aria-hidden="true">{icon}</b>
      </div>
      <p className="prompt-card__prompt">{prompt}</p>
      {hint ? <p className="prompt-card__hint">{hint}</p> : null}
      {footer ? <div className="prompt-card__footer">{footer}</div> : null}
    </article>
  );
}

export type DeckCard = {
  id: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
};

export function CardDeck({
  theme,
  className,
  cards,
  activeIndex = 0,
  label = "Deck",
  onDraw,
}: ThemedProps & {
  cards: DeckCard[];
  activeIndex?: number;
  label?: string;
  onDraw?: () => void;
}) {
  const activeCard = cards[activeIndex];
  const remaining = Math.max(cards.length - activeIndex, 0);
  return (
    <article className={classes("game-ui", "card-deck", className)} style={themedStyle(theme)}>
      <div className="card-deck__meta">
        <span>{label}</span>
        <b>
          {remaining} card{remaining === 1 ? "" : "s"}
        </b>
      </div>
      <div className="card-deck__stack" aria-live="polite">
        <i />
        <i />
        <div className="card-deck__card">
          <span aria-hidden="true">{activeCard?.icon ?? "◆"}</span>
          <strong>{activeCard?.label ?? "Empty deck"}</strong>
          {activeCard?.detail ? <small>{activeCard.detail}</small> : null}
        </div>
      </div>
      {onDraw ? (
        <GameButton theme={theme} onClick={onDraw} disabled={!activeCard}>
          Draw next <span>→</span>
        </GameButton>
      ) : null}
    </article>
  );
}

export type GameCard = { id: string; title: string; body?: string; icon?: ReactNode };

export function CardZone({
  theme,
  className,
  cards,
  label = "Your hand",
  actionLabel = "Play card",
  onPlay,
  disabled = false,
}: ThemedProps & {
  cards: GameCard[];
  label?: string;
  actionLabel?: string;
  onPlay?: (cardId: string) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (selectedId && !cards.some((card) => card.id === selectedId)) setSelectedId("");
  }, [cards, selectedId]);
  return (
    <article className={classes("game-ui", "card-zone", className)} style={themedStyle(theme)}>
      <div className="card-zone__heading">
        <span className="game-eyebrow">Cards</span>
        <strong>{label}</strong>
        <b>{cards.length}</b>
      </div>
      {cards.length ? (
        <div className="card-zone__cards">
          {cards.map((card) => (
            <button
              type="button"
              className={selectedId === card.id ? "is-selected" : undefined}
              onClick={() => setSelectedId(card.id)}
              disabled={disabled}
              aria-pressed={selectedId === card.id}
              key={card.id}
            >
              <span aria-hidden="true">{card.icon ?? "◆"}</span>
              <strong>{card.title}</strong>
              {card.body ? <small>{card.body}</small> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="game-empty-state">There are no cards in this area.</p>
      )}
      {onPlay ? (
        <GameButton
          theme={theme}
          disabled={disabled || !selectedId}
          onClick={() => {
            onPlay(selectedId);
            setSelectedId("");
          }}
        >
          {actionLabel}
        </GameButton>
      ) : null}
    </article>
  );
}

export type GameBoardSpace = { id: string; label: string };
export type GameBoardToken = { id: string; label: string; spaceId: string; owned: boolean };

export function GameBoard({
  theme,
  className,
  title = "Board",
  layout = "track",
  spaces,
  tokens,
  actionLabel = "Move",
  onMove,
  disabled = false,
}: ThemedProps & {
  title?: string;
  layout?: "track" | "grid" | "zones";
  spaces: GameBoardSpace[];
  tokens: GameBoardToken[];
  actionLabel?: string;
  onMove?: (tokenId: string, spaceId: string) => void;
  disabled?: boolean;
}) {
  const [tokenId, setTokenId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  useEffect(() => {
    if (tokenId && !tokens.some((token) => token.id === tokenId && token.owned)) setTokenId("");
    if (spaceId && !spaces.some((space) => space.id === spaceId)) setSpaceId("");
  }, [spaces, spaceId, tokenId, tokens]);
  return (
    <article
      className={classes("game-ui", "game-board", `game-board--${layout}`, className)}
      style={themedStyle(theme)}
    >
      <div className="game-board__heading">
        <div>
          <span className="game-eyebrow">Movement</span>
          <h3>{title}</h3>
        </div>
        <small>Choose a token, then a destination</small>
      </div>
      <div className="game-board__tokens" role="group" aria-label="Available tokens">
        {tokens.map((token) => (
          <button
            type="button"
            className={tokenId === token.id ? "is-selected" : undefined}
            disabled={disabled || !token.owned}
            onClick={() => setTokenId(token.id)}
            key={token.id}
          >
            <i />
            {token.label}
          </button>
        ))}
      </div>
      <ol className="game-board__spaces">
        {spaces.map((space, index) => (
          <li className={spaceId === space.id ? "is-selected" : undefined} key={space.id}>
            <button type="button" onClick={() => setSpaceId(space.id)} disabled={disabled || !tokenId}>
              <b>{index + 1}</b>
              <strong>{space.label}</strong>
            </button>
            <div>
              {tokens
                .filter((token) => token.spaceId === space.id)
                .map((token) => (
                  <span title={token.label} key={token.id}>
                    {token.label.slice(0, 1).toUpperCase()}
                  </span>
                ))}
            </div>
          </li>
        ))}
      </ol>
      {onMove ? (
        <GameButton
          theme={theme}
          disabled={disabled || !tokenId || !spaceId}
          onClick={() => {
            onMove(tokenId, spaceId);
            setSpaceId("");
          }}
        >
          {actionLabel}
        </GameButton>
      ) : null}
    </article>
  );
}

export type GameResource = {
  id: string;
  name: string;
  icon?: ReactNode;
  value: number;
  min: number;
  max: number;
  scope: "global" | "player" | "team";
};

export function ResourcePanel({
  theme,
  className,
  resources,
  title = "Resources",
}: ThemedProps & { resources: GameResource[]; title?: string }) {
  return (
    <article className={classes("game-ui", "resource-panel", className)} style={themedStyle(theme)}>
      <h3>{title}</h3>
      <div>
        {resources.map((resource) => {
          const progress =
            resource.max === resource.min
              ? 100
              : ((resource.value - resource.min) / (resource.max - resource.min)) * 100;
          return (
            <div className="resource-panel__item" key={resource.id}>
              <span aria-hidden="true">{resource.icon ?? "◆"}</span>
              <p>
                <strong>{resource.name}</strong>
                <small>
                  {resource.scope === "global" ? "Shared" : resource.scope === "team" ? "Team" : "Personal"}
                </small>
              </p>
              <b>{resource.value}</b>
              <i>
                <em style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </i>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function RandomizerPanel({
  theme,
  className,
  label,
  kind,
  result,
  actionLabel = "Roll",
  onTrigger,
  disabled = false,
}: ThemedProps & {
  label: string;
  kind: "die" | "spinner";
  result?: string | number;
  actionLabel?: string;
  onTrigger?: () => void;
  disabled?: boolean;
}) {
  return (
    <article className={classes("game-ui", "randomizer-panel", className)} style={themedStyle(theme)}>
      <span aria-hidden="true">{kind === "die" ? "⚄" : "◉"}</span>
      <div>
        <small>{kind === "die" ? "Die" : "Spinner"}</small>
        <strong>{label}</strong>
      </div>
      <b>{result ?? "—"}</b>
      {onTrigger ? (
        <GameButton theme={theme} onClick={onTrigger} disabled={disabled}>
          {actionLabel}
        </GameButton>
      ) : null}
    </article>
  );
}

export function Buzzer({
  theme,
  className,
  label = "Buzzer",
  claimedBy,
  onBuzz,
  disabled = false,
}: ThemedProps & { label?: string; claimedBy?: string; onBuzz?: () => void; disabled?: boolean }) {
  return (
    <article
      className={classes("game-ui", "game-buzzer", claimedBy && "is-claimed", className)}
      style={themedStyle(theme)}
    >
      <button type="button" onClick={onBuzz} disabled={disabled || Boolean(claimedBy)} aria-label={label}>
        <span aria-hidden="true">!</span>
      </button>
      <div>
        <span className="game-eyebrow">Reflex</span>
        <strong>{claimedBy ? `${claimedBy} buzzed` : label}</strong>
        <small>{claimedBy ? "The buzzer is locked for this phase." : "Be the first to press it."}</small>
      </div>
    </article>
  );
}

export type SortableItem = { id: string; label: string };

export function OrderingBoard({
  theme,
  className,
  items,
  actionLabel = "Confirm order",
  onSubmit,
  disabled = false,
}: ThemedProps & {
  items: SortableItem[];
  actionLabel?: string;
  onSubmit?: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [ordered, setOrdered] = useState(items);
  useEffect(() => setOrdered(items), [items]);
  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrdered(next);
  }
  return (
    <article className={classes("game-ui", "ordering-board", className)} style={themedStyle(theme)}>
      <div>
        <span className="game-eyebrow">Ranking</span>
        <h3>Place the items in the correct order</h3>
      </div>
      <ol>
        {ordered.map((item, index) => (
          <li key={item.id}>
            <b>{index + 1}</b>
            <strong>{item.label}</strong>
            <span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                aria-label={`Move ${item.label} up`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={disabled || index === ordered.length - 1}
                aria-label={`Move ${item.label} down`}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {onSubmit ? (
        <GameButton
          theme={theme}
          onClick={() => onSubmit(ordered.map((item) => item.id))}
          disabled={disabled || !ordered.length}
        >
          {actionLabel}
        </GameButton>
      ) : null}
    </article>
  );
}

export function MatchingBoard({
  theme,
  className,
  items,
  actionLabel = "Confirm matches",
  onSubmit,
  disabled = false,
}: ThemedProps & {
  items: SortableItem[];
  actionLabel?: string;
  onSubmit?: (pairs: Array<{ leftId: string; rightId: string }>) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [pairs, setPairs] = useState<Array<{ leftId: string; rightId: string }>>([]);
  useEffect(() => {
    setPairs([]);
    setSelectedId("");
  }, [items]);
  const usedIds = new Set(pairs.flatMap((pair) => [pair.leftId, pair.rightId]));
  function select(id: string) {
    if (!selectedId) setSelectedId(id);
    else if (selectedId !== id) {
      setPairs([...pairs, { leftId: selectedId, rightId: id }]);
      setSelectedId("");
    }
  }
  const name = (id: string) => items.find((item) => item.id === id)?.label ?? id;
  return (
    <article className={classes("game-ui", "matching-board", className)} style={themedStyle(theme)}>
      <div>
        <span className="game-eyebrow">Matching</span>
        <h3>Build the pairs</h3>
        <button
          type="button"
          onClick={() => {
            setPairs([]);
            setSelectedId("");
          }}
          disabled={disabled || (!pairs.length && !selectedId)}
        >
          Start over
        </button>
      </div>
      <div className="matching-board__items">
        {items.map((item) => (
          <button
            type="button"
            className={selectedId === item.id ? "is-selected" : undefined}
            disabled={disabled || usedIds.has(item.id)}
            onClick={() => select(item.id)}
            key={item.id}
          >
            {item.label}
          </button>
        ))}
      </div>
      {pairs.length ? (
        <ol>
          {pairs.map((pair, index) => (
            <li key={`${pair.leftId}-${pair.rightId}`}>
              <b>{index + 1}</b>
              <span>{name(pair.leftId)}</span>
              <i>↔</i>
              <span>{name(pair.rightId)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="game-empty-state">Select two items to create a pair.</p>
      )}
      {onSubmit ? (
        <GameButton
          theme={theme}
          onClick={() => onSubmit(pairs)}
          disabled={disabled || pairs.length * 2 !== items.length}
        >
          {actionLabel}
        </GameButton>
      ) : null}
    </article>
  );
}

export function MediaPanel({
  theme,
  className,
  kind,
  title,
  url,
  alt,
}: ThemedProps & { kind: "image" | "audio" | "video"; title: string; url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  const fallback = (
    <div className="media-panel__fallback" role="img" aria-label={alt}>
      <span aria-hidden="true">▧</span>
      <small>Media unavailable</small>
    </div>
  );
  return (
    <figure className={classes("game-ui", "media-panel", className)} style={themedStyle(theme)}>
      {failed ? (
        fallback
      ) : kind === "image" ? (
        <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : kind === "audio" ? (
        <audio src={url} controls preload="metadata" onError={() => setFailed(true)}>
          {alt}
        </audio>
      ) : (
        <video src={url} controls preload="metadata" onError={() => setFailed(true)}>
          {alt}
        </video>
      )}
      <figcaption>
        <span className="game-eyebrow">Media</span>
        <strong>{title}</strong>
        <small>{alt}</small>
      </figcaption>
    </figure>
  );
}

export function TurnIndicator({
  theme,
  className,
  player,
  instruction,
  avatar,
  status = "active",
}: ThemedProps & {
  player: string;
  instruction: string;
  avatar?: ReactNode;
  status?: "active" | "waiting" | "done";
}) {
  return (
    <div
      className={classes("game-ui", "turn-indicator", `turn-indicator--${status}`, className)}
      style={themedStyle(theme)}
    >
      <span className="turn-indicator__avatar" aria-hidden="true">
        {avatar ?? player.slice(0, 1).toUpperCase()}
      </span>
      <span>
        <small>{status === "active" ? "Current turn" : status === "done" ? "Turn complete" : "Next turn"}</small>
        <strong>{player}</strong>
      </span>
      <p>{instruction}</p>
    </div>
  );
}

export function RoundTracker({
  theme,
  className,
  current,
  total,
  label = "Round",
}: ThemedProps & { current: number; total: number; label?: string }) {
  const safeTotal = Math.max(total, 1);
  const safeCurrent = Math.min(Math.max(current, 0), safeTotal);
  return (
    <div className={classes("game-ui", "round-tracker", className)} style={themedStyle(theme)}>
      <div>
        <span>{label}</span>
        <b>
          {safeCurrent} / {safeTotal}
        </b>
      </div>
      <ol aria-label={`${label} ${safeCurrent} of ${safeTotal}`}>
        {Array.from({ length: safeTotal }, (_, index) => (
          <li className={index < safeCurrent ? "is-complete" : ""} key={index} />
        ))}
      </ol>
    </div>
  );
}

export function GameTimer({
  theme,
  className,
  seconds,
  totalSeconds,
  label = "Time left",
  urgentAt = 10,
}: ThemedProps & { seconds: number; totalSeconds: number; label?: string; urgentAt?: number }) {
  const safeSeconds = Math.max(0, seconds);
  const progress = totalSeconds > 0 ? Math.min(100, (safeSeconds / totalSeconds) * 100) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return (
    <div
      className={classes("game-ui", "game-timer", safeSeconds <= urgentAt && "is-urgent", className)}
      style={themedStyle(theme)}
    >
      <div className="game-timer__dial" style={{ "--timer-progress": `${progress * 3.6}deg` } as CSSProperties}>
        <strong>
          {minutes}:{remainder.toString().padStart(2, "0")}
        </strong>
      </div>
      <span>{label}</span>
    </div>
  );
}

export type Choice = { id: string; label: string; description?: string; icon?: ReactNode };

export function ChoiceGrid({
  theme,
  className,
  choices,
  selectedId,
  onSelect,
  disabled = false,
  columns = 2,
}: ThemedProps & {
  choices: Choice[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={classes("game-ui", "choice-grid-component", className)}
      style={themedStyle(theme, { "--choice-columns": columns } as CSSProperties)}
      role="group"
    >
      {choices.map((choice) => (
        <button
          type="button"
          className={selectedId === choice.id ? "is-selected" : undefined}
          onClick={() => onSelect?.(choice.id)}
          disabled={disabled}
          aria-pressed={selectedId === choice.id}
          key={choice.id}
        >
          {choice.icon ? <span aria-hidden="true">{choice.icon}</span> : null}
          <strong>{choice.label}</strong>
          {choice.description ? <small>{choice.description}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function TextAnswer({
  theme,
  className,
  value,
  onChange,
  onSubmit,
  label = "Your answer",
  placeholder = "Type here…",
  submitLabel = "Submit",
  multiline = false,
  maxLength = 180,
  disabled = false,
}: ThemedProps & {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  multiline?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit?.();
  }
  const fieldProps = {
    value,
    placeholder,
    maxLength,
    disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <form className={classes("game-ui", "text-answer", className)} style={themedStyle(theme)} onSubmit={submit}>
      <label htmlFor="game-text-answer">{label}</label>
      <div>
        {multiline ? (
          <textarea id="game-text-answer" rows={3} {...fieldProps} />
        ) : (
          <input id="game-text-answer" {...fieldProps} />
        )}
        <GameButton theme={theme} disabled={disabled || !value.trim()}>
          {submitLabel}
        </GameButton>
      </div>
      <small>
        {value.length} / {maxLength}
      </small>
    </form>
  );
}

export type Team = { id: string; name: string; score?: number; members: string[]; icon?: ReactNode };

export function TeamBoard({
  theme,
  className,
  teams,
  activeTeamId,
}: ThemedProps & { teams: Team[]; activeTeamId?: string }) {
  return (
    <div className={classes("game-ui", "team-board", className)} style={themedStyle(theme)}>
      {teams.map((team) => (
        <article className={activeTeamId === team.id ? "is-active" : undefined} key={team.id}>
          <div>
            <span aria-hidden="true">{team.icon ?? "●"}</span>
            <strong>{team.name}</strong>
            {team.score !== undefined ? <b>{team.score}</b> : null}
          </div>
          <ul>
            {team.members.map((member) => (
              <li key={member}>{member}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export type Player = { id: string; name: string; status?: "ready" | "playing" | "waiting"; avatar?: ReactNode };

export function PlayerStrip({
  theme,
  className,
  players,
  activePlayerId,
}: ThemedProps & { players: Player[]; activePlayerId?: string }) {
  return (
    <div
      className={classes("game-ui", "player-strip", className)}
      style={themedStyle(theme)}
      role="list"
      aria-label="Players"
    >
      {players.map((player) => (
        <div
          className={activePlayerId === player.id ? "is-active" : undefined}
          key={player.id}
          title={player.name}
          role="listitem"
        >
          <span aria-hidden="true">{player.avatar ?? player.name.slice(0, 1).toUpperCase()}</span>
          <strong>{player.name}</strong>
          <i className={`status-${player.status ?? "waiting"}`} />
        </div>
      ))}
    </div>
  );
}

export type ScoreEntry = { id: string; label: string; score: number; detail?: string; icon?: ReactNode };

export function ScoreBoard({
  theme,
  className,
  entries,
  title = "Scores",
}: ThemedProps & { entries: ScoreEntry[]; title?: string }) {
  const ranked = [...entries].sort((a, b) => b.score - a.score);
  return (
    <article className={classes("game-ui", "score-board", className)} style={themedStyle(theme)}>
      <h3>{title}</h3>
      <ol>
        {ranked.map((entry, index) => (
          <li key={entry.id}>
            <b>{index + 1}</b>
            <span aria-hidden="true">{entry.icon ?? "●"}</span>
            <p>
              <strong>{entry.label}</strong>
              {entry.detail ? <small>{entry.detail}</small> : null}
            </p>
            <em>{entry.score}</em>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function ClueList({
  theme,
  className,
  clues,
  revealed = clues.length,
  title = "Clues",
}: ThemedProps & { clues: Array<string | null>; revealed?: number; title?: string }) {
  return (
    <article className={classes("game-ui", "clue-list", className)} style={themedStyle(theme)}>
      <div>
        <span>✦</span>
        <h3>{title}</h3>
        <b>
          {Math.min(revealed, clues.length)} / {clues.length}
        </b>
      </div>
      <ol>
        {clues.map((clue, index) => {
          const visible = index < revealed && Boolean(clue);
          return (
            <li className={visible ? "is-revealed" : undefined} key={`${clue ?? "hidden"}-${index}`}>
              <b>{index + 1}</b>
              <span>{visible ? clue : "Locked clue"}</span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function ChallengeCard({
  theme,
  className,
  title,
  instruction,
  difficulty = "medium",
  reward,
  icon = "⚡",
  children,
}: ThemedProps & {
  title: string;
  instruction: string;
  difficulty?: "easy" | "medium" | "hard";
  reward?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const difficultyLabel = { easy: "Easy", medium: "Intermediate", hard: "Hard" }[difficulty];
  return (
    <article
      className={classes("game-ui", "challenge-card", `challenge-card--${difficulty}`, className)}
      style={themedStyle(theme)}
    >
      <div className="challenge-card__icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <span>
          {difficultyLabel}
          {reward ? ` · ${reward}` : ""}
        </span>
        <h3>{title}</h3>
        <p>{instruction}</p>
        {children}
      </div>
    </article>
  );
}

export type SketchPoint = { x: number; y: number };
export type SketchStroke = { id: string; points: SketchPoint[] };

function pointsToPath(points: SketchPoint[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
}

export function DrawingCanvas({
  theme,
  className,
  strokes,
  onChange,
  label = "Drawing area",
  disabled = false,
}: ThemedProps & {
  strokes: SketchStroke[];
  onChange: (strokes: SketchStroke[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draftRef = useRef<SketchStroke | null>(null);
  const [draft, setDraft] = useState<SketchStroke | null>(null);

  function pointFromEvent(event: ReactPointerEvent<SVGSVGElement>): SketchPoint {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((event.clientX - rect.left) / rect.width) * 600, y: ((event.clientY - rect.top) / rect.height) * 340 };
  }

  function startStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { id: `stroke-${strokes.length}-${event.pointerId}`, points: [pointFromEvent(event)] };
    draftRef.current = next;
    setDraft(next);
  }

  function extendStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!draftRef.current || disabled) return;
    const next = { ...draftRef.current, points: [...draftRef.current.points, pointFromEvent(event)] };
    draftRef.current = next;
    setDraft(next);
  }

  function finishStroke() {
    if (!draftRef.current) return;
    if (draftRef.current.points.length > 1) onChange([...strokes, draftRef.current]);
    draftRef.current = null;
    setDraft(null);
  }

  return (
    <article className={classes("game-ui", "drawing-canvas", className)} style={themedStyle(theme)}>
      <div>
        <strong>{label}</strong>
        <GameButton
          theme={theme}
          variant="ghost"
          type="button"
          onClick={() => onChange([])}
          disabled={disabled || strokes.length === 0}
        >
          Clear
        </GameButton>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 600 340"
        role="img"
        aria-label={label}
        onPointerDown={startStroke}
        onPointerMove={extendStroke}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      >
        <title>{label}</title>
        {strokes.map((stroke) => (
          <path d={pointsToPath(stroke.points)} key={stroke.id} />
        ))}
        {draft ? <path d={pointsToPath(draft.points)} /> : null}
      </svg>
    </article>
  );
}

export function RevealPanel({
  theme,
  className,
  label = "Reveal",
  title,
  description,
  revealed = true,
  concealedText = "Tap to reveal",
  onReveal,
  icon = "✦",
}: ThemedProps & {
  label?: string;
  title: string;
  description?: string;
  revealed?: boolean;
  concealedText?: string;
  onReveal?: () => void;
  icon?: ReactNode;
}) {
  return (
    <article
      className={classes("game-ui", "reveal-panel", revealed && "is-revealed", className)}
      style={themedStyle(theme)}
    >
      {revealed ? (
        <>
          <span>{label}</span>
          <b aria-hidden="true">{icon}</b>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </>
      ) : (
        <button type="button" onClick={onReveal}>
          <span aria-hidden="true">?</span>
          <strong>{concealedText}</strong>
        </button>
      )}
    </article>
  );
}

export function OutcomeBanner({
  theme,
  className,
  status,
  title,
  description,
  stats,
  actions,
}: ThemedProps & {
  status: "success" | "failure" | "neutral";
  title: string;
  description?: string;
  stats?: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
}) {
  return (
    <article
      className={classes("game-ui", "outcome-banner", `outcome-banner--${status}`, className)}
      style={themedStyle(theme)}
    >
      <div className="outcome-banner__mark" aria-hidden="true">
        {status === "success" ? "✓" : status === "failure" ? "×" : "◆"}
      </div>
      <div className="outcome-banner__copy">
        <span>Result</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {stats?.length ? (
        <dl>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="outcome-banner__actions">{actions}</div> : null}
    </article>
  );
}
