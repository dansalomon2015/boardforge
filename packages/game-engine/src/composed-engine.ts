import type {
  ActionDefinition,
  AtomicCondition,
  ComposedComponent,
  ComposedGameSpec,
  Effect,
  PhaseDefinition,
} from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { resolveComposedComponents, specializedActionAvailable } from "./composed-projection";
import { ComposedGameRuleError } from "./composed-errors";
import { nextRandom, secondSenseTarget, seededShuffle } from "./composed-random";

import type { ComposedActionPayload, ComposedGameAction, ComposedGameState, ComposedGameView } from "./composed-types";
export type * from "./composed-types";

export { ComposedGameRuleError } from "./composed-errors";

export {
  canStartComposedGame,
  initializeComposedGame,
  validateComposedTeamSelection,
  type ComposedTeamSelectionValidation,
} from "./composed-initialization";

function phaseFor(spec: ComposedGameSpec, phaseId: string): PhaseDefinition {
  const phase = spec.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new ComposedGameRuleError(`Unknown phase: ${phaseId}.`);
  return phase;
}

function actionFor(spec: ComposedGameSpec, actionId: string): ActionDefinition {
  const action = spec.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new ComposedGameRuleError(`Unknown action: ${actionId}.`);
  return action;
}

function cardDefinition(spec: ComposedGameSpec, deckId: string, cardId: string | undefined) {
  return cardId ? spec.decks.find((deck) => deck.id === deckId)?.cards.find((card) => card.id === cardId) : undefined;
}

function isActorAllowed(state: ComposedGameState, action: ActionDefinition, actorId: string, isHost: boolean): boolean {
  if (action.actor === "host") return isHost;
  if (action.actor === "active_player") return actorId === state.activePlayerId;
  if (action.actor === "team_captain") {
    const activeTeamId = state.teamByPlayer[state.activePlayerId];
    return Boolean(activeTeamId && state.captainByTeam?.[activeTeamId] === actorId);
  }
  if (action.actor === "opponents") {
    const actorTeamId = state.teamByPlayer[actorId];
    const activeTeamId = state.teamByPlayer[state.activePlayerId];
    return Boolean(actorTeamId && activeTeamId && actorTeamId !== activeTeamId);
  }
  if (action.actor === "guessers") return actorId !== state.activePlayerId && Boolean(state.teamByPlayer[actorId]);
  if (action.actor === "team")
    return (
      Boolean(state.teamByPlayer[actorId]) && state.teamByPlayer[actorId] === state.teamByPlayer[state.activePlayerId]
    );
  return state.playerOrder.includes(actorId);
}

