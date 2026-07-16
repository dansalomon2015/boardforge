import type { ComposedGameSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import {
  canStartComposedGame,
  initializeComposedGame,
  projectComposedGameState,
  reduceComposedGame,
  type ComposedActionPayload,
  type ComposedGameAction,
  type ComposedGameView,
  type ComposedGameState,
} from "./composed-engine";

export type VirtualAgentPersona = "careful" | "bold" | "cooperative" | "chaotic" | "adversarial";

export type VirtualAgentInput = {
  view: ComposedGameView;
  persona: VirtualAgentPersona;
  seed: string;
  turn: number;
};

export interface VirtualPlayerAgent {
  readonly id: string;
  readonly persona: VirtualAgentPersona;
  chooseAction(input: VirtualAgentInput): ComposedGameAction | null;
}

export type PlaytestFailure = {
  code: "INITIALIZATION_FAILED" | "NO_LEGAL_ACTION" | "ACTION_REJECTED" | "MAX_ACTIONS_REACHED" | "PRIVATE_DATA_LEAK";
  simulation: number;
  playerCount: number;
  evidence: string;
};

export type PlaytestRun = {
  simulation: number;
  seed: string;
  playerCount: number;
  teamSizes: number[];
  completed: boolean;
  actions: number;
  winner: ComposedGameState["winner"];
};

export type ComposedPlaytestReport = {
  status: "passed" | "failed";
  simulations: number;
  completedSimulations: number;
  completionRate: number;
  averageActions: number;
  testedPlayerCounts: number[];
  testedTeamSizes: number[][];
  failures: PlaytestFailure[];
  runs: PlaytestRun[];
};

type ViewAction = ComposedGameView["availableActions"][number];

function numberHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function rotate<T>(values: T[], seed: string): T[] {
  if (values.length < 2) return values;
  const offset = numberHash(seed) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringId(value: unknown): string | null {
  const object = objectValue(value);
  return typeof object?.id === "string" ? object.id : null;
}

function payloadForAction(view: ComposedGameView, action: ViewAction, persona: VirtualAgentPersona, seed: string): ComposedActionPayload | null {
  if (action.kind === "choose") {
    const options = action.options ?? [];
    const chosen = persona === "chaotic" || persona === "adversarial" ? options.at(-1) : rotate(options, seed)[0];
    return chosen ? { choiceId: chosen.id } : null;
  }
  if (action.kind === "text") return { text: `Test answer ${persona}` };
  if (action.kind === "play_card") {
    const zone = view.components.find((component) => component.kind === "card_zone" && component.data.zone === "hand");
    const cardId = arrayValue(zone?.data.cards).map(stringId).find(Boolean);
    return cardId ? { cardId } : null;
  }
  if (action.kind === "move") {
    const board = view.components.find((component) => component.kind === "board");
    const tokens = Object.values(objectValue(board?.data.tokens) ?? {}).map(objectValue).filter((value): value is Record<string, unknown> => Boolean(value));
    const ownTeamId = view.teams.find((team) => team.playerIds.includes(view.selfPlayerId))?.id;
    const token = tokens.find((candidate) => candidate.ownerId === view.selfPlayerId || candidate.ownerId === ownTeamId || candidate.ownerType === "global");
    const definition = objectValue(board?.data.definition);
    const spaces = arrayValue(definition?.spaces);
    const destination = persona === "adversarial" ? spaces[0] : spaces.at(-1);
    const tokenId = typeof token?.id === "string" ? token.id : null;
    const spaceId = stringId(destination);
    return tokenId && spaceId ? { tokenId, spaceId } : null;
  }
  if (action.kind === "order") {
    const component = view.components.find((candidate) => candidate.kind === "ordering");
    const ids = arrayValue(component?.data.items).map(stringId).filter((id): id is string => Boolean(id));
    return ids.length ? { orderedIds: persona === "chaotic" ? [...ids].reverse() : ids } : null;
  }
  if (action.kind === "match") {
    const component = view.components.find((candidate) => candidate.kind === "matching");
    const ids = arrayValue(component?.data.items).map(stringId).filter((id): id is string => Boolean(id));
    const pairs: Array<{ leftId: string; rightId: string }> = [];
    for (let index = 0; index < ids.length; index += 2) {
      const leftId = ids[index];
      const rightId = ids[index + 1];
      if (leftId && rightId) pairs.push({ leftId, rightId });
    }
    return pairs.length * 2 === ids.length ? { pairs } : null;
  }
  if (action.kind === "select_player") {
    const activeTeam = view.teams.find((team) => team.playerIds.includes(view.activePlayerId));
    const selectedId = activeTeam ? rotate(activeTeam.playerIds, seed)[0] : undefined;
    return selectedId ? { targetPlayerId: selectedId } : null;
  }
  if (action.kind === "sketch") return { stroke: { id: `sim_${numberHash(seed).toString(36)}`, points: [{ x: 20, y: 20 }, { x: 120, y: 90 }] } };
  return {};
}

export class DeterministicVirtualAgent implements VirtualPlayerAgent {
  readonly id: string;

  constructor(readonly persona: VirtualAgentPersona, playerId: string) {
    this.id = playerId;
  }

  chooseAction({ view, persona, seed, turn }: VirtualAgentInput): ComposedGameAction | null {
    const available = view.availableActions.filter((action) => {
      if (action.kind !== "buzz") return true;
      const buzzer = view.components.find((component) => component.kind === "buzzer");
      return !buzzer?.data.claimedByPlayerId;
    });
    const ordered = persona === "chaotic" ? rotate(available, `${seed}:${turn}`) : available;
    for (const action of ordered) {
      const payload = payloadForAction(view, action, persona, `${seed}:${action.id}:${turn}`);
      if (payload === null) continue;
      return {
        type: "COMPOSED_ACTION",
        actionId: action.id,
        idempotencyKey: `sim-${numberHash(`${seed}:${this.id}:${turn}:${action.id}`).toString(36).padStart(6, "0")}-${turn}`,
        ...(Object.keys(payload).length ? { payload } : {}),
      };
    }
    return null;
  }
}

function playtestPlayerCounts(spec: ComposedGameSpec): number[] {
  const preferred = [spec.minPlayers, 2, 3, 4, 6, spec.maxPlayers];
  return [...new Set(preferred)].filter((count) => canStartComposedGame(spec, count)).sort((left, right) => left - right);
}

function createPlayers(count: number): PublicPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `bot_${index + 1}`,
    name: `Agent ${index + 1}`,
    isHost: index === 0,
    connected: true,
  }));
}

