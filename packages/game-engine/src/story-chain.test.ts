import { describe, expect, it } from "vitest";
import { createRandomStoryChainPack, createStoryChainSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeComposedGame, projectComposedGameState, reduceComposedGame } from "./composed-engine";
import { runComposedPlaytest } from "./playtest";

const players: PublicPlayer[] = [
  { id: "p1", name: "Ada", isHost: true, connected: true },
  { id: "p2", name: "Linus", isHost: false, connected: true },
  { id: "p3", name: "Grace", isHost: false, connected: true },
];

describe("StoryChain release gate", () => {
  it("keeps the current twist private, enforces it and publishes accepted prose", () => {
    const spec = createStoryChainSpec(
      createRandomStoryChainPack({ themeId: "cozy", mood: "fantasy", length: "quick" }, "privacy"),
    );
    let state = initializeComposedGame(spec, players, "story-room");
    const authorId = state.activePlayerId;
    state = reduceComposedGame(
      state,
      { type: "COMPOSED_ACTION", actionId: "draw_twist", idempotencyKey: "story-draw-001" },
      authorId,
      authorId === "p1",
      spec,
    );
    const cardId = state.activeCards[authorId]!.twists;
    const requiredWord = spec.decks[0]!.cards.find((card) => card.id === cardId)!.title;
    const readerId = players.find((player) => player.id !== authorId)!.id;
    expect(JSON.stringify(projectComposedGameState(state, spec, players, "STORY1", readerId))).not.toContain(
      requiredWord,
    );
    expect(() =>
      reduceComposedGame(
        state,
        {
          type: "COMPOSED_ACTION",
          actionId: "continue_story",
          idempotencyKey: "story-write-bad",
          payload: { text: "Nothing unusual happened after all." },
        },
        authorId,
        authorId === "p1",
        spec,
      ),
    ).toThrow(`include the word`);

    const contribution = `Then the ${requiredWord} opened a door that had never been there before.`;
    state = reduceComposedGame(
      state,
      {
        type: "COMPOSED_ACTION",
        actionId: "continue_story",
        idempotencyKey: "story-write-good",
        payload: { text: contribution },
      },
      authorId,
      authorId === "p1",
      spec,
    );
    const readerView = projectComposedGameState(state, spec, players, "STORY1", readerId);
    const story = readerView.components.find((component) => component.kind === "story");
    expect(story?.data.entries).toEqual([
      {
        sequence: 2,
        round: 1,
        actorId: authorId,
        actorName: players.find((player) => player.id === authorId)!.name,
        text: contribution,
      },
    ]);
    expect(state.activePlayerId).not.toBe(authorId);
    expect(state.round).toBe(2);
  });

  it("completes every generated story in virtual-agent playtests", () => {
    const spec = createStoryChainSpec(
      createRandomStoryChainPack({ themeId: "enchanted", mood: "chaotic", length: "full" }, "release"),
    );
    const report = runComposedPlaytest(spec, { simulations: 24, seed: "story-release" });
    expect(report.status).toBe("passed");
    expect(report.completedSimulations).toBe(24);
    expect(report.failures).toEqual([]);
  });
});
