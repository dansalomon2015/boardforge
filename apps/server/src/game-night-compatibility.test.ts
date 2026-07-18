import { describe, expect, it } from "vitest";
import { defaultMovieMimeSpec, defaultSecondSenseSpec } from "@boardforge/game-spec";
import { createGameNightState } from "@boardforge/game-engine";
import type { GameNightSessionRecord } from "./persistence";
import { evaluateGameNightCompatibility } from "./game-night-compatibility";

const hostId = "00000000-0000-4000-8000-000000000001";
const guestId = "00000000-0000-4000-8000-000000000002";

function session(): GameNightSessionRecord {
  const id = "00000000-0000-4000-8000-000000000010";
  return {
    id,
    code: "NIGHT2",
    hostPlayerId: hostId,
    players: [
      { id: hostId, name: "Maya", isHost: true, connected: true },
      { id: guestId, name: "Noah", isHost: false, connected: true },
    ],
    reconnectTokenHashes: {},
    state: createGameNightState(id, [
      { id: "red", name: "Red", playerIds: [hostId], captainPlayerId: hostId },
      { id: "blue", name: "Blue", playerIds: [guestId], captainPlayerId: guestId },
    ]),
    currentRoomCode: null,
  };
}

describe("Game Night compatibility", () => {
  it("accepts a ranked game when teams, players and captains match", () => {
    expect(evaluateGameNightCompatibility(session(), defaultMovieMimeSpec)).toEqual({
      compatible: true,
      scoring: "ranked",
      requiresCaptains: true,
      reasons: [],
    });
  });

  it("returns actionable reasons instead of a generic launch failure", () => {
    const night = session();
    night.state.teams[1]!.playerIds = [];
    night.state.teams[1]!.captainPlayerId = undefined;

    expect(evaluateGameNightCompatibility(night, defaultMovieMimeSpec).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNASSIGNED_PLAYERS" }),
        expect.objectContaining({ code: "TEAM_TOO_SMALL" }),
        expect.objectContaining({ code: "CAPTAIN_REQUIRED" }),
      ]),
    );
  });

  it("keeps unsupported and active games outside the launch path", () => {
    const night = session();
    night.currentRoomCode = "ACTIVE2";
    const result = evaluateGameNightCompatibility(night, defaultSecondSenseSpec, false);

    expect(result.compatible).toBe(false);
    expect(result.reasons.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["NOT_RELEASE_READY", "ACTIVE_GAME", "NOT_IN_CATALOG"]),
    );
  });
});
