"use client";

import { useState } from "react";
import type { ComposedGameView, GameAction } from "@boardforge/shared";
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
} from "../../../components/game-ui";
import type { SketchStroke } from "../../../components/game-ui";
import { themeForRoom } from "./stage-shared";
import { useTurnCountdown } from "./turn-timer";

export function ComposedStage({
  view,
  pending,
  sendAction,
}: {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [answer, setAnswer] = useState("");
  const remainingTurnSeconds = useTurnCountdown(view.turnTimer, 60);
  const theme = themeForRoom(view.theme);
  const playerName = (id: string) => view.players.find((player) => player.id === id)?.name ?? "Player";

  function perform(actionId: string, payload?: Extract<GameAction, { type: "COMPOSED_ACTION" }>["payload"]) {
    sendAction({ type: "COMPOSED_ACTION", actionId, ...(payload ? { payload } : {}) });
  }

  const handledActionIds = new Set(
    view.availableActions
      .filter((action) =>
        view.components.some((component) => {
          if (action.kind === "choose") return component.kind === "choices";
          if (action.kind === "text") return component.kind === "text_input";
          if (action.kind === "draw")
            return (
              (component.kind === "deck" || component.kind === "card_zone") && component.data.deckId === action.deckId
            );
          if (action.kind === "play_card")
            return (
              component.kind === "card_zone" &&
              component.data.deckId === action.deckId &&
              component.data.zone === "hand"
            );
          if (action.kind === "move")
            return (
              component.kind === "board" &&
              (component.data.definition as { id?: string } | undefined)?.id === action.boardId
            );
          if (action.kind === "randomize")
            return (
              component.kind === "randomizer" &&
              (component.data.definition as { id?: string } | undefined)?.id === action.randomizerId
            );
          if (action.kind === "buzz") return component.kind === "buzzer";
          if (action.kind === "order") return component.kind === "ordering";
          if (action.kind === "match") return component.kind === "matching";
          if (action.kind === "sketch") return component.kind === "drawing";
          return false;
        }),
      )
      .map((action) => action.id),
  );
  const fallbackActions = view.availableActions.filter((action) => !handledActionIds.has(action.id));
  const hasVisibleOutcome = view.components.some(
    (component) => component.kind === "outcome" && Boolean((component.data as { visible?: boolean }).visible),
  );

  return (
    <GameSurface theme={theme} className="composed-stage">
      <div className="stage-meta composed-stage-meta">
        <span>
          ROUND {view.round}/{view.totalRounds}
        </span>
        <span>{view.phase.title}</span>
      </div>
      <div className="composed-component-stack">
        {view.components.map((component) => {
          if (component.kind === "header") {
            const data = component.data as { eyebrow?: string; title?: string; description?: string; icon?: string };
            return (
              <GameHeader
                theme={theme}
                title={data.title ?? view.title}
                {...(data.eyebrow ? { eyebrow: data.eyebrow } : {})}
                {...(data.description ? { description: data.description } : {})}
                {...(data.icon ? { icon: data.icon } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "prompt") {
            const data = component.data as { category?: string; prompt?: string; hint?: string; icon?: string };
            return (
              <PromptCard
                theme={theme}
                prompt={data.prompt ?? ""}
                {...(data.category ? { category: data.category } : {})}
                {...(data.hint ? { hint: data.hint } : {})}
                {...(data.icon ? { icon: data.icon } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "deck") {
            const data = component.data as {
              label?: string;
              remaining?: number;
              activeCard?: { id: string; title: string; body?: string; icon?: string };
            };
            const cards = data.activeCard
              ? [
                  {
                    id: data.activeCard.id,
                    label: data.activeCard.title,
                    ...(data.activeCard.body ? { detail: data.activeCard.body } : {}),
                    ...(data.activeCard.icon ? { icon: data.activeCard.icon } : {}),
                  },
                ]
              : [
                  {
                    id: "hidden",
                    label: "Card ready to draw",
                    detail: `${data.remaining ?? 0} cards remaining`,
                    icon: "◆",
                  },
                ];
            const action = view.availableActions.find(
              (candidate) => candidate.kind === "draw" && candidate.deckId === component.data.deckId,
            );
            return (
              <CardDeck
                theme={theme}
                cards={cards}
                {...(data.label ? { label: data.label } : {})}
                {...(action ? { onDraw: () => perform(action.id) } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "choices") {
            const data = component.data as {
              title?: string;
              columns?: 1 | 2 | 3;
              choices?: Array<{ id: string; label: string; description?: string; icon?: string }>;
            };
            const action = view.availableActions.find((candidate) => candidate.kind === "choose");
            return (
              <div className="composed-control-block" key={component.id}>
                {data.title ? <p className="game-eyebrow">{data.title}</p> : null}
                <ChoiceGrid
                  theme={theme}
                  choices={data.choices ?? []}
                  columns={data.columns ?? 2}
                  disabled={pending || !action}
                  {...(action ? { onSelect: (choiceId: string) => perform(action.id, { choiceId }) } : {})}
                />
              </div>
            );
          }
          if (component.kind === "text_input") {
            const data = component.data as {
              label?: string;
              placeholder?: string;
              multiline?: boolean;
              maxLength?: number;
            };
            const action = view.availableActions.find((candidate) => candidate.kind === "text");
            return (
              <TextAnswer
                theme={theme}
                label={data.label ?? "Your answer"}
                value={answer}
                onChange={setAnswer}
                {...(data.placeholder ? { placeholder: data.placeholder } : {})}
                multiline={data.multiline ?? false}
                maxLength={data.maxLength ?? 180}
                submitLabel={action?.label ?? "Submit"}
                disabled={pending || !action}
                {...(action
                  ? {
                      onSubmit: () => {
                        perform(action.id, { text: answer });
                        setAnswer("");
                      },
                    }
                  : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "drawing") {
            const data = component.data as { label?: string; strokes?: SketchStroke[] };
            const action = view.availableActions.find((candidate) => candidate.kind === "sketch");
            if (!action)
              return (
                <DrawingCanvas
                  theme={theme}
                  strokes={data.strokes ?? []}
                  onChange={() => {}}
                  label={data.label ?? "Drawing area"}
                  disabled
                  key={component.id}
                />
              );
            return (
              <DrawingCanvas
                theme={theme}
                strokes={data.strokes ?? []}
                onChange={(next) => {
                  if (!next.length && data.strokes?.length) perform(action.id, { clear: true });
                  else {
                    const stroke = next.at(-1);
                    if (stroke && next.length > (data.strokes?.length ?? 0)) perform(action.id, { stroke });
                  }
                }}
                label={data.label ?? "Drawing area"}
                disabled={pending}
                key={component.id}
              />
            );
          }
          if (component.kind === "timer") {
            const data = component.data as { seconds?: number; label?: string };
            return (
              <GameTimer
                theme={theme}
                seconds={view.turnTimer ? remainingTurnSeconds : (data.seconds ?? 60)}
                totalSeconds={data.seconds ?? 60}
                {...(data.label ? { label: data.label } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "turn") {
            const data = component.data as { activePlayerId?: string; activePlayerName?: string };
            return (
              <TurnIndicator
                theme={theme}
                player={data.activePlayerName ?? playerName(data.activePlayerId ?? view.activePlayerId)}
                instruction={
                  view.selfPlayerId === view.activePlayerId ? "It is your turn" : "Get ready for your next turn"
                }
                key={component.id}
              />
            );
          }
          if (component.kind === "round") {
            const data = component.data as { current?: number; total?: number; label?: string };
            return (
              <RoundTracker
                theme={theme}
                current={data.current ?? view.round}
                total={data.total ?? view.totalRounds}
                {...(data.label ? { label: data.label } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "teams") {
            const activeTeamId = view.teams.find((team) => team.playerIds.includes(view.activePlayerId))?.id;
            return (
              <TeamBoard
                theme={theme}
                {...(activeTeamId ? { activeTeamId } : {})}
                teams={view.teams.map((team) => ({
                  id: team.id,
                  name: team.name,
                  members: team.playerIds.map(playerName),
                  score: view.scores.teams[team.id] ?? 0,
                }))}
                key={component.id}
              />
            );
          }
          if (component.kind === "players") {
            return (
              <PlayerStrip
                theme={theme}
                activePlayerId={view.activePlayerId}
                players={view.players.map((player) => ({
                  id: player.id,
                  name: player.name,
                  status: player.id === view.activePlayerId ? "playing" : player.connected ? "ready" : "waiting",
                }))}
                key={component.id}
              />
            );
          }
          if (component.kind === "scores") {
            const data = component.data as { title?: string };
            const entries = view.teams.length
              ? view.teams.map((team) => ({ id: team.id, label: team.name, score: view.scores.teams[team.id] ?? 0 }))
              : view.players.map((player) => ({
                  id: player.id,
                  label: player.name,
                  score: view.scores.players[player.id] ?? 0,
                }));
            return (
              <ScoreBoard
                theme={theme}
                {...(data.title ? { title: data.title } : {})}
                entries={entries}
                key={component.id}
              />
            );
          }
          if (component.kind === "clues") {
            const data = component.data as { title?: string; clues?: Array<{ id: string; text?: string }> };
            const clues = (data.clues ?? []).map((clue) => clue.text ?? null);
            return (
              <ClueList
                theme={theme}
                clues={clues}
                revealed={clues.length}
                {...(data.title ? { title: data.title } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "challenge") {
            const data = component.data as {
              title?: string;
              instruction?: string;
              difficulty?: "easy" | "medium" | "hard";
              rewardLabel?: string;
              icon?: string;
            };
            return (
              <ChallengeCard
                theme={theme}
                title={data.title ?? "Challenge"}
                instruction={data.instruction ?? "Complete the challenge."}
                difficulty={data.difficulty ?? "medium"}
                {...(data.rewardLabel ? { reward: data.rewardLabel } : {})}
                {...(data.icon ? { icon: data.icon } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "reveal") {
            const data = component.data as {
              revealed?: boolean;
              content?: { title: string; description?: string; icon?: string };
            };
            return (
              <RevealPanel
                theme={theme}
                revealed={Boolean(data.revealed)}
                title={data.content?.title ?? "Reveal locked"}
                {...(data.content?.description ? { description: data.content.description } : {})}
                {...(data.content?.icon ? { icon: data.content.icon } : {})}
                concealedText="Reveal locked"
                key={component.id}
              />
            );
          }
          if (component.kind === "outcome") {
            const data = component.data as { visible?: boolean; title?: string; description?: string };
            return data.visible ? (
              <OutcomeBanner
                theme={theme}
                status="success"
                title={data.title ?? "Game complete"}
                {...(data.description ? { description: data.description } : {})}
                {...(view.status === "completed"
                  ? {
                      actions: (
                        <a className="composed-new-game" href="/">
                          Choose another game →
                        </a>
                      ),
                    }
                  : {})}
                key={component.id}
              />
            ) : null;
          }
          if (component.kind === "board") {
            const data = component.data as {
              definition?: {
                id: string;
                name: string;
                layout: "track" | "grid" | "zones";
                spaces: Array<{ id: string; label: string }>;
                tokens: Array<{ id: string; label: string }>;
              };
              tokens?: Record<
                string,
                {
                  id: string;
                  definitionId: string;
                  ownerType: "global" | "player" | "team";
                  ownerId: string | null;
                  spaceId: string;
                }
              >;
            };
            if (!data.definition) return null;
            const ownTeamId = view.teams.find((team) => team.playerIds.includes(view.selfPlayerId))?.id;
            const action = view.availableActions.find(
              (candidate) => candidate.kind === "move" && candidate.boardId === data.definition?.id,
            );
            const tokens = Object.values(data.tokens ?? {}).map((token) => ({
              id: token.id,
              label:
                data.definition?.tokens.find((definition) => definition.id === token.definitionId)?.label ?? token.id,
              spaceId: token.spaceId,
              owned: token.ownerType === "global" || token.ownerId === view.selfPlayerId || token.ownerId === ownTeamId,
            }));
            return (
              <GameBoard
                theme={theme}
                title={data.definition.name}
                layout={data.definition.layout}
                spaces={data.definition.spaces}
                tokens={tokens}
                actionLabel={action?.label ?? "Move"}
                disabled={pending || !action}
                {...(action
                  ? { onMove: (tokenId: string, spaceId: string) => perform(action.id, { tokenId, spaceId }) }
                  : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "card_zone") {
            const data = component.data as {
              deckId?: string;
              zone?: "hand" | "draw" | "discard" | "table";
              cards?: Array<{ id: string; title: string; body?: string; icon?: string } | string | null>;
            };
            const action = view.availableActions.find(
              (candidate) => candidate.kind === "play_card" && candidate.deckId === data.deckId,
            );
            const cards = (data.cards ?? []).filter(
              (card): card is { id: string; title: string; body?: string; icon?: string } =>
                typeof card === "object" && card !== null && "id" in card,
            );
            const labels = {
              hand: "Your hand",
              draw: "Draw pile",
              discard: "Discard pile",
              table: "Cards in play",
            } as const;
            return (
              <CardZone
                theme={theme}
                cards={cards}
                label={labels[data.zone ?? "table"]}
                actionLabel={action?.label ?? "Play card"}
                disabled={pending || !action}
                {...(action ? { onPlay: (cardId: string) => perform(action.id, { cardId }) } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "resources") {
            const data = component.data as {
              definitions?: Array<{
                id: string;
                name: string;
                icon?: string;
                scope: "global" | "player" | "team";
                min: number;
                max: number;
              }>;
              global?: Record<string, number>;
              own?: Record<string, number>;
              team?: Record<string, number>;
            };
            const resources = (data.definitions ?? []).map((definition) => ({
              ...definition,
              value:
                definition.scope === "global"
                  ? (data.global?.[definition.id] ?? 0)
                  : definition.scope === "team"
                    ? (data.team?.[definition.id] ?? 0)
                    : (data.own?.[definition.id] ?? 0),
            }));
            return <ResourcePanel theme={theme} resources={resources} key={component.id} />;
          }
          if (component.kind === "randomizer") {
            const data = component.data as {
              definition?:
                | { id: string; kind: "die"; label: string }
                | { id: string; kind: "spinner"; label: string; options: Array<{ id: string; label: string }> };
              result?: string | number;
            };
            if (!data.definition) return null;
            const action = view.availableActions.find(
              (candidate) => candidate.kind === "randomize" && candidate.randomizerId === data.definition?.id,
            );
            const result =
              data.definition.kind === "spinner" && typeof data.result === "string"
                ? (data.definition.options.find((option) => option.id === data.result)?.label ?? data.result)
                : data.result;
            return (
              <RandomizerPanel
                theme={theme}
                label={data.definition.label}
                kind={data.definition.kind}
                {...(result !== undefined ? { result } : {})}
                actionLabel={action?.label ?? "Roll"}
                disabled={pending || !action}
                {...(action ? { onTrigger: () => perform(action.id) } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "buzzer") {
            const data = component.data as { label?: string; claimedByPlayerId?: string };
            const action = view.availableActions.find((candidate) => candidate.kind === "buzz");
            return (
              <Buzzer
                theme={theme}
                label={data.label ?? "Buzzer"}
                {...(data.claimedByPlayerId ? { claimedBy: playerName(data.claimedByPlayerId) } : {})}
                disabled={pending || !action}
                {...(action ? { onBuzz: () => perform(action.id) } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "ordering") {
            const data = component.data as { items?: Array<{ id: string; label: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "order");
            return (
              <OrderingBoard
                theme={theme}
                items={data.items ?? []}
                actionLabel={action?.label ?? "Submit order"}
                disabled={pending || !action}
                {...(action ? { onSubmit: (orderedIds: string[]) => perform(action.id, { orderedIds }) } : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "matching") {
            const data = component.data as { items?: Array<{ id: string; label: string }> };
            const action = view.availableActions.find((candidate) => candidate.kind === "match");
            return (
              <MatchingBoard
                theme={theme}
                items={data.items ?? []}
                actionLabel={action?.label ?? "Submit matches"}
                disabled={pending || !action}
                {...(action
                  ? { onSubmit: (pairs: Array<{ leftId: string; rightId: string }>) => perform(action.id, { pairs }) }
                  : {})}
                key={component.id}
              />
            );
          }
          if (component.kind === "media") {
            const data = component.data as {
              media?: { kind: "image" | "audio" | "video"; title: string; url: string; alt: string };
            };
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
              const options = action.options.map((option) => ({
                id: option.id,
                label: option.label,
                ...(option.description ? { description: option.description } : {}),
                ...(option.icon ? { icon: option.icon } : {}),
              }));
              return (
                <ChoiceGrid
                  theme={theme}
                  choices={options}
                  onSelect={(choiceId) => perform(action.id, { choiceId })}
                  disabled={pending}
                  key={action.id}
                />
              );
            }
            if (action.kind === "text") {
              return (
                <TextAnswer
                  theme={theme}
                  value={answer}
                  onChange={setAnswer}
                  onSubmit={() => {
                    perform(action.id, { text: answer });
                    setAnswer("");
                  }}
                  submitLabel={action.label}
                  disabled={pending}
                  key={action.id}
                />
              );
            }
            const directlyExecutable = [
              "advance",
              "draw",
              "resource",
              "randomize",
              "buzz",
              "complete_challenge",
            ].includes(action.kind);
            return (
              <GameButton
                theme={theme}
                disabled={pending || !directlyExecutable}
                onClick={() => perform(action.id)}
                key={action.id}
              >
                {action.label}
              </GameButton>
            );
          })}
        </div>
      ) : null}

      {view.status === "completed" && !hasVisibleOutcome ? (
        <OutcomeBanner
          theme={theme}
          status="success"
          title="What a night."
          description="One winner, plenty of stories, and every reason to play again."
          actions={
            <a className="composed-new-game" href="/">
              Choose another game →
            </a>
          }
        />
      ) : null}
    </GameSurface>
  );
}