function normalizeDuelWord(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function wordDuelComponent(
  spec: ComposedGameSpec,
  wordDuelId: string | undefined,
): Extract<ComposedComponent, { kind: "word_duel" }> {
  const component = spec.components.find(
    (candidate): candidate is Extract<ComposedComponent, { kind: "word_duel" }> =>
      candidate.kind === "word_duel" && candidate.id === wordDuelId,
  );
  if (!component) throw new ComposedGameRuleError("This word duel is not configured.");
  return component;
}

function secondSenseComponent(
  spec: ComposedGameSpec,
  secondSenseId: string | undefined,
): Extract<ComposedComponent, { kind: "second_sense" }> {
  const component = spec.components.find(
    (candidate): candidate is Extract<ComposedComponent, { kind: "second_sense" }> =>
      candidate.kind === "second_sense" && candidate.id === secondSenseId,
  );
  if (!component) throw new ComposedGameRuleError("This Second Sense board is not configured.");
  return component;
}

function opponentId(state: ComposedGameState, actorId: string): string {
  const opponent = state.playerOrder.find((playerId) => playerId !== actorId);
  if (!opponent || state.playerOrder.length !== 2)
    throw new ComposedGameRuleError("WordDuel requires exactly two players.");
  return opponent;
}

function validatePayload(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  action: ActionDefinition,
  actorId: string,
  payload: ComposedActionPayload,
): boolean | null {
  if (action.kind === "timing_start" || action.kind === "timing_stop" || action.kind === "timing_advance") {
    const component = secondSenseComponent(spec, action.secondSenseId);
    const sense = state.secondSenses[component.id];
    if (!sense) throw new ComposedGameRuleError("This timing round is not ready.");
    if (action.kind === "timing_advance") {
      if (sense.stageStatus !== "reveal")
        throw new ComposedGameRuleError("The current timing round is not ready to advance.");
      return null;
    }
    if (sense.stageStatus !== "open") throw new ComposedGameRuleError("Wait for the next target.");
    if (!sense.activePlayerIds.includes(actorId)) throw new ComposedGameRuleError("This player has been eliminated.");
    const started = sense.startedPlayerIds.includes(actorId);
    const stopped = sense.attemptsByPlayer[actorId] !== undefined;
    if (action.kind === "timing_start") {
      if (started || stopped) throw new ComposedGameRuleError("Your clock has already started.");
      return null;
    }
    if (!started) throw new ComposedGameRuleError("Touch once to start your clock before stopping it.");
    if (stopped) throw new ComposedGameRuleError("Your time is already locked.");
    if (!Number.isInteger(payload.elapsedMs) || payload.elapsedMs! < 100 || payload.elapsedMs! > 30_000) {
      throw new ComposedGameRuleError("Submit one measured duration between 0.10 and 30.00 seconds.");
    }
    return null;
  }
  if (action.kind === "secret_word") {
    const component = wordDuelComponent(spec, action.wordDuelId);
    const word = normalizeDuelWord(payload.text ?? "");
    if (!/^[A-Z]+$/.test(word) || word.length < component.minLength || word.length > component.maxLength) {
      throw new ComposedGameRuleError(
        `Choose one English word containing ${component.minLength} to ${component.maxLength} letters.`,
      );
    }
    const duel = state.wordDuels[component.id];
    if (!duel) throw new ComposedGameRuleError("This word duel is not ready.");
    if (duel.secretWordsByPlayer[actorId]) throw new ComposedGameRuleError("Your secret word is already locked.");
    return null;
  }
  if (action.kind === "letter_guess") {
    const component = wordDuelComponent(spec, action.wordDuelId);
    const letter = normalizeDuelWord(payload.text ?? "");
    if (!/^[A-Z]$/.test(letter)) throw new ComposedGameRuleError("Choose exactly one letter.");
    const duel = state.wordDuels[component.id];
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord) throw new ComposedGameRuleError("Both secret words must be locked before guessing.");
    if (duel.guessedLettersByPlayer[actorId]?.includes(letter))
      throw new ComposedGameRuleError("That letter has already been played.");
    return secretWord.includes(letter);
  }
  if (action.kind === "word_guess") {
    const component = wordDuelComponent(spec, action.wordDuelId);
    const guess = normalizeDuelWord(payload.text ?? "");
    if (!/^[A-Z]+$/.test(guess) || guess.length < component.minLength || guess.length > component.maxLength)
      throw new ComposedGameRuleError("Enter one complete word within the allowed length.");
    const duel = state.wordDuels[component.id];
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord) throw new ComposedGameRuleError("Both secret words must be locked before guessing.");
    if (duel.incorrectWordsByPlayer[actorId]?.includes(guess))
      throw new ComposedGameRuleError("That word has already been attempted.");
    return guess === secretWord;
  }
  if (action.kind === "choose") {
    if (!payload.choiceId || !action.optionIds?.includes(payload.choiceId))
      throw new ComposedGameRuleError("Choose actions require a known choiceId.");
    return spec.choices.find((choice) => choice.id === payload.choiceId)?.correct ?? null;
  }
  if (action.kind === "text") {
    if (!payload.text?.trim() || payload.text.length > 600)
      throw new ComposedGameRuleError("Text actions require a non-empty response of at most 600 characters.");
    const normalize = (value: string) =>
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    if (action.requiredWordDeckId) {
      const cardId = state.activeCards[state.activePlayerId]?.[action.requiredWordDeckId];
      const requiredWord = cardDefinition(spec, action.requiredWordDeckId, cardId)?.title;
      if (!requiredWord)
        throw new ComposedGameRuleError("No secret writing constraint is available for this text action.");
      const normalizedText = ` ${normalize(payload.text)} `;
      const normalizedWord = normalize(requiredWord);
      if (!normalizedWord || !normalizedText.includes(` ${normalizedWord} `)) {
        throw new ComposedGameRuleError(`Your contribution must include the word “${requiredWord}”.`);
      }
      return true;
    }
    if (!action.answerDeckId) return null;
    const cardId = state.activeCards[state.activePlayerId]?.[action.answerDeckId];
    const answer = cardDefinition(spec, action.answerDeckId, cardId)?.title;
    if (!answer) throw new ComposedGameRuleError("No secret answer is available for this text action.");
    return normalize(payload.text) === normalize(answer);
  }
  if (action.kind === "play_card") {
    if (
      !action.deckId ||
      !payload.cardId ||
      !state.decks[action.deckId]?.handsByPlayer[actorId]?.includes(payload.cardId)
    )
      throw new ComposedGameRuleError("The selected card is not in the actor's hand.");
    return null;
  }
  if (action.kind === "move") {
    if (!action.boardId || !payload.tokenId || !payload.spaceId)
      throw new ComposedGameRuleError("Move actions require tokenId and spaceId.");
    const token = state.boardTokens[action.boardId]?.[payload.tokenId];
    const board = spec.boards.find((candidate) => candidate.id === action.boardId);
    if (!token || !board?.spaces.some((space) => space.id === payload.spaceId))
      throw new ComposedGameRuleError("Unknown token or destination space.");
    const actorTeam = state.teamByPlayer[actorId];
    if (token.ownerType === "player" && token.ownerId !== actorId)
      throw new ComposedGameRuleError("A player can only move their own token.");
    if (token.ownerType === "team" && token.ownerId !== actorTeam)
      throw new ComposedGameRuleError("A player can only move their team's token.");
    return null;
  }
  if (action.kind === "order") {
    if (
      !payload.orderedIds ||
      !action.itemIds ||
      payload.orderedIds.length !== action.itemIds.length ||
      new Set(payload.orderedIds).size !== action.itemIds.length ||
      payload.orderedIds.some((id) => !action.itemIds?.includes(id))
    )
      throw new ComposedGameRuleError("Ordering actions must submit every configured item exactly once.");
    const correctOrder = [...action.itemIds].sort(
      (left, right) =>
        (spec.orderingItems.find((item) => item.id === left)?.rank ?? 0) -
        (spec.orderingItems.find((item) => item.id === right)?.rank ?? 0),
    );
    return payload.orderedIds.every((id, index) => id === correctOrder[index]);
  }
  if (action.kind === "match") {
    if (!payload.pairs || !action.itemIds) throw new ComposedGameRuleError("Matching actions require pairs.");
    const submittedIds = payload.pairs.flatMap((pair) => [pair.leftId, pair.rightId]);
    if (
      submittedIds.length !== action.itemIds.length ||
      new Set(submittedIds).size !== action.itemIds.length ||
      submittedIds.some((id) => !action.itemIds?.includes(id))
    )
      throw new ComposedGameRuleError("Matching actions must use every configured item exactly once.");
    return payload.pairs.every((pair) => {
      const left = spec.matchingItems.find((item) => item.id === pair.leftId);
      const right = spec.matchingItems.find((item) => item.id === pair.rightId);
      return Boolean(left && right && left.pairId === right.pairId);
    });
  }
  if (action.kind === "select_player") {
    const actorTeamId = state.teamByPlayer[actorId];
    if (!payload.targetPlayerId || !actorTeamId || state.teamByPlayer[payload.targetPlayerId] !== actorTeamId) {
      throw new ComposedGameRuleError("Captains must select an active player from their own team.");
    }
    return null;
  }
  if (action.kind === "buzz" && state.buzzes[state.phaseId])
    throw new ComposedGameRuleError("The buzzer has already been claimed in this phase.");
  if (action.kind === "sketch") {
    if (payload.clear === true && !payload.stroke) return null;
    const stroke = payload.stroke;
    if (!stroke || !/^[A-Za-z0-9_-]{1,80}$/.test(stroke.id) || stroke.points.length < 2 || stroke.points.length > 160) {
      throw new ComposedGameRuleError("Sketch actions require one bounded stroke or a clear command.");
    }
    if (
      stroke.points.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.x > 600 ||
          point.y < 0 ||
          point.y > 340,
      )
    ) {
      throw new ComposedGameRuleError("Sketch points must stay inside the drawing canvas.");
    }
    return null;
  }
  return action.kind === "complete_challenge" ? true : null;
}

