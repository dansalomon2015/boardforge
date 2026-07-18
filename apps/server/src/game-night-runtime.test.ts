import { describe, expect, it } from "vitest";
import { defaultMovieMimeSpec, defaultSecondSenseSpec } from "@boardforge/game-spec";
import { createGameNightState, GameNightRuleError } from "@boardforge/game-engine";
import type { GameNightSessionRecord } from "./persistence";
import {
  createGameNightChildRoom,
  linkGameNightToChildRoom,
  recordCompletedChildGame,
  selectGameNightTeam,
} from "./game-night-runtime";

const hostPlayerId = "00000000-0000-4000-8000-000000000001";
const secondPlayerId = "00000000-0000-4000-8000-000000000002";
const nightId = "00000000-0000-4000-8000-000000000010";

function session(): GameNightSessionRecord {
  return {
    id: nightId,
    code: "NIGHT2",
    hostPlayerId,
    players: [
      { id: hostPlayerId, name: "Maya", isHost: true, connected: true },
      { id: secondPlayerId, name: "Noah", isHost: false, connected: true },
    ],
    reconnectTokenHashes: { [hostPlayerId]: "host-token-hash", [secondPlayerId]: "player-token-hash" },
    state: createGameNightState(nightId, [
      { id: "red", name: "Red", playerIds: [hostPlayerId], captainPlayerId: hostPlayerId },
      { id: "blue", name: "Blue", playerIds: [secondPlayerId], captainPlayerId: secondPlayerId },
    ]),
    currentRoomCode: null,
  };
}

describe("game-night child rooms", () => {
  it("preserves player identity and maps persistent teams and captains into the game", () => {
    const night = session();
    const room = createGameNightChildRoom({
      session: night,
      blueprintId: "movie-blueprint",
      spec: defaultMovieMimeSpec,
      roomCode: "CHILD2",
      gameInstanceId: "00000000-0000-4000-8000-000000000020",
    });

    expect(room.gameNightId).toBe(nightId);
    expect(room.gameInstanceId).toBe("00000000-0000-4000-8000-000000000020");
    expect([...room.players.keys()]).toEqual([hostPlayerId, secondPlayerId]);
    expect(room.lobbyTeamByPlayer).toEqual(
      new Map([
        [hostPlayerId, "team_1"],
        [secondPlayerId, "team_2"],
      ]),
    );
    expect(room.lobbyCaptainByTeam).toEqual(
      new Map([
        ["team_1", hostPlayerId],
        ["team_2", secondPlayerId],
      ]),
    );
    expect(room.gameNightTeamByGameTeam).toEqual(
      new Map([
        ["team_1", "red"],
        ["team_2", "blue"],
      ]),
    );
    expect(room.state).toBeNull();
    expect(linkGameNightToChildRoom(night, room).currentRoomCode).toBe("CHILD2");
  });

  it("does not require captain assignments for a game without captain-selected roles", () => {
    const night = session();
    night.state.teams = night.state.teams.map(({ captainPlayerId: _captain, ...team }) => team);
    const room = createGameNightChildRoom({
      session: night,
      blueprintId: "sense-blueprint",
      spec: defaultSecondSenseSpec,
      roomCode: "CHILD3",
      gameInstanceId: "00000000-0000-4000-8000-000000000021",
    });

    expect(room.lobbyCaptainByTeam.size).toBe(0);
  });

  it("moves one player between persistent teams and clears an obsolete captain", () => {
    const night = session();
    const moved = selectGameNightTeam(night, hostPlayerId, "blue");

    expect(moved.state.teams).toEqual([
      { id: "red", name: "Red", playerIds: [] },
      {
        id: "blue",
        name: "Blue",
        playerIds: [secondPlayerId, hostPlayerId],
        captainPlayerId: secondPlayerId,
      },
    ]);
    expect(night.state.teams[0]?.playerIds).toEqual([hostPlayerId]);

    moved.currentRoomCode = "ACTIVE2";
    expect(() => selectGameNightTeam(moved, hostPlayerId, "red")).toThrow("Teams are locked during a game");
  });

  it("rejects incompatible team counts and concurrent child rooms", () => {
    const night = session();
    night.state.teams.push({ id: "gold", name: "Gold", playerIds: [] });
    expect(() =>
      createGameNightChildRoom({
        session: night,
        blueprintId: "movie-blueprint",
        spec: defaultMovieMimeSpec,
        roomCode: "CHILD4",
        gameInstanceId: "00000000-0000-4000-8000-000000000022",
      }),
    ).toThrow(GameNightRuleError);

    const active = session();
    active.currentRoomCode = "ACTIVE2";
    expect(() =>
      createGameNightChildRoom({
        session: active,
        blueprintId: "movie-blueprint",
        spec: defaultMovieMimeSpec,
        roomCode: "CHILD4",
        gameInstanceId: "00000000-0000-4000-8000-000000000022",
      }),
    ).toThrow("Finish the current game");
  });

  it("translates a child-game winner into the persistent team and releases the board", () => {
    const night = session();
    const room = createGameNightChildRoom({
      session: night,
      blueprintId: "movie-blueprint",
      spec: defaultMovieMimeSpec,
      roomCode: "CHILD5",
      gameInstanceId: "00000000-0000-4000-8000-000000000023",
    });
    const linked = linkGameNightToChildRoom(night, room);
    const completedState = {
      template: "composed" as const,
      status: "completed" as const,
      winner: { kind: "teams" as const, ids: ["team_2"] },
    };

    const completed = recordCompletedChildGame(linked, room, completedState);

    expect(completed.currentRoomCode).toBeNull();
    expect(completed.state.scores).toEqual({ red: 0, blue: 3 });
    expect(completed.state.completedGames[0]?.winner).toEqual({ kind: "teams", ids: ["blue"] });
    expect(recordCompletedChildGame(completed, room, completedState)).toEqual(completed);
  });
});
