import type { ActionDefinition, ComposedComponent, ComposedGameSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import type { ComposedGameState, ResolvedComponentView } from "./composed-types";

function opponentId(state: ComposedGameState, actorId: string): string {
  const opponent = state.playerOrder.find((playerId) => playerId !== actorId);
  if (!opponent || state.playerOrder.length !== 2) throw new Error("WordDuel requires exactly two players.");
  return opponent;
}

function componentVisible(component: ComposedComponent, state: ComposedGameState, viewer: PublicPlayer): boolean {
  if (component.audience === "public") return true;
  if (component.audience === "host") return viewer.isHost;
  if (component.audience === "active_player") return viewer.id === state.activePlayerId;
  return (
    Boolean(state.teamByPlayer[viewer.id]) && state.teamByPlayer[viewer.id] === state.teamByPlayer[state.activePlayerId]
  );
}

function cardDefinition(spec: ComposedGameSpec, deckId: string, cardId: string | undefined) {
  return cardId ? spec.decks.find((deck) => deck.id === deckId)?.cards.find((card) => card.id === cardId) : undefined;
}

function resolveText(
  source: Extract<ComposedComponent, { kind: "header" }>["title"],
  state: ComposedGameState,
  spec: ComposedGameSpec,
): string {
  if (source.kind === "literal") return source.value;
  if (source.kind === "variable") return String(state.variables[source.variableId] ?? "");
  if (source.kind === "active_card") {
    const cardId = state.activeCards[state.activePlayerId]?.[source.deckId];
    const card = cardDefinition(spec, source.deckId, cardId);
    return source.field === "title" ? (card?.title ?? "") : (card?.body ?? "");
  }
  const record = [...state.actions].reverse().find((action) => action.actionId === source.actionId);
  return record?.payload.text ?? record?.payload.choiceId ?? record?.payload.cardId ?? "";
}

function componentView(
  component: ComposedComponent,
  state: ComposedGameState,
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  viewerId: string,
): ResolvedComponentView {
  const base = { id: component.id, kind: component.kind };
  if (component.kind === "header")
    return {
      ...base,
      data: {
        eyebrow: component.eyebrow,
        title: resolveText(component.title, state, spec),
        description: component.description ? resolveText(component.description, state, spec) : undefined,
        icon: component.icon,
      },
    };
  if (component.kind === "prompt")
    return {
      ...base,
      data: {
        category: component.category,
        prompt: resolveText(component.prompt, state, spec),
        hint: component.hint ? resolveText(component.hint, state, spec) : undefined,
        icon: component.icon,
      },
    };
  if (component.kind === "deck") {
    const deck = state.decks[component.deckId];
    const activeCardId = state.activeCards[viewerId]?.[component.deckId];
    return {
      ...base,
      data: {
        deckId: component.deckId,
        label: component.label,
        remaining: deck?.drawPile.length ?? 0,
        activeCard: cardDefinition(spec, component.deckId, activeCardId),
      },
    };
  }
  if (component.kind === "choices")
    return {
      ...base,
      data: {
        title: component.title,
        columns: component.columns,
        choices: spec.choices
          .filter((choice) => component.optionIds.includes(choice.id))
          .map(({ correct: _correct, ...choice }) => choice),
      },
    };
  if (component.kind === "text_input")
    return {
      ...base,
      data: {
        label: component.label,
        placeholder: component.placeholder,
        multiline: component.multiline,
        maxLength: component.maxLength,
      },
    };
  if (component.kind === "drawing")
    return {
      ...base,
      data: { label: component.label, strokes: state.sketches?.[`${state.phaseId}:${state.phaseVisit}`] ?? [] },
    };
  if (component.kind === "timer") return { ...base, data: { seconds: component.seconds, label: component.label } };
  if (component.kind === "turn")
    return {
      ...base,
      data: {
        activePlayerId: state.activePlayerId,
        activePlayerName: players.find((player) => player.id === state.activePlayerId)?.name ?? "",
      },
    };
  if (component.kind === "round")
    return {
      ...base,
      data: { current: Math.min(state.round, spec.setup.rounds), total: spec.setup.rounds, label: component.label },
    };
  if (component.kind === "teams") return { ...base, data: { teams: state.teams } };
  if (component.kind === "players") return { ...base, data: { players } };
  if (component.kind === "scores") return { ...base, data: { title: component.title, scores: state.scores } };
  if (component.kind === "clues")
    return {
      ...base,
      data: {
        title: component.title,
        clues: component.clueIds.map((id) => ({
          id,
          text: state.revealedIds.includes(id) ? spec.clues.find((clue) => clue.id === id)?.text : undefined,
        })),
      },
    };
  if (component.kind === "challenge")
    return {
      ...base,
      data: {
        title: resolveText(component.title, state, spec),
        instruction: resolveText(component.instruction, state, spec),
        difficulty: component.difficulty,
        rewardLabel: component.rewardLabel,
        icon: component.icon,
      },
    };
  if (component.kind === "reveal")
    return {
      ...base,
      data: {
        revealed: state.revealedIds.includes(component.revealId),
        content: state.revealedIds.includes(component.revealId)
          ? spec.reveals.find((reveal) => reveal.id === component.revealId)
          : undefined,
      },
    };
  if (component.kind === "outcome")
    return {
      ...base,
      data: {
        visible: state.status === "completed",
        title: resolveText(component.title, state, spec),
        description: component.description ? resolveText(component.description, state, spec) : undefined,
        winner: state.winner,
      },
    };
  if (component.kind === "board")
    return {
      ...base,
      data: {
        definition: spec.boards.find((board) => board.id === component.boardId),
        tokens: state.boardTokens[component.boardId] ?? {},
      },
    };
  if (component.kind === "card_zone") {
    const deck = state.decks[component.deckId];
    const cardIds =
      component.zone === "hand"
        ? (deck?.handsByPlayer[viewerId] ?? [])
        : component.zone === "draw"
          ? (deck?.drawPile.map(() => "hidden") ?? [])
          : component.zone === "discard"
            ? (deck?.discardPile ?? [])
            : (deck?.table ?? []);
    return {
      ...base,
      data: {
        deckId: component.deckId,
        zone: component.zone,
        cards: component.zone === "draw" ? cardIds : cardIds.map((id) => cardDefinition(spec, component.deckId, id)),
      },
    };
  }
  if (component.kind === "resources")
    return {
      ...base,
      data: {
        definitions: spec.resources.filter((resource) => component.resourceIds.includes(resource.id)),
        global: state.resources.global,
        own: state.resources.players[viewerId] ?? {},
        team: state.teamByPlayer[viewerId] ? (state.resources.teams[state.teamByPlayer[viewerId]!] ?? {}) : {},
      },
    };
  if (component.kind === "randomizer")
    return {
      ...base,
      data: {
        definition: spec.randomizers.find((randomizer) => randomizer.id === component.randomizerId),
        result: state.randomResults[component.randomizerId],
      },
    };
  if (component.kind === "buzzer")
    return { ...base, data: { label: component.label, claimedByPlayerId: state.buzzes[state.phaseId] } };
  if (component.kind === "ordering")
    return {
      ...base,
      data: {
        items: (state.itemOrders[component.id] ?? component.itemIds).map((id) => {
          const item = spec.orderingItems.find((candidate) => candidate.id === id);
          return item ? { id: item.id, label: item.label } : { id, label: id };
        }),
      },
    };
  if (component.kind === "matching")
    return {
      ...base,
      data: {
        items: (state.itemOrders[component.id] ?? component.itemIds).map((id) => {
          const item = spec.matchingItems.find((candidate) => candidate.id === id);
          return item ? { id: item.id, label: item.label } : { id, label: id };
        }),
      },
    };
  if (component.kind === "media")
    return { ...base, data: { media: spec.media.find((media) => media.id === component.mediaId) } };
  if (component.kind === "story")
    return {
      ...base,
      data: {
        label: component.label,
        opening: resolveText(component.opening, state, spec),
        entries: state.actions
          .filter((record) => record.actionId === component.actionId && typeof record.payload.text === "string")
          .map((record) => ({
            sequence: record.sequence,
            round: record.round,
            actorId: record.actorId,
            actorName: players.find((player) => player.id === record.actorId)?.name ?? "Player",
            text: record.payload.text,
          })),
      },
    };
  if (component.kind === "word_duel") {
    const duel = state.wordDuels[component.id];
    const opponentPlayerId = opponentId(state, viewerId);
    const secretWord = duel?.secretWordsByPlayer[opponentPlayerId];
    const guessedLetters = duel?.guessedLettersByPlayer[viewerId] ?? [];
    const guessedSet = new Set(guessedLetters);
    const opponentMask = secretWord
      ? [...secretWord].map((letter) => (state.status === "completed" || guessedSet.has(letter) ? letter : "_"))
      : [];
    const keyboard = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => ({
      letter,
      state: !guessedSet.has(letter) ? "available" : secretWord?.includes(letter) ? "correct" : "wrong",
    }));
    const lastGuess = duel?.lastGuess
      ? {
          ...duel.lastGuess,
          value:
            duel.lastGuess.kind === "letter" || duel.lastGuess.correct || duel.lastGuess.actorId === viewerId
              ? duel.lastGuess.value
              : undefined,
        }
      : null;
    return {
      ...base,
      data: {
        minLength: component.minLength,
        maxLength: component.maxLength,
        hasSubmitted: Boolean(duel?.secretWordsByPlayer[viewerId]),
        submittedPlayerIds: Object.keys(duel?.secretWordsByPlayer ?? {}),
        ownWord: duel?.secretWordsByPlayer[viewerId],
        opponentId: opponentPlayerId,
        opponentName: players.find((player) => player.id === opponentPlayerId)?.name ?? "Opponent",
        opponentMask,
        wordLength: secretWord?.length ?? null,
        keyboard,
        misses: guessedLetters.filter((letter) => !secretWord?.includes(letter)),
        incorrectWordAttempts: duel?.incorrectWordsByPlayer[viewerId] ?? [],
        lastGuess,
      },
    };
  }
  if (component.kind === "second_sense") {
    const sense = state.secondSenses[component.id];
    const revealVisible = sense?.stageStatus === "reveal" || state.status === "completed";
    const qualifiedIds = new Set(sense?.lastRound?.qualifiedPlayerIds ?? []);
    return {
      ...base,
      data: {
        minTargetMs: component.minTargetMs,
        maxTargetMs: component.maxTargetMs,
        stage: sense?.stage ?? 1,
        stageStatus: sense?.stageStatus ?? "open",
        targetMs: sense?.targetMs ?? component.minTargetMs,
        activePlayerIds: sense?.activePlayerIds ?? [],
        startedPlayerIds: sense?.startedPlayerIds ?? [],
        lockedPlayerIds: Object.keys(sense?.attemptsByPlayer ?? {}),
        ownAttemptMs: sense?.attemptsByPlayer[viewerId],
        playerStates: players.map((player) => ({
          playerId: player.id,
          name: player.name,
          status: !(sense?.activePlayerIds.includes(player.id) ?? false)
            ? "eliminated"
            : revealVisible
              ? qualifiedIds.has(player.id)
                ? "qualified"
                : "eliminated"
              : sense?.attemptsByPlayer[player.id] !== undefined
                ? "locked"
                : sense?.startedPlayerIds.includes(player.id)
                  ? "timing"
                  : "ready",
        })),
        lastRound: revealVisible ? sense?.lastRound : null,
        previousTargetMs: sense && sense.targetHistory.length > 1 ? sense.targetHistory.at(-2) : null,
      },
    };
  }
  return { ...base, data: {} };
}

export function specializedActionAvailable(
  state: ComposedGameState,
  action: ActionDefinition,
  playerId: string,
): boolean {
  if (action.kind !== "timing_start" && action.kind !== "timing_stop" && action.kind !== "timing_advance") return true;
  const sense = action.secondSenseId ? state.secondSenses[action.secondSenseId] : undefined;
  if (!sense) return false;
  if (action.kind === "timing_advance") return sense.stageStatus === "reveal";
  if (sense.stageStatus !== "open" || !sense.activePlayerIds.includes(playerId)) return false;
  const started = sense.startedPlayerIds.includes(playerId);
  const stopped = sense.attemptsByPlayer[playerId] !== undefined;
  return action.kind === "timing_start" ? !started && !stopped : started && !stopped;
}

export function resolveComposedComponents(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  viewer: PublicPlayer,
  componentIds: string[],
): ResolvedComponentView[] {
  return spec.components
    .filter((component) => componentIds.includes(component.id) && componentVisible(component, state, viewer))
    .map((component) => componentView(component, state, spec, players, viewer.id));
}