function clampResource(spec: ComposedGameSpec, resourceId: string, value: number): number {
  const definition = spec.resources.find((resource) => resource.id === resourceId);
  if (!definition) throw new ComposedGameRuleError(`Unknown resource: ${resourceId}.`);
  return Math.min(definition.max, Math.max(definition.min, value));
}

function targetOwner(
  state: ComposedGameState,
  target: "global" | "actor" | "active_player" | "actor_team",
  actorId: string,
): { kind: "global" | "player" | "team"; id?: string } {
  if (target === "global") return { kind: "global" };
  if (target === "actor") return { kind: "player", id: actorId };
  if (target === "active_player") return { kind: "player", id: state.activePlayerId };
  const teamId = state.teamByPlayer[actorId];
  if (!teamId) throw new ComposedGameRuleError("This effect requires the actor to belong to a team.");
  return { kind: "team", id: teamId };
}

function reshuffleDiscard(state: ComposedGameState, deckId: string) {
  const deck = state.decks[deckId];
  if (!deck || deck.drawPile.length || !deck.discardPile.length) return;
  deck.drawPile = seededShuffle(deck.discardPile, `${state.seed}:reshuffle:${deckId}:${state.randomCounter}`);
  deck.discardPile = [];
  state.randomCounter += 1;
}

