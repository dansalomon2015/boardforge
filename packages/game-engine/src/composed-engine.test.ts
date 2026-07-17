import { describe, expect, it } from "vitest";
import { cinemaCharadesSpec, systemsLabSpec, type ComposedGameSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import {
  initializeComposedGame,
  projectComposedGameState,
  reduceComposedGame,
  type ComposedGameState,
} from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const players: PublicPlayer[] = [
  { id: "p1", name: "Ada", isHost: true, connected: true },
  { id: "p2", name: "Linus", isHost: false, connected: true },
  { id: "p3", name: "Grace", isHost: false, connected: true },
  { id: "p4", name: "Margaret", isHost: false, connected: true },
];

function act(
  state: ComposedGameState,
  actionId: string,
  actorId: string,
  sequence: number,
  payload?: Parameters<typeof reduceComposedGame>[1]["payload"],
) {
  return reduceComposedGame(
    state,
    {
      type: "COMPOSED_ACTION",
      actionId,
      idempotencyKey: `action-${sequence.toString().padStart(3, "0")}`,
      ...(payload ? { payload } : {}),
    },
    actorId,
    players.find((player) => player.id === actorId)?.isHost ?? false,
    cinemaCharadesSpec,
  );
}

describe("composed deterministic engine", () => {
  it("initializes deterministically and assigns balanced teams", () => {
    const first = initializeComposedGame(cinemaCharadesSpec, players, "charades-seed");
    const second = initializeComposedGame(cinemaCharadesSpec, players, "charades-seed");
    expect(first).toEqual(second);
    expect(first.teams.map((team) => team.playerIds.length)).toEqual([2, 2]);
  });

  it("never projects a private active card to another player", () => {
    let state = initializeComposedGame(cinemaCharadesSpec, players, "private-seed");
    const actorId = state.activePlayerId;
    state = act(state, "draw_film", actorId, 1);
    expect(state.phaseId).toBe("mime");
    const cardId = state.activeCards[actorId]!.films;
    const privateTitle = cinemaCharadesSpec.decks[0]!.cards.find((card) => card.id === cardId)?.title;
    expect(privateTitle).toBeTruthy();

    const actorView = projectComposedGameState(state, cinemaCharadesSpec, players, "MIME01", actorId);
    expect(actorView.experienceId).toBe("movie_mime");
    const otherId = players.find((player) => player.id !== actorId)!.id;
    const otherView = projectComposedGameState(state, cinemaCharadesSpec, players, "MIME01", otherId);
    expect(JSON.stringify(actorView)).toContain(privateTitle!);
    expect(JSON.stringify(otherView)).not.toContain(privateTitle!);
    expect(otherView.components.some((component) => component.id === "film_prompt")).toBe(false);
  });

  it("runs all rounds, rotates actors and applies team scoring rules", () => {
    let state = initializeComposedGame(cinemaCharadesSpec, players, "full-game-seed");
    let sequence = 1;
    for (let round = 1; round <= cinemaCharadesSpec.setup.rounds; round += 1) {
      const actorId = state.activePlayerId;
      const teamId = state.teamByPlayer[actorId]!;
      const before = state.scores.teams[teamId] ?? 0;
      state = act(state, "draw_film", actorId, sequence++);
      state = act(state, "film_guessed", actorId, sequence++);
      expect(state.scores.teams[teamId]).toBe(before + 2);
    }
    expect(state.status).toBe("completed");
    expect(state.winner?.kind).toBe("teams");
    expect(state.winner?.ids.length).toBeGreaterThan(0);
  });

  it("rejects replayed idempotency keys", () => {
    const state = initializeComposedGame(cinemaCharadesSpec, players, "idempotency-seed");
    const actorId = state.activePlayerId;
    const action = { type: "COMPOSED_ACTION" as const, actionId: "draw_film", idempotencyKey: "same-key-001" };
    const next = reduceComposedGame(state, action, actorId, actorId === "p1", cinemaCharadesSpec);
    expect(() => reduceComposedGame(next, action, actorId, actorId === "p1", cinemaCharadesSpec)).toThrow(
      "already processed",
    );
  });

  it("supports one or several people per team and passes the release playtest", () => {
    for (const count of [2, 3, 4, 6]) {
      const testPlayers = Array.from({ length: count }, (_, index) => ({
        id: `team_player_${index}`,
        name: `Player ${index}`,
        isHost: index === 0,
        connected: true,
      }));
      const state = initializeComposedGame(cinemaCharadesSpec, testPlayers, `teams-${count}`);
      expect(state.teams.every((team) => team.playerIds.length >= 1)).toBe(true);
      expect(
        Math.max(...state.teams.map((team) => team.playerIds.length)) -
          Math.min(...state.teams.map((team) => team.playerIds.length)),
      ).toBeLessThanOrEqual(1);
    }

    const report = runComposedPlaytest(cinemaCharadesSpec, { simulations: 24, seed: "release-test" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.testedPlayerCounts).toEqual(expect.arrayContaining([2, 3, 4, 6]));
    expect(report.failures).toEqual([]);
  });

  it("preserves player-selected lobby teams and rejects an incomplete selection", () => {
    const selection = {
      p1: "projecteurs",
      p2: "clapboards",
      p3: "clapboards",
      p4: "projecteurs",
    };
    const state = initializeComposedGame(cinemaCharadesSpec, players, "selected-teams", selection);
    expect(state.teamByPlayer).toEqual(selection);
    expect(state.teams.find((team) => team.id === "projecteurs")?.playerIds).toEqual(["p1", "p4"]);
    expect(() => initializeComposedGame(cinemaCharadesSpec, players, "missing-team", { p1: "projecteurs" })).toThrow(
      "Every player must choose",
    );
  });
});

const systemsSpec: ComposedGameSpec = {
  schemaVersion: 2,
  id: "systems_lab",
  template: "composed",
  experienceId: "generic",
  title: "Systems Lab",
  description: "A bounded fixture exercising reusable board-game systems.",
  theme: "laboratory",
  minPlayers: 2,
  maxPlayers: 2,
  setup: { mode: "individual", rounds: 1, startingPhaseId: "play", startingPlayer: "first" },
  variables: [],
  choices: [
    { id: "answer_a", label: "A", correct: true },
    { id: "answer_b", label: "B", correct: false },
  ],
  clues: [],
  reveals: [],
  orderingItems: [
    { id: "early", label: "Avant", rank: 1 },
    { id: "middle", label: "Milieu", rank: 2 },
    { id: "late", label: "Après", rank: 3 },
  ],
  matchingItems: [
    { id: "cat", label: "Chat", pairId: "animals" },
    { id: "dog", label: "Chien", pairId: "animals" },
    { id: "red", label: "Rouge", pairId: "colors" },
    { id: "blue", label: "Bleu", pairId: "colors" },
  ],
  decks: [
    {
      id: "tools",
      name: "Outils",
      visibility: "private",
      shuffle: false,
      initialHandSize: 1,
      cards: [
        { id: "hammer", title: "Marteau", tags: [] },
        { id: "rope", title: "Corde", tags: [] },
      ],
    },
  ],
  boards: [
    {
      id: "track",
      name: "Piste",
      layout: "track",
      spaces: [
        { id: "start", label: "Départ" },
        { id: "finish", label: "Arrivée" },
      ],
      tokens: [{ id: "pawn", label: "Pion", owner: "player", startSpaceId: "start" }],
    },
  ],
  resources: [{ id: "energy", name: "Énergie", scope: "player", initialValue: 1, min: 0, max: 5 }],
  randomizers: [{ id: "die", kind: "die", label: "Dé", sides: 6 }],
  media: [],
  components: [
    { id: "board", kind: "board", audience: "public", boardId: "track" },
    { id: "hand", kind: "card_zone", audience: "public", deckId: "tools", zone: "hand" },
    { id: "resources", kind: "resources", audience: "public", resourceIds: ["energy"] },
    { id: "die", kind: "randomizer", audience: "public", randomizerId: "die" },
    { id: "buzz", kind: "buzzer", audience: "public", label: "Buzz" },
    { id: "order", kind: "ordering", audience: "public", itemIds: ["early", "middle", "late"] },
    { id: "match", kind: "matching", audience: "public", itemIds: ["cat", "dog", "red", "blue"] },
  ],
  actions: [
    {
      id: "move",
      label: "Avancer",
      kind: "move",
      actor: "active_player",
      oncePerPhase: false,
      boardId: "track",
      effects: [{ kind: "move_selected_token", boardId: "track" }],
    },
    {
      id: "energize",
      label: "Énergie",
      kind: "resource",
      actor: "active_player",
      oncePerPhase: true,
      effects: [{ kind: "add_resource", resourceId: "energy", target: "actor", amount: 2 }],
    },
    {
      id: "roll",
      label: "Lancer",
      kind: "randomize",
      actor: "active_player",
      oncePerPhase: true,
      randomizerId: "die",
      effects: [{ kind: "randomize", randomizerId: "die" }],
    },
    { id: "buzz", label: "Buzz", kind: "buzz", actor: "any_player", oncePerPhase: true, effects: [] },
    {
      id: "order",
      label: "Ordonner",
      kind: "order",
      actor: "active_player",
      oncePerPhase: true,
      itemIds: ["early", "middle", "late"],
      effects: [],
    },
    {
      id: "match",
      label: "Associer",
      kind: "match",
      actor: "active_player",
      oncePerPhase: true,
      itemIds: ["cat", "dog", "red", "blue"],
      effects: [],
    },
    {
      id: "play_card",
      label: "Jouer",
      kind: "play_card",
      actor: "active_player",
      oncePerPhase: true,
      deckId: "tools",
      effects: [{ kind: "discard_selected_card", deckId: "tools", target: "actor" }],
    },
  ],
  rules: [
    {
      id: "reward_order",
      trigger: { kind: "after_action", actionId: "order" },
      conditionMode: "all",
      conditions: [{ kind: "last_input_correct", actionId: "order" }],
      effects: [{ kind: "add_score", target: "actor", amount: 3 }],
    },
  ],
  phases: [
    {
      id: "play",
      title: "Play",
      componentIds: ["board", "hand", "resources", "die", "buzz", "order", "match"],
      actionIds: ["move", "energize", "roll", "buzz", "order", "match", "play_card"],
      completionMode: "manual",
      completionConditions: [],
      onComplete: [],
    },
  ],
};

function systemsAction(
  state: ComposedGameState,
  actionId: string,
  key: string,
  payload?: Parameters<typeof reduceComposedGame>[1]["payload"],
  actorId = "p1",
) {
  return reduceComposedGame(
    state,
    { type: "COMPOSED_ACTION", actionId, idempotencyKey: key, ...(payload ? { payload } : {}) },
    actorId,
    actorId === "p1",
    systemsSpec,
  );
}

describe("composed systems", () => {
  it("passes the virtual-agent release gate with every human control represented", () => {
    const report = runComposedPlaytest(systemsLabSpec, { simulations: 8, seed: "systems-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(8);
    expect(report.failures).toEqual([]);
  });

  it("executes board, resource, randomizer, buzzer, ordering, matching and private-card primitives", () => {
    const duo = players.slice(0, 2);
    let state = initializeComposedGame(systemsSpec, duo, "systems-seed");
    const p1Card = state.decks.tools!.handsByPlayer.p1![0]!;
    const p2Card = state.decks.tools!.handsByPlayer.p2![0]!;
    const p1View = projectComposedGameState(state, systemsSpec, duo, "SYS001", "p1");
    expect(JSON.stringify(p1View)).toContain(systemsSpec.decks[0]!.cards.find((card) => card.id === p1Card)!.title);
    expect(JSON.stringify(p1View)).not.toContain(systemsSpec.decks[0]!.cards.find((card) => card.id === p2Card)!.title);

    state = systemsAction(state, "move", "systems-move", { tokenId: "pawn_p1", spaceId: "finish" });
    expect(state.boardTokens.track!.pawn_p1!.spaceId).toBe("finish");
    state = systemsAction(state, "energize", "systems-energy");
    expect(state.resources.players.p1!.energy).toBe(3);
    state = systemsAction(state, "roll", "systems-roll");
    expect(state.randomResults.die).toBeGreaterThanOrEqual(1);
    expect(state.randomResults.die).toBeLessThanOrEqual(6);
    state = systemsAction(state, "buzz", "systems-buzz", undefined, "p2");
    expect(state.buzzes.play).toBe("p2");
    expect(() => systemsAction(state, "buzz", "systems-buzz-2", undefined, "p1")).toThrow("already been claimed");
    state = systemsAction(state, "order", "systems-order", { orderedIds: ["early", "middle", "late"] });
    expect(state.scores.players.p1).toBe(3);
    state = systemsAction(state, "match", "systems-match", {
      pairs: [
        { leftId: "cat", rightId: "dog" },
        { leftId: "red", rightId: "blue" },
      ],
    });
    expect(state.actions.at(-1)?.correct).toBe(true);
    state = systemsAction(state, "play_card", "systems-card", { cardId: p1Card });
    expect(state.decks.tools!.discardPile).toContain(p1Card);
  });
});
