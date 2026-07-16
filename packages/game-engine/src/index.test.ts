import { describe, expect, it } from "vitest";
import { partyPulseSpec, spaceHeistSpec } from "@boardforge/game-spec";
import type { PublicPlayer } from "@boardforge/shared";
import { initializeGame, projectGameState, reduceGame } from "./index";

const players: PublicPlayer[] = [
  { id: "p1", name: "Ada", isHost: true, connected: true },
  { id: "p2", name: "Linus", isHost: false, connected: true },
  { id: "p3", name: "Grace", isHost: false, connected: true },
  { id: "p4", name: "Margaret", isHost: false, connected: true },
];

describe("deterministic game engine", () => {
  it("supports two-player games in both engine families", () => {
    const duo = players.slice(0, 2);
    const hiddenState = initializeGame(spaceHeistSpec, duo, "duo-seed");
    expect(hiddenState.template).toBe("hidden_roles");
    if (hiddenState.template === "hidden_roles") {
      expect(new Set(Object.values(hiddenState.rolesByPlayer).map((role) => role.team))).toEqual(
        new Set(["crew", "saboteur"]),
      );
    }

    expect(initializeGame(partyPulseSpec, duo, "duo-quiz").template).toBe("quiz_vote");
  });

  it("assigns hidden roles deterministically and projects only the viewer role", () => {
    const first = initializeGame(spaceHeistSpec, players, "demo-seed");
    const second = initializeGame(spaceHeistSpec, players, "demo-seed");
    expect(first).toEqual(second);
    expect(first.template).toBe("hidden_roles");

    const view = projectGameState(first, spaceHeistSpec, players, "ABC123", "p1");
    expect(view.kind).toBe("hidden_roles");
    expect(JSON.stringify(view)).not.toContain("rolesByPlayer");
    if (first.template === "hidden_roles" && view.kind === "hidden_roles") {
      expect(view.ownRole).toEqual(first.rolesByPlayer.p1);
      const opposingRole = Object.entries(first.rolesByPlayer).find(
        ([playerId, role]) => playerId !== "p1" && role.team !== view.ownRole.team,
      )?.[1];
      expect(opposingRole).toBeTruthy();
      expect(JSON.stringify(view)).not.toContain(opposingRole?.objective ?? "never");
    }
  });

  it("rejects sabotage from a crew player", () => {
    const state = initializeGame(spaceHeistSpec, players, "demo-seed");
    if (state.template !== "hidden_roles") throw new Error("wrong fixture");
    const crewId = state.playerOrder.find((id) => state.rolesByPlayer[id]?.team === "crew");
    expect(crewId).toBeTruthy();
    expect(() =>
      reduceGame(state, { type: "SUBMIT_MISSION", choice: "sabotage" }, crewId!, crewId === "p1", spaceHeistSpec),
    ).toThrow("Only a saboteur");
  });

  it("scores a complete quiz question and hides answers before reveal", () => {
    let state = initializeGame(partyPulseSpec, players, "quiz-seed");
    const before = projectGameState(state, partyPulseSpec, players, "QUIZ01", "p1");
    expect(JSON.stringify(before)).not.toContain("correctOptionId");

    for (const player of players) {
      state = reduceGame(
        state,
        { type: "SUBMIT_ANSWER", optionId: "twenty_four" },
        player.id,
        player.isHost,
        partyPulseSpec,
      );
    }

    const after = projectGameState(state, partyPulseSpec, players, "QUIZ01", "p1");
    expect(after.kind).toBe("quiz_vote");
    if (after.kind === "quiz_vote") {
      expect(after.phase).toBe("reveal");
      expect(after.reveal?.correctOptionId).toBe("twenty_four");
      expect(after.scores.p1).toBe(2);
    }
  });
});