function drawCards(state: ComposedGameState, deckId: string, playerId: string, count: number) {
  const deck = state.decks[deckId];
  if (!deck) throw new ComposedGameRuleError(`Unknown deck: ${deckId}.`);
  for (let index = 0; index < count; index += 1) {
    reshuffleDiscard(state, deckId);
    const cardId = deck.drawPile.shift();
    if (!cardId) break;
    deck.handsByPlayer[playerId]?.push(cardId);
    state.activeCards[playerId]![deckId] = cardId;
  }
}

function advancePhase(state: ComposedGameState, spec: ComposedGameSpec) {
  const current = phaseFor(spec, state.phaseId);
  if (!current.nextPhaseId) throw new ComposedGameRuleError(`Phase ${current.id} has no nextPhaseId.`);
  state.phaseId = current.nextPhaseId;
  state.phaseVisit += 1;
  delete state.buzzes[current.id];
}

function determineWinner(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  winnerBy: "highest_score" | "actor" | "actor_team" | "none",
  actorId: string,
) {
  if (winnerBy === "none") return { kind: "none" as const, ids: [] };
  if (winnerBy === "actor") return { kind: "players" as const, ids: [actorId] };
  if (winnerBy === "actor_team") {
    const teamId = state.teamByPlayer[actorId];
    return teamId ? { kind: "teams" as const, ids: [teamId] } : { kind: "players" as const, ids: [actorId] };
  }
  const scoreMap = spec.setup.mode === "teams" ? state.scores.teams : state.scores.players;
  const highScore = Math.max(...Object.values(scoreMap), 0);
  return {
    kind: spec.setup.mode === "teams" ? ("teams" as const) : ("players" as const),
    ids: Object.keys(scoreMap).filter((id) => scoreMap[id] === highScore),
  };
}

