import { describe, expect, it } from "vitest";
import { defaultMovieMimeSpec, defaultSecondSenseSpec } from "@boardforge/game-spec";
import { createGameNightState, GameNightRuleError, initializeComposedGame } from "@boardforge/game-engine";
import type { GameNightSessionRecord } from "./persistence";
import { viewForGameNight } from "./game-night-routes";
import {
  createGameNightChildRoom,
  linkGameNightToChildRoom,
  openGameNightBoard,
  recordCompletedChildGame,
  selectGameNightCaptain,
  selectGameNightGame,
  selectGameNightTeam,
} from "./game-night-runtime";
import { viewFor } from "./room-runtime";

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
    expect(room.gameNightTeamPresentationByGameTeam.get("team_1")).toMatchObject({ name: "Red" });
    expect(room.gameNightTeamPresentationByGameTeam.get("team_2")).toMatchObject({ name: "Blue" });
    expect(room.state).toBeNull();
    expect(linkGameNightToChildRoom(night, room).currentRoomCode).toBe("CHILD2");

    room.state = initializeComposedGame(
      defaultMovieMimeSpec,
      night.players,
      "presentation-test",
      Object.fromEntries(room.lobbyTeamByPlayer),
      Object.fromEntries(room.lobbyCaptainByTeam),
    );
    const activeView = viewFor(room, hostPlayerId);
    expect(activeView).toMatchObject({
      kind: "composed",
      teams: [expect.objectContaining({ name: "Red" }), expect.objectContaining({ name: "Blue" })],
    });
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

  it("lets only the host open a ready board and keeps the transition idempotent", () => {
    const night = session();

    expect(() => openGameNightBoard(night, secondPlayerId)).toThrow("Only the host");
    const opened = openGameNightBoard(night, hostPlayerId);

    expect(opened.state.status).toBe("playing");
    expect(night.state.status).toBe("lobby");
    expect(openGameNightBoard(opened, hostPlayerId)).toBe(opened);

    const unassigned = session();
    unassigned.state.teams[1]!.playerIds = [];
    expect(() => openGameNightBoard(unassigned, hostPlayerId)).toThrow("Every player must choose a team");
  });

  it("persists only the host's next-game selection after the board opens", () => {
    const night = openGameNightBoard(session(), hostPlayerId);

    expect(() => selectGameNightGame(night, secondPlayerId, "movie-blueprint")).toThrow("Only the host");
    const selected = selectGameNightGame(night, hostPlayerId, "movie-blueprint");

    expect(selected.state.selectedBlueprintId).toBe("movie-blueprint");
    expect(night.state.selectedBlueprintId).toBeNull();
    expect(selectGameNightGame(selected, hostPlayerId, "movie-blueprint")).toBe(selected);
  });

  it("lets the host choose a captain from the selected team without mutating the session", () => {
    const night = session();
    night.state.teams = night.state.teams.map(({ captainPlayerId: _captain, ...team }) => team);

    expect(() => selectGameNightCaptain(night, secondPlayerId, "red", hostPlayerId)).toThrow("Only the host");
    expect(() => selectGameNightCaptain(night, hostPlayerId, "red", secondPlayerId)).toThrow(
      "must belong to the selected team",
    );
    const selected = selectGameNightCaptain(night, hostPlayerId, "red", hostPlayerId);

    expect(selected.state.teams[0]?.captainPlayerId).toBe(hostPlayerId);
    expect(night.state.teams[0]?.captainPlayerId).toBeUndefined();
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
    expect(viewForGameNight(completed, hostPlayerId).history).toEqual([
      {
        ordinal: 1,
        gameInstanceId: "00000000-0000-4000-8000-000000000023",
        blueprintId: "movie-blueprint",
        winner: { kind: "teams", ids: ["blue"] },
        awards: [{ teamId: "blue", points: 3, reason: "win" }],
      },
    ]);
    expect(recordCompletedChildGame(completed, room, completedState)).toEqual(completed);
  });
});