function privateLeakEvidence(state: ComposedGameState, spec: ComposedGameSpec, players: PublicPlayer[], code: string): string | null {
  const privateDecks = spec.decks.filter((deck) => deck.visibility === "private");
  if (!privateDecks.length) return null;
  const views = Object.fromEntries(players.map((player) => [player.id, JSON.stringify(projectComposedGameState(state, spec, players, code, player.id))]));
  for (const deckDefinition of privateDecks) {
    const deckState = state.decks[deckDefinition.id];
    if (!deckState) continue;
    for (const owner of players) {
      for (const cardId of deckState.handsByPlayer[owner.id] ?? []) {
        const card = deckDefinition.cards.find((candidate) => candidate.id === cardId);
        if (!card) continue;
        for (const viewer of players) {
          if (viewer.id === owner.id) continue;
          if (views[viewer.id]?.includes(card.title)) return `${viewer.id} received the private card title owned by ${owner.id}.`;
          if (card.body && views[viewer.id]?.includes(card.body)) return `${viewer.id} received private card content owned by ${owner.id}.`;
        }
      }
    }
  }
  return null;
}

export function runComposedPlaytest(
  spec: ComposedGameSpec,
  options: { simulations?: number; maxActions?: number; seed?: string } = {},
): ComposedPlaytestReport {
  const simulations = Math.max(1, Math.min(50, options.simulations ?? 24));
  const maxActions = Math.max(20, Math.min(2_000, options.maxActions ?? 500));
  const baseSeed = options.seed ?? `playtest:${spec.id}`;
  const playerCounts = playtestPlayerCounts(spec);
  const personas: VirtualAgentPersona[] = ["careful", "bold", "cooperative", "chaotic", "adversarial"];
  const failures: PlaytestFailure[] = [];
  const runs: PlaytestRun[] = [];

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const playerCount = playerCounts[simulation % playerCounts.length] ?? spec.minPlayers;
    const players = createPlayers(playerCount);
    const seed = `${baseSeed}:${simulation}:${playerCount}`;
    let state: ComposedGameState;
    try {
      state = initializeComposedGame(spec, players, seed);
    } catch (error) {
      failures.push({ code: "INITIALIZATION_FAILED", simulation, playerCount, evidence: error instanceof Error ? error.message : "Unknown initialization error." });
      runs.push({ simulation, seed, playerCount, teamSizes: [], completed: false, actions: 0, winner: null });
      continue;
    }

    const agents = players.map((player, index) => new DeterministicVirtualAgent(personas[index % personas.length]!, player.id));
    let actionCount = 0;
    let stopped = false;
    while (state.status === "playing" && actionCount < maxActions) {
      const leak = privateLeakEvidence(state, spec, players, `SIM${simulation}`);
      if (leak) {
        failures.push({ code: "PRIVATE_DATA_LEAK", simulation, playerCount, evidence: leak });
        stopped = true;
        break;
      }
      let selected: { agent: DeterministicVirtualAgent; action: ComposedGameAction } | null = null;
      const orderedAgents = [...agents].sort((left, right) => Number(right.id === state.activePlayerId) - Number(left.id === state.activePlayerId));
      for (const agent of orderedAgents) {
        const view = projectComposedGameState(state, spec, players, `SIM${simulation}`, agent.id);
        const action = agent.chooseAction({ view, persona: agent.persona, seed, turn: actionCount });
        if (action) {
          selected = { agent, action };
          break;
        }
      }
      if (!selected) {
        failures.push({ code: "NO_LEGAL_ACTION", simulation, playerCount, evidence: `No agent had a legal action in phase ${state.phaseId}.` });
        stopped = true;
        break;
      }
      try {
        const actor = players.find((player) => player.id === selected.agent.id)!;
        state = reduceComposedGame(state, selected.action, actor.id, actor.isHost, spec);
        actionCount += 1;
      } catch (error) {
        failures.push({ code: "ACTION_REJECTED", simulation, playerCount, evidence: error instanceof Error ? error.message : "Unknown action error." });
        stopped = true;
        break;
      }
    }

    if (!stopped && state.status !== "completed") failures.push({ code: "MAX_ACTIONS_REACHED", simulation, playerCount, evidence: `The game did not finish within ${maxActions} actions.` });
    runs.push({ simulation, seed, playerCount, teamSizes: state.teams.map((team) => team.playerIds.length), completed: state.status === "completed", actions: actionCount, winner: state.winner });
  }

  const completedSimulations = runs.filter((run) => run.completed).length;
  const averageActions = runs.length ? runs.reduce((sum, run) => sum + run.actions, 0) / runs.length : 0;
  return {
    status: failures.length === 0 && completedSimulations === simulations ? "passed" : "failed",
    simulations,
    completedSimulations,
    completionRate: simulations ? completedSimulations / simulations : 0,
    averageActions: Number(averageActions.toFixed(2)),
    testedPlayerCounts: [...new Set(runs.map((run) => run.playerCount))],
    testedTeamSizes: [...new Map(runs.map((run) => [run.teamSizes.join("-"), run.teamSizes])).values()],
    failures,
    runs,
  };
}