function applyEffect(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  effect: Effect,
  actorId: string,
  payload: ComposedActionPayload,
) {
  if (effect.kind === "add_score") {
    const owner = targetOwner(state, effect.target, actorId);
    if (owner.kind === "global") state.scores.global += effect.amount;
    if (owner.kind === "player" && owner.id)
      state.scores.players[owner.id] = (state.scores.players[owner.id] ?? 0) + effect.amount;
    if (owner.kind === "team" && owner.id)
      state.scores.teams[owner.id] = (state.scores.teams[owner.id] ?? 0) + effect.amount;
  } else if (effect.kind === "add_resource") {
    const owner = targetOwner(state, effect.target, actorId);
    if (owner.kind === "global")
      state.resources.global[effect.resourceId] = clampResource(
        spec,
        effect.resourceId,
        (state.resources.global[effect.resourceId] ?? 0) + effect.amount,
      );
    if (owner.kind === "player" && owner.id)
      state.resources.players[owner.id]![effect.resourceId] = clampResource(
        spec,
        effect.resourceId,
        (state.resources.players[owner.id]?.[effect.resourceId] ?? 0) + effect.amount,
      );
    if (owner.kind === "team" && owner.id)
      state.resources.teams[owner.id]![effect.resourceId] = clampResource(
        spec,
        effect.resourceId,
        (state.resources.teams[owner.id]?.[effect.resourceId] ?? 0) + effect.amount,
      );
  } else if (effect.kind === "set_variable") state.variables[effect.variableId] = effect.value;
  else if (effect.kind === "record_input")
    state.variables[effect.channelId] = payload.text ?? payload.choiceId ?? payload.cardId ?? "submitted";
  else if (effect.kind === "register_secret_word") {
    const duel = state.wordDuels[effect.wordDuelId];
    const word = normalizeDuelWord(payload.text ?? "");
    if (!duel || !word) throw new ComposedGameRuleError("No secret word is available to lock.");
    duel.secretWordsByPlayer[actorId] = word;
  } else if (effect.kind === "guess_letter") {
    const duel = state.wordDuels[effect.wordDuelId];
    const letter = normalizeDuelWord(payload.text ?? "");
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord || !letter) throw new ComposedGameRuleError("No letter guess is available to resolve.");
    duel.guessedLettersByPlayer[actorId] = [...(duel.guessedLettersByPlayer[actorId] ?? []), letter];
    const revealedCount = [...secretWord].filter((candidate) => candidate === letter).length;
    const correct = revealedCount > 0;
    duel.lastGuess = { actorId, kind: "letter", value: letter, correct, revealedCount };
    const guessed = new Set(duel.guessedLettersByPlayer[actorId]);
    if ([...secretWord].every((candidate) => guessed.has(candidate))) {
      state.status = "completed";
      state.winner = { kind: "players", ids: [actorId] };
    }
  } else if (effect.kind === "guess_word") {
    const duel = state.wordDuels[effect.wordDuelId];
    const guess = normalizeDuelWord(payload.text ?? "");
    const secretWord = duel?.secretWordsByPlayer[opponentId(state, actorId)];
    if (!duel || !secretWord || !guess) throw new ComposedGameRuleError("No word guess is available to resolve.");
    const correct = guess === secretWord;
    duel.lastGuess = { actorId, kind: "word", value: guess, correct, revealedCount: correct ? secretWord.length : 0 };
    if (correct) {
      state.status = "completed";
      state.winner = { kind: "players", ids: [actorId] };
    } else {
      const attempts = duel.incorrectWordsByPlayer[actorId] ?? [];
      duel.incorrectWordsByPlayer[actorId] = [...attempts.slice(-7), guess];
    }
  } else if (effect.kind === "start_timing") {
    const sense = state.secondSenses[effect.secondSenseId];
    if (!sense) throw new ComposedGameRuleError("No timing round is available to start.");
    sense.startedPlayerIds = [...sense.startedPlayerIds, actorId];
  } else if (effect.kind === "stop_timing") {
    const sense = state.secondSenses[effect.secondSenseId];
    const elapsedMs = payload.elapsedMs;
    if (!sense || !Number.isInteger(elapsedMs))
      throw new ComposedGameRuleError("No measured duration is available to stop.");
    sense.attemptsByPlayer[actorId] = elapsedMs!;
    if (sense.activePlayerIds.every((playerId) => sense.attemptsByPlayer[playerId] !== undefined)) {
      const sorted = sense.activePlayerIds
        .map((playerId) => ({
          playerId,
          elapsedMs: sense.attemptsByPlayer[playerId]!,
          errorMs: Math.abs(sense.attemptsByPlayer[playerId]! - sense.targetMs),
        }))
        .sort(
          (left, right) =>
            left.errorMs - right.errorMs ||
            left.elapsedMs - right.elapsedMs ||
            left.playerId.localeCompare(right.playerId),
        );
      const entries = sorted.map((entry) => ({
        ...entry,
        rank: sorted.findIndex((candidate) => candidate.errorMs === entry.errorMs) + 1,
      }));
      const desiredCount = Math.max(1, Math.ceil(sorted.length / 2));
      const cutoffErrorMs = sorted[desiredCount - 1]?.errorMs ?? sorted[0]?.errorMs ?? 0;
      const qualifiedPlayerIds = sorted
        .filter((entry) => entry.errorMs <= cutoffErrorMs)
        .map((entry) => entry.playerId);
      const finalTie = sorted.length === 2 && sorted[0]?.errorMs === sorted[1]?.errorMs;
      sense.stageStatus = "reveal";
      sense.lastRound = { stage: sense.stage, targetMs: sense.targetMs, entries, qualifiedPlayerIds, finalTie };
      if (qualifiedPlayerIds.length === 1) {
        state.status = "completed";
        state.winner = { kind: "players", ids: [qualifiedPlayerIds[0]!] };
      }
    }
  } else if (effect.kind === "advance_timing_round") {
    const sense = state.secondSenses[effect.secondSenseId];
    const qualifiedPlayerIds = sense?.lastRound?.qualifiedPlayerIds;
    if (!sense || !qualifiedPlayerIds?.length || sense.stageStatus !== "reveal")
      throw new ComposedGameRuleError("No completed timing round is ready to advance.");
    sense.stage += 1;
    sense.stageStatus = "open";
    sense.activePlayerIds = [...qualifiedPlayerIds];
    sense.startedPlayerIds = [];
    sense.attemptsByPlayer = {};
    sense.targetMs = secondSenseTarget(
      state.seed,
      secondSenseComponent(spec, effect.secondSenseId),
      sense.stage,
      sense.targetMs,
    );
    sense.targetHistory.push(sense.targetMs);
    state.round = sense.stage;
    state.activePlayerId = qualifiedPlayerIds[0] ?? state.activePlayerId;
  } else if (effect.kind === "draw_cards")
    drawCards(state, effect.deckId, effect.target === "actor" ? actorId : state.activePlayerId, effect.count);
  else if (effect.kind === "discard_selected_card") {
    const deck = state.decks[effect.deckId];
    const ownerId = effect.target === "active_player" ? state.activePlayerId : actorId;
    const cardId = payload.cardId ?? state.activeCards[ownerId]?.[effect.deckId];
    if (!deck || !cardId || !deck.handsByPlayer[ownerId]?.includes(cardId))
      throw new ComposedGameRuleError("No selected card is available to discard.");
    deck.handsByPlayer[ownerId] = deck.handsByPlayer[ownerId]!.filter((id) => id !== cardId);
    deck.discardPile.push(cardId);
    delete state.activeCards[ownerId]?.[effect.deckId];
  } else if (effect.kind === "move_selected_token") {
    const token = payload.tokenId ? state.boardTokens[effect.boardId]?.[payload.tokenId] : undefined;
    if (!token || !payload.spaceId) throw new ComposedGameRuleError("No token and destination were selected.");
    token.spaceId = payload.spaceId;
  } else if (effect.kind === "reveal") {
    if (!state.revealedIds.includes(effect.revealId)) state.revealedIds.push(effect.revealId);
  } else if (effect.kind === "randomize") {
    const randomizer = spec.randomizers.find((candidate) => candidate.id === effect.randomizerId);
    if (!randomizer) throw new ComposedGameRuleError(`Unknown randomizer: ${effect.randomizerId}.`);
    const random = nextRandom(state, randomizer.id);
    state.randomResults[randomizer.id] =
      randomizer.kind === "die"
        ? Math.floor(random * randomizer.sides) + 1
        : (randomizer.options[Math.floor(random * randomizer.options.length)]?.id ?? randomizer.options[0]!.id);
  } else if (effect.kind === "shuffle_deck") {
    const deck = state.decks[effect.deckId];
    if (!deck) throw new ComposedGameRuleError(`Unknown deck: ${effect.deckId}.`);
    deck.drawPile = seededShuffle(deck.drawPile, `${state.seed}:shuffle:${effect.deckId}:${state.randomCounter}`);
    state.randomCounter += 1;
  } else if (effect.kind === "set_active_player") {
    if (effect.mode === "actor") state.activePlayerId = actorId;
    else if (effect.mode === "selected") {
      if (!payload.targetPlayerId || !state.playerOrder.includes(payload.targetPlayerId)) {
        throw new ComposedGameRuleError("No valid active player was selected.");
      }
      state.activePlayerId = payload.targetPlayerId;
    } else if (effect.mode === "next_team_captain") {
      const currentTeamId = state.teamByPlayer[state.activePlayerId];
      const teamIndex = state.teams.findIndex((team) => team.id === currentTeamId);
      const nextTeam = state.teams[(teamIndex + 1) % state.teams.length];
      const nextCaptain = nextTeam ? state.captainByTeam?.[nextTeam.id] : undefined;
      if (!nextCaptain) throw new ComposedGameRuleError("The next team has no captain.");
      state.activePlayerId = nextCaptain;
    } else {
      const index = state.playerOrder.indexOf(state.activePlayerId);
      state.activePlayerId = state.playerOrder[(index + 1) % state.playerOrder.length] ?? state.activePlayerId;
    }
  } else if (effect.kind === "advance_phase") {
    const sketchKey = `${state.phaseId}:${state.phaseVisit}`;
    advancePhase(state, spec);
    if (state.sketches?.[sketchKey]) delete state.sketches[sketchKey];
  } else if (effect.kind === "advance_round") state.round += 1;
  else if (effect.kind === "end_game") {
    state.status = "completed";
    state.winner = determineWinner(state, spec, effect.winnerBy, actorId);
  }
}

