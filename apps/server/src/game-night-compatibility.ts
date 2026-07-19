import type { BoardGameSpec } from "@boardforge/game-spec";
import type { GameNightCompatibility, GameNightCompatibilityReason } from "@boardforge/shared";
import type { GameNightSessionRecord } from "./persistence";
import { adaptGameNightSpec, isRankedGameNightSpec } from "./game-night-spec";

function reason(code: GameNightCompatibilityReason["code"], message: string): GameNightCompatibilityReason {
  return { code, message };
}

export function evaluateGameNightCompatibility(
  session: GameNightSessionRecord,
  spec: BoardGameSpec,
  releaseReady = true,
): GameNightCompatibility {
  const adaptedSpec = adaptGameNightSpec(spec, session.state.teams);
  const reasons: GameNightCompatibilityReason[] = [];
  const playerCount = session.players.length;
  const isRankedExperience = isRankedGameNightSpec(adaptedSpec);

  if (!releaseReady) reasons.push(reason("NOT_RELEASE_READY", "This game has not passed its release checks."));
  if (session.currentRoomCode)
    reasons.push(reason("ACTIVE_GAME", "Finish the current game before starting another one."));
  if (!isRankedExperience) {
    reasons.push(reason("NOT_IN_CATALOG", "This game is not part of the ranked Game Night catalogue yet."));
  }
  if (playerCount < adaptedSpec.minPlayers) {
    reasons.push(reason("TOO_FEW_PLAYERS", `This game needs at least ${adaptedSpec.minPlayers} players.`));
  }
  if (playerCount > adaptedSpec.maxPlayers) {
    reasons.push(reason("TOO_MANY_PLAYERS", `This game supports at most ${adaptedSpec.maxPlayers} players.`));
  }

  const assignedPlayerIds = new Set(session.state.teams.flatMap((team) => team.playerIds));
  const unassignedCount = session.players.filter((player) => !assignedPlayerIds.has(player.id)).length;
  if (unassignedCount > 0) {
    reasons.push(
      reason(
        "UNASSIGNED_PLAYERS",
        `${unassignedCount} ${unassignedCount === 1 ? "player needs" : "players need"} to choose a team.`,
      ),
    );
  }

  const requiresCaptains =
    adaptedSpec.template === "composed" && adaptedSpec.actions.some((action) => action.actor === "team_captain");
  if (adaptedSpec.template === "composed" && adaptedSpec.setup.mode === "teams" && adaptedSpec.setup.teamPolicy) {
    const policy = adaptedSpec.setup.teamPolicy;
    if (session.state.teams.length !== policy.teams.length) {
      reasons.push(
        reason(
          "TEAM_COUNT_MISMATCH",
          `This version supports ${policy.teams.length} teams; your Game Night has ${session.state.teams.length}.`,
        ),
      );
    }
    for (const team of session.state.teams) {
      if (team.playerIds.length < policy.minMembersPerTeam) {
        reasons.push(
          reason(
            "TEAM_TOO_SMALL",
            `${team.name} needs at least ${policy.minMembersPerTeam} ${policy.minMembersPerTeam === 1 ? "player" : "players"}.`,
          ),
        );
      }
      if (policy.maxMembersPerTeam && team.playerIds.length > policy.maxMembersPerTeam) {
        reasons.push(
          reason("TEAM_TOO_LARGE", `${team.name} supports at most ${policy.maxMembersPerTeam} players for this game.`),
        );
      }
      if (requiresCaptains && !team.captainPlayerId) {
        reasons.push(reason("CAPTAIN_REQUIRED", `Choose a captain for ${team.name} before launching this game.`));
      }
    }
    if (!policy.allowUnevenTeams && new Set(session.state.teams.map((team) => team.playerIds.length)).size > 1) {
      reasons.push(reason("UNEVEN_TEAMS", "This game requires teams of equal size."));
    }
  }

  return {
    compatible: reasons.length === 0,
    scoring: isRankedExperience ? "ranked" : "unsupported",
    requiresCaptains,
    reasons,
  };
}
