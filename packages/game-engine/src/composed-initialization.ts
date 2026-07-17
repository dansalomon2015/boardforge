import { validateComposedGameSpec, type ComposedGameSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { ComposedGameRuleError } from "./composed-errors";
import { secondSenseTarget, seededShuffle } from "./composed-random";
import type {
  ComposedDeckState,
  ComposedGameState,
  ComposedTeamState,
  ComposedTokenState,
  SecondSenseState,
  WordDuelState,
} from "./composed-types";

export function canStartComposedGame(spec: ComposedGameSpec, playerCount: number): boolean {
  if (playerCount < spec.minPlayers || playerCount > spec.maxPlayers) return false;
  if (spec.setup.mode !== "teams") return true;
  const policy = spec.setup.teamPolicy;
  const teamCount = policy?.teams.length ?? 0;
  if (!policy || playerCount < teamCount * policy.minMembersPerTeam) return false;
  if (policy.maxMembersPerTeam && playerCount > teamCount * policy.maxMembersPerTeam) return false;
  return policy.allowUnevenTeams || playerCount % teamCount === 0;
}

export type ComposedTeamSelectionValidation = { ok: true } | { ok: false; reason: string };

export function validateComposedTeamSelection(
  spec: ComposedGameSpec,
  playerIds: string[],
  teamByPlayer: Record<string, string>,
): ComposedTeamSelectionValidation {
  if (!canStartComposedGame(spec, playerIds.length)) {
    return { ok: false, reason: `The game cannot start with ${playerIds.length} player(s).` };
  }
  if (spec.setup.mode !== "teams") return { ok: true };
  const policy = spec.setup.teamPolicy;
  if (!policy) return { ok: false, reason: "The team configuration is missing." };
  const knownTeamIds = new Set(policy.teams.map((team) => team.id));
  for (const playerId of playerIds) {
    const teamId = teamByPlayer[playerId];
    if (!teamId) return { ok: false, reason: "Every player must choose a team." };
    if (!knownTeamIds.has(teamId)) return { ok: false, reason: "A selected team does not exist in this game." };
  }
  const sizes = policy.teams.map((team) => playerIds.filter((playerId) => teamByPlayer[playerId] === team.id).length);
  if (sizes.some((size) => size < policy.minMembersPerTeam)) {
    return { ok: false, reason: `Every team needs at least ${policy.minMembersPerTeam} player(s).` };
  }
  if (policy.maxMembersPerTeam && sizes.some((size) => size > policy.maxMembersPerTeam!)) {
    return { ok: false, reason: `A team cannot exceed ${policy.maxMembersPerTeam} player(s).` };
  }
  if (!policy.allowUnevenTeams && Math.max(...sizes) !== Math.min(...sizes)) {
    return { ok: false, reason: "This game requires equally sized teams." };
  }
  return { ok: true };
}

function createTeams(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  seed: string,
  selectedTeamByPlayer?: Record<string, string>,
): { teams: ComposedTeamState[]; teamByPlayer: Record<string, string> } {
  if (spec.setup.mode !== "teams") return { teams: [], teamByPlayer: {} };
  const policy = spec.setup.teamPolicy;
  if (!policy) throw new ComposedGameRuleError("Team games require a team policy.");
  const count = policy.teams.length;
  if (players.length < count * policy.minMembersPerTeam)
    throw new ComposedGameRuleError("There are not enough players to populate every team.");
  if (policy.maxMembersPerTeam && players.length > count * policy.maxMembersPerTeam)
    throw new ComposedGameRuleError("The room exceeds the configured team capacity.");
  if (!policy.allowUnevenTeams && players.length % count !== 0)
    throw new ComposedGameRuleError("This game requires equally sized teams.");
  const teams = policy.teams.map((team) => ({ ...team, playerIds: [] as string[] }));
  const teamByPlayer: Record<string, string> = {};
  if (selectedTeamByPlayer) {
    const validation = validateComposedTeamSelection(
      spec,
      players.map((player) => player.id),
      selectedTeamByPlayer,
    );
    if (!validation.ok) throw new ComposedGameRuleError(validation.reason);
    for (const player of players) {
      const teamId = selectedTeamByPlayer[player.id]!;
      teams.find((team) => team.id === teamId)!.playerIds.push(player.id);
      teamByPlayer[player.id] = teamId;
    }
    return { teams, teamByPlayer };
  }
  const allocatedPlayers = policy.allocation === "random" ? seededShuffle(players, `${seed}:teams`) : players;
  allocatedPlayers.forEach((player, index) => {
    const team = teams[index % teams.length];
    if (!team) return;
    team.playerIds.push(player.id);
    teamByPlayer[player.id] = team.id;
  });
  return { teams, teamByPlayer };
}

function initializeDecks(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  seed: string,
): Record<string, ComposedDeckState> {
  return Object.fromEntries(
    spec.decks.map((deck) => {
      const drawPile = deck.shuffle
        ? seededShuffle(
            deck.cards.map((card) => card.id),
            `${seed}:deck:${deck.id}`,
          )
        : deck.cards.map((card) => card.id);
      const handsByPlayer = Object.fromEntries(players.map((player) => [player.id, [] as string[]]));
      for (let cardIndex = 0; cardIndex < deck.initialHandSize; cardIndex += 1) {
        for (const player of players) {
          const cardId = drawPile.shift();
          if (cardId) handsByPlayer[player.id]?.push(cardId);
        }
      }
      return [deck.id, { drawPile, discardPile: [], table: [], handsByPlayer }];
    }),
  );
}

function initializeBoardTokens(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  teams: ComposedTeamState[],
): Record<string, Record<string, ComposedTokenState>> {
  return Object.fromEntries(
    spec.boards.map((board) => {
      const tokens: Record<string, ComposedTokenState> = {};
      for (const token of board.tokens) {
        const owners =
          token.owner === "global"
            ? [null]
            : token.owner === "player"
              ? players.map((player) => player.id)
              : teams.map((team) => team.id);
        for (const ownerId of owners) {
          const id = ownerId ? `${token.id}_${ownerId}` : token.id;
          tokens[id] = { id, definitionId: token.id, ownerType: token.owner, ownerId, spaceId: token.startSpaceId };
        }
      }
      return [board.id, tokens];
    }),
  );
}

function initializeResources(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  teams: ComposedTeamState[],
): ComposedGameState["resources"] {
  const global: Record<string, number> = {};
  const playerResources = Object.fromEntries(players.map((player) => [player.id, {} as Record<string, number>]));
  const teamResources = Object.fromEntries(teams.map((team) => [team.id, {} as Record<string, number>]));
  for (const resource of spec.resources) {
    if (resource.scope === "global") global[resource.id] = resource.initialValue;
    if (resource.scope === "player")
      for (const player of players) playerResources[player.id]![resource.id] = resource.initialValue;
    if (resource.scope === "team")
      for (const team of teams) teamResources[team.id]![resource.id] = resource.initialValue;
  }
  return { global, players: playerResources, teams: teamResources };
}

export function initializeComposedGame(
  spec: ComposedGameSpec,
  players: PublicPlayer[],
  seed: string,
  selectedTeamByPlayer?: Record<string, string>,
  selectedCaptainByTeam?: Record<string, string>,
): ComposedGameState {
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok)
    throw new ComposedGameRuleError(
      `Invalid ComposedGameSpec: ${validation.issues[0]?.message ?? "unknown validation error"}`,
    );
  if (!canStartComposedGame(spec, players.length))
    throw new ComposedGameRuleError(`This game cannot start with ${players.length} players under its team policy.`);
  const { teams, teamByPlayer } = createTeams(spec, players, seed, selectedTeamByPlayer);
  const randomizedOrder = seededShuffle(
    players.map((player) => player.id),
    `${seed}:starting-player`,
  );
  const initialPlayerId = spec.setup.startingPlayer === "random" ? randomizedOrder[0] : players[0]?.id;
  if (!initialPlayerId) throw new ComposedGameRuleError("At least one player is required.");
  const usesCaptains = spec.actions.some((action) => action.actor === "team_captain");
  const captainByTeam = usesCaptains
    ? Object.fromEntries(
        teams.map((team) => {
          const captainId = selectedCaptainByTeam?.[team.id] ?? team.playerIds[0];
          if (!captainId || !team.playerIds.includes(captainId)) {
            throw new ComposedGameRuleError(`Captain for team ${team.id} must belong to that team.`);
          }
          return [team.id, captainId];
        }),
      )
    : {};
  const initialTeamId = teamByPlayer[initialPlayerId];
  const startingPhase = spec.phases.find((phase) => phase.id === spec.setup.startingPhaseId);
  const startsWithCaptain =
    startingPhase?.actionIds.some(
      (actionId) => spec.actions.find((action) => action.id === actionId)?.actor === "team_captain",
    ) ?? false;
  const activePlayerId = startsWithCaptain && initialTeamId ? captainByTeam[initialTeamId]! : initialPlayerId;
  const itemOrders = Object.fromEntries(
    spec.components.flatMap((component) =>
      component.kind === "ordering" || component.kind === "matching"
        ? [[component.id, seededShuffle(component.itemIds, `${seed}:items:${component.id}`)] as const]
        : [],
    ),
  );
  return {
    template: "composed",
    status: "playing",
    revision: 1,
    seed,
    randomCounter: 0,
    round: 1,
    phaseId: spec.setup.startingPhaseId,
    phaseVisit: 1,
    playerOrder: players.map((player) => player.id),
    activePlayerId,
    teams,
    teamByPlayer,
    ...(usesCaptains ? { captainByTeam } : {}),
    scores: {
      global: 0,
      players: Object.fromEntries(players.map((player) => [player.id, 0])),
      teams: Object.fromEntries(teams.map((team) => [team.id, 0])),
    },
    resources: initializeResources(spec, players, teams),
    variables: Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.initialValue])),
    decks: initializeDecks(spec, players, seed),
    activeCards: Object.fromEntries(players.map((player) => [player.id, {}])),
    boardTokens: initializeBoardTokens(spec, players, teams),
    revealedIds: [],
    randomResults: {},
    buzzes: {},
    itemOrders,
    sketches: {},
    wordDuels: Object.fromEntries(
      spec.components
        .filter((component) => component.kind === "word_duel")
        .map((component) => [
          component.id,
          {
            secretWordsByPlayer: {},
            guessedLettersByPlayer: Object.fromEntries(players.map((player) => [player.id, [] as string[]])),
            incorrectWordsByPlayer: Object.fromEntries(players.map((player) => [player.id, [] as string[]])),
            lastGuess: null,
          } satisfies WordDuelState,
        ]),
    ),
    secondSenses: Object.fromEntries(
      spec.components
        .filter((component) => component.kind === "second_sense")
        .map((component) => {
          const targetMs = secondSenseTarget(seed, component, 1);
          return [
            component.id,
            {
              stage: 1,
              stageStatus: "open",
              targetMs,
              targetHistory: [targetMs],
              activePlayerIds: players.map((player) => player.id),
              startedPlayerIds: [],
              attemptsByPlayer: {},
              lastRound: null,
            } satisfies SecondSenseState,
          ];
        }),
    ),
    actions: [],
    acceptedIdempotencyKeys: [],
    winner: null,
  };
}