function actionsMatching(state: ComposedGameState, condition: Extract<AtomicCondition, { kind: "action_count" }>) {
  return state.actions.filter(
    (record) =>
      record.actionId === condition.actionId &&
      (condition.scope === "game" ||
        (condition.scope === "round" ? record.round === state.round : record.phaseVisit === state.phaseVisit)),
  );
}

function conditionMatches(state: ComposedGameState, condition: AtomicCondition): boolean {
  if (condition.kind === "always") return true;
  if (condition.kind === "action_count") return actionsMatching(state, condition).length >= condition.count;
  if (condition.kind === "all_players_acted") {
    const actors = new Set(
      state.actions
        .filter((record) => record.actionId === condition.actionId && record.phaseVisit === state.phaseVisit)
        .map((record) => record.actorId),
    );
    return state.playerOrder.every((playerId) => actors.has(playerId));
  }
  if (condition.kind === "score_at_least") {
    if (condition.owner === "global") return state.scores.global >= condition.amount;
    const values =
      condition.owner === "any_team" ? Object.values(state.scores.teams) : Object.values(state.scores.players);
    return values.some((value) => value >= condition.amount);
  }
  if (condition.kind === "resource_at_least") {
    if (condition.owner === "global")
      return (state.resources.global[condition.resourceId] ?? Number.NEGATIVE_INFINITY) >= condition.amount;
    return [...Object.values(state.resources.players), ...Object.values(state.resources.teams)].some(
      (values) => (values[condition.resourceId] ?? Number.NEGATIVE_INFINITY) >= condition.amount,
    );
  }
  if (condition.kind === "deck_empty") return (state.decks[condition.deckId]?.drawPile.length ?? 0) === 0;
  if (condition.kind === "round_at_least") return state.round >= condition.round;
  if (condition.kind === "variable_equals") return state.variables[condition.variableId] === condition.value;
  if (condition.kind === "last_input_correct")
    return [...state.actions].reverse().find((record) => record.actionId === condition.actionId)?.correct === true;
  return false;
}

function conditionsMatch(state: ComposedGameState, conditions: AtomicCondition[], mode: "all" | "any"): boolean {
  if (!conditions.length) return mode === "all";
  return mode === "all"
    ? conditions.every((condition) => conditionMatches(state, condition))
    : conditions.some((condition) => conditionMatches(state, condition));
}

export function reduceComposedGame(
  state: ComposedGameState,
  actionInput: ComposedGameAction,
  actorId: string,
  isHost: boolean,
  spec: ComposedGameSpec,
): ComposedGameState {
  if (state.status === "completed") throw new ComposedGameRuleError("This game is already completed.");
  if (!state.playerOrder.includes(actorId)) throw new ComposedGameRuleError("Unknown player for this room.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(actionInput.idempotencyKey))
    throw new ComposedGameRuleError("Invalid idempotency key.");
  if (state.acceptedIdempotencyKeys.includes(actionInput.idempotencyKey))
    throw new ComposedGameRuleError("This action was already processed.");
  const phase = phaseFor(spec, state.phaseId);
  if (!phase.actionIds.includes(actionInput.actionId))
    throw new ComposedGameRuleError("This action is not available in the current phase.");
  const action = actionFor(spec, actionInput.actionId);
  if (!isActorAllowed(state, action, actorId, isHost))
    throw new ComposedGameRuleError("This player cannot perform the selected action.");
  if (
    action.oncePerPhase &&
    state.actions.some(
      (record) => record.actionId === action.id && record.actorId === actorId && record.phaseVisit === state.phaseVisit,
    )
  )
    throw new ComposedGameRuleError("This action can only be used once per phase.");

  const next = structuredClone(state);
  const payload = actionInput.payload ?? {};
  const correct = validatePayload(next, spec, action, actorId, payload);
  if (action.kind === "sketch") {
    next.sketches ??= {};
    const key = `${next.phaseId}:${next.phaseVisit}`;
    const current = next.sketches[key] ?? [];
    if (payload.clear) next.sketches[key] = [];
    else if (payload.stroke) {
      if (current.length >= 120) throw new ComposedGameRuleError("This canvas has reached its stroke limit.");
      if (current.some((stroke) => stroke.id === payload.stroke?.id))
        throw new ComposedGameRuleError("This stroke was already submitted.");
      next.sketches[key] = [...current, payload.stroke];
    }
  }
  if (action.kind === "buzz") next.buzzes[next.phaseId] = actorId;
  next.actions.push({
    sequence: next.actions.length + 1,
    phaseId: next.phaseId,
    phaseVisit: next.phaseVisit,
    round: next.round,
    actionId: action.id,
    actorId,
    payload: action.kind === "sketch" || action.kind === "secret_word" ? {} : payload,
    correct,
  });
  next.acceptedIdempotencyKeys.push(actionInput.idempotencyKey);
  if (next.acceptedIdempotencyKeys.length > 500) next.acceptedIdempotencyKeys.shift();

  const phaseAtStart = next.phaseId;
  action.effects.forEach((effect) => {
    applyEffect(next, spec, effect, actorId, payload);
  });
  for (const rule of spec.rules.filter((candidate) => candidate.trigger.actionId === action.id)) {
    if (conditionsMatch(next, rule.conditions, rule.conditionMode)) {
      rule.effects.forEach((effect) => {
        applyEffect(next, spec, effect, actorId, payload);
      });
    }
  }
  if (
    next.status === "playing" &&
    next.phaseId === phaseAtStart &&
    phase.completionMode !== "manual" &&
    conditionsMatch(next, phase.completionConditions, phase.completionMode)
  ) {
    phase.onComplete.forEach((effect) => {
      applyEffect(next, spec, effect, actorId, payload);
    });
    if (next.status === "playing" && next.phaseId === phaseAtStart) advancePhase(next, spec);
  }
  next.revision += 1;
  return next;
}

export function projectComposedGameState(
  state: ComposedGameState,
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  code: string,
  playerId: string,
): ComposedGameView {
  const viewer = players.find((player) => player.id === playerId);
  if (!viewer || !state.playerOrder.includes(playerId))
    throw new ComposedGameRuleError("Cannot project state for an unknown player.");
  const phase = phaseFor(spec, state.phaseId);
  const components = resolveComposedComponents(state, spec, players, viewer, phase.componentIds);
  const availableActions = phase.actionIds
    .map((id) => actionFor(spec, id))
    .filter(
      (action) =>
        isActorAllowed(state, action, playerId, viewer.isHost) &&
        specializedActionAvailable(state, action, playerId) &&
        !(
          action.oncePerPhase &&
          state.actions.some(
            (record) =>
              record.actionId === action.id && record.actorId === playerId && record.phaseVisit === state.phaseVisit,
          )
        ),
    )
    .map((action) => ({
      id: action.id,
      label: action.label,
      kind: action.kind,
      ...(action.optionIds
        ? {
            options: spec.choices
              .filter((choice) => action.optionIds?.includes(choice.id))
              .map(({ correct: _correct, ...choice }) => choice),
          }
        : {}),
      ...(action.deckId ? { deckId: action.deckId } : {}),
      ...(action.boardId ? { boardId: action.boardId } : {}),
      ...(action.randomizerId ? { randomizerId: action.randomizerId } : {}),
      ...(action.itemIds ? { itemIds: action.itemIds } : {}),
    }));
  return {
    kind: "composed",
    code,
    experienceId: spec.experienceId,
    title: spec.title,
    description: spec.description,
    theme: spec.theme,
    status: state.status,
    revision: state.revision,
    round: Math.min(state.round, spec.setup.rounds),
    totalRounds: spec.setup.rounds,
    phase: { id: phase.id, title: phase.title },
    players,
    selfPlayerId: playerId,
    activePlayerId: state.activePlayerId,
    teams: state.teams,
    captainByTeam: state.captainByTeam ?? {},
    scores: state.scores,
    components,
    availableActions,
    winner: state.winner,
  };
}
