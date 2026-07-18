import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import {
  composedBalancePatchSchema,
  validateComposedGameSpec,
  validateGameSpec,
  type BoardGameSpec,
  type ComposedBalancePatch,
} from "@boardforge/game-spec";
import type {
  ComposedPlaytestReport,
  GameNightCompletedGame,
  GameNightScoreEvent,
  GameNightState,
} from "@boardforge/game-engine";
import { composedGameCritiqueSchema, type ComposedGameCritique } from "@boardforge/llm";
import type { GameAction, PublicPlayer } from "@boardforge/shared";
import { gameNightSessionSchema } from "./game-night-schemas";

export type BlueprintStatus = "draft" | "validating" | "playtesting" | "release_ready" | "needs_review";

export type BlueprintRecord = {
  id: string;
  spec: BoardGameSpec;
  status: BlueprintStatus;
  provider: string;
  prompt?: string | undefined;
  playtest?: ComposedPlaytestReport | undefined;
  critique?: ComposedGameCritique | undefined;
  suggestedPatch?: ComposedBalancePatch | undefined;
};

type BalancePatchStatus = "proposed" | "accepted" | "rejected";

export type BalancePatchRecord = {
  id: string;
  sourceBlueprintId: string;
  derivedBlueprintId: string;
  provider: string;
  patch: ComposedBalancePatch;
  beforeReport: ComposedPlaytestReport;
  afterReport: ComposedPlaytestReport;
  status: BalancePatchStatus;
};

export type RoomEventRecord = {
  id: string;
  roomCode: string;
  createdAt: string;
  sequence: number;
  actorId: string;
  actorIsHost: boolean;
  expectedRevision: number;
  resultingRevision: number;
  idempotencyKey: string;
  action: GameAction;
};

export type RoomSessionRecord = {
  code: string;
  blueprintId: string;
  gameNightId: string | null;
  gameInstanceId: string | null;
  gameNightTeamByGameTeam: Record<string, string>;
  players: PublicPlayer[];
  reconnectTokenHashes: Record<string, string>;
  lobbyTeamByPlayer: Record<string, string>;
  lobbyCaptainByTeam: Record<string, string>;
  seed: string | null;
  checkpoint: unknown | null;
  checkpointChecksum: string | null;
  checkpointRevision: number | null;
  events: RoomEventRecord[];
};

export type GameNightSessionRecord = {
  id: string;
  code: string;
  hostPlayerId: string;
  players: PublicPlayer[];
  reconnectTokenHashes: Record<string, string>;
  state: GameNightState;
  currentRoomCode: string | null;
};

export interface BlueprintStore {
  readonly mode: "memory" | "postgres";
  get(id: string): Promise<BlueprintRecord | undefined>;
  saveBlueprint(record: Omit<BlueprintRecord, "playtest" | "critique" | "suggestedPatch">): Promise<void>;
  savePlaytest(id: string, status: BlueprintStatus, report: ComposedPlaytestReport): Promise<void>;
  saveCritique(id: string, provider: string, critique: ComposedGameCritique): Promise<void>;
  saveReview(
    id: string,
    provider: string,
    critique: ComposedGameCritique,
    suggestedPatch: ComposedBalancePatch | null,
  ): Promise<void>;
  getBalancePatch(id: string): Promise<BalancePatchRecord | undefined>;
  listBalancePatchesForBlueprint(id: string): Promise<BalancePatchRecord[]>;
  saveBalancePatch(record: BalancePatchRecord): Promise<void>;
  acceptBalancePatch(id: string): Promise<BalancePatchRecord>;
  rejectBalancePatch(id: string): Promise<BalancePatchRecord>;
  loadRooms(): Promise<RoomSessionRecord[]>;
  saveRoom(record: Omit<RoomSessionRecord, "events">): Promise<void>;
  appendRoomEvent(record: Omit<RoomSessionRecord, "events">, event: RoomEventRecord): Promise<void>;
  findRoomEvent(roomCode: string, idempotencyKey: string): Promise<RoomEventRecord | undefined>;
  loadGameNights(): Promise<GameNightSessionRecord[]>;
  saveGameNight(record: GameNightSessionRecord): Promise<void>;
  appendGameNightResult(
    record: GameNightSessionRecord,
    completedGame: GameNightCompletedGame,
    scoreEvents: GameNightScoreEvent[],
  ): Promise<void>;
  health(): Promise<boolean>;
  close(): Promise<void>;
}

export type GameCatalogStore = Pick<BlueprintStore, "saveBlueprint" | "savePlaytest">;

export type BalanceWorkflowStore = Pick<
  BlueprintStore,
  | "get"
  | "saveBlueprint"
  | "savePlaytest"
  | "saveCritique"
  | "listBalancePatchesForBlueprint"
  | "saveBalancePatch"
  | "acceptBalancePatch"
  | "rejectBalancePatch"
>;

export type RealtimeRoomStore = Pick<
  BlueprintStore,
  "get" | "loadRooms" | "saveRoom" | "appendRoomEvent" | "findRoomEvent"
>;

function parseSpec(input: unknown): BoardGameSpec {
  const template = typeof input === "object" && input !== null && "template" in input ? input.template : undefined;
  const validation = template === "composed" ? validateComposedGameSpec(input) : validateGameSpec(input);
  if (!validation.ok) {
    throw new Error(
      `Refusing invalid persisted GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`,
    );
  }
  return validation.spec;
}

function cloneRecord(record: BlueprintRecord): BlueprintRecord {
  return structuredClone(record);
}

function parseGameNightSession(input: unknown): GameNightSessionRecord {
  const parsed = gameNightSessionSchema.safeParse(input);
  if (!parsed.success) throw new Error("Refusing invalid persisted game-night session.");
  const record = parsed.data;
  if (record.state.id !== record.id) throw new Error("Game-night state id does not match its session.");
  const playerIds = new Set(record.players.map((player) => player.id));
  const host = record.players.find((player) => player.id === record.hostPlayerId);
  if (!host?.isHost) throw new Error("Game-night host must be present in the player list.");
  const assignedPlayerIds = record.state.teams.flatMap((team) => team.playerIds);
  if (new Set(assignedPlayerIds).size !== assignedPlayerIds.length)
    throw new Error("A game-night player cannot belong to multiple teams.");
  if (assignedPlayerIds.some((playerId) => !playerIds.has(playerId)))
    throw new Error("Game-night teams cannot contain unknown players.");
  for (const team of record.state.teams) {
    if (team.captainPlayerId && !team.playerIds.includes(team.captainPlayerId))
      throw new Error("A game-night captain must belong to their team.");
  }
  return record;
}

function parseBalancePatch(input: unknown): ComposedBalancePatch {
  const parsed = composedBalancePatchSchema.safeParse(input);
  if (!parsed.success) throw new Error("Refusing invalid persisted balance patch.");
  return parsed.data;
}

function parseCritique(input: unknown): ComposedGameCritique {
  const parsed = composedGameCritiqueSchema.safeParse(input);
  if (!parsed.success) throw new Error("Refusing invalid persisted game critique.");
  return parsed.data;
}

export class MemoryBlueprintStore implements BlueprintStore {
  readonly mode = "memory" as const;
  private readonly records = new Map<string, BlueprintRecord>();
  private readonly balancePatches = new Map<string, BalancePatchRecord>();
  private readonly roomRecords = new Map<string, Omit<RoomSessionRecord, "events">>();
  private readonly roomEvents = new Map<string, RoomEventRecord[]>();
  private readonly gameNights = new Map<string, GameNightSessionRecord>();

  async get(id: string): Promise<BlueprintRecord | undefined> {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  async saveBlueprint(record: Omit<BlueprintRecord, "playtest" | "critique" | "suggestedPatch">): Promise<void> {
    const spec = parseSpec(record.spec);
    const existing = this.records.get(record.id);
    if (existing) {
      if (!isDeepStrictEqual(existing.spec, spec)) throw new Error(`Blueprint revision ${record.id} is immutable.`);
      return;
    }
    this.records.set(record.id, { ...record, spec });
  }

  async savePlaytest(id: string, status: BlueprintStatus, report: ComposedPlaytestReport): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Unknown blueprint: ${id}`);
    this.records.set(id, { ...existing, status, playtest: structuredClone(report) });
  }

  async saveCritique(id: string, provider: string, input: ComposedGameCritique): Promise<void> {
    await this.saveReview(id, provider, input, null);
  }

  async saveReview(
    id: string,
    _provider: string,
    input: ComposedGameCritique,
    suggestedPatchInput: ComposedBalancePatch | null,
  ): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Unknown blueprint: ${id}`);
    if (existing.spec.template !== "composed")
      throw new Error("Only composed blueprints support structured critiques.");
    const critique = parseCritique(input);
    if (critique.sourceSpecId !== existing.spec.id)
      throw new Error("Critique sourceSpecId does not match the blueprint GameSpec.");
    const suggestedPatch = suggestedPatchInput ? parseBalancePatch(suggestedPatchInput) : undefined;
    if (suggestedPatch && suggestedPatch.sourceSpecId !== existing.spec.id) {
      throw new Error("Suggested patch sourceSpecId does not match the blueprint GameSpec.");
    }
    if (
      existing.critique &&
      (!isDeepStrictEqual(existing.critique, critique) || !isDeepStrictEqual(existing.suggestedPatch, suggestedPatch))
    ) {
      throw new Error(`Game review for ${id} is immutable.`);
    }
    this.records.set(id, {
      ...existing,
      critique: structuredClone(critique),
      ...(suggestedPatch ? { suggestedPatch: structuredClone(suggestedPatch) } : {}),
    });
  }

  async getBalancePatch(id: string): Promise<BalancePatchRecord | undefined> {
    const record = this.balancePatches.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async listBalancePatchesForBlueprint(id: string): Promise<BalancePatchRecord[]> {
    return [...this.balancePatches.values()]
      .filter((patch) => patch.sourceBlueprintId === id || patch.derivedBlueprintId === id)
      .map((patch) => structuredClone(patch));
  }

  async saveBalancePatch(record: BalancePatchRecord): Promise<void> {
    if (!this.records.has(record.sourceBlueprintId) || !this.records.has(record.derivedBlueprintId)) {
      throw new Error("Balance patch blueprints must exist before the patch is persisted.");
    }
    const patch = parseBalancePatch(record.patch);
    const existing = this.balancePatches.get(record.id);
    if (existing && !isDeepStrictEqual(existing, record)) throw new Error(`Balance patch ${record.id} is immutable.`);
    if (!existing) this.balancePatches.set(record.id, structuredClone({ ...record, patch }));
  }

  async acceptBalancePatch(id: string): Promise<BalancePatchRecord> {
    const patch = this.balancePatches.get(id);
    if (!patch) throw new Error(`Unknown balance patch: ${id}`);
    if (patch.afterReport.status !== "passed") throw new Error("A failing balance patch cannot be accepted.");
    if (patch.status !== "proposed") throw new Error(`Balance patch ${id} is already ${patch.status}.`);
    const blueprint = this.records.get(patch.derivedBlueprintId);
    if (!blueprint) throw new Error(`Unknown blueprint: ${patch.derivedBlueprintId}`);
    if (blueprint.status !== "validating" || blueprint.critique?.verdict !== "release_ready") {
      throw new Error("The derived blueprint has not passed its structured critique gate.");
    }
    const accepted = { ...patch, status: "accepted" as const };
    this.balancePatches.set(id, accepted);
    this.records.set(blueprint.id, { ...blueprint, status: "release_ready" });
    return structuredClone(accepted);
  }

  async rejectBalancePatch(id: string): Promise<BalancePatchRecord> {
    const patch = this.balancePatches.get(id);
    if (!patch) throw new Error(`Unknown balance patch: ${id}`);
    if (patch.status !== "proposed") throw new Error(`Balance patch ${id} is already ${patch.status}.`);
    const blueprint = this.records.get(patch.derivedBlueprintId);
    if (!blueprint) throw new Error(`Unknown blueprint: ${patch.derivedBlueprintId}`);
    const rejected = { ...patch, status: "rejected" as const };
    this.balancePatches.set(id, rejected);
    this.records.set(blueprint.id, { ...blueprint, status: "needs_review" });
    return structuredClone(rejected);
  }

  async loadRooms(): Promise<RoomSessionRecord[]> {
    return [...this.roomRecords.values()].map((record) => ({
      ...structuredClone(record),
      events: structuredClone(this.roomEvents.get(record.code) ?? []),
    }));
  }

  async saveRoom(record: Omit<RoomSessionRecord, "events">): Promise<void> {
    if (!this.records.has(record.blueprintId)) throw new Error(`Unknown blueprint: ${record.blueprintId}`);
    this.roomRecords.set(record.code, structuredClone(record));
  }

  async appendRoomEvent(record: Omit<RoomSessionRecord, "events">, event: RoomEventRecord): Promise<void> {
    const events = this.roomEvents.get(record.code) ?? [];
    if (events.some((candidate) => candidate.idempotencyKey === event.idempotencyKey)) {
      throw new Error(`Duplicate room event idempotency key: ${event.idempotencyKey}`);
    }
    if (event.sequence !== events.length + 1) throw new Error(`Invalid room event sequence: ${event.sequence}`);
    this.roomEvents.set(record.code, [...events, structuredClone(event)]);
    await this.saveRoom(record);
  }

  async findRoomEvent(roomCode: string, idempotencyKey: string): Promise<RoomEventRecord | undefined> {
    const event = this.roomEvents.get(roomCode)?.find((candidate) => candidate.idempotencyKey === idempotencyKey);
    return event ? structuredClone(event) : undefined;
  }

  async loadGameNights(): Promise<GameNightSessionRecord[]> {
    return [...this.gameNights.values()].map((record) => structuredClone(record));
  }

  async saveGameNight(input: GameNightSessionRecord): Promise<void> {
    const record = parseGameNightSession(input);
    this.gameNights.set(record.id, structuredClone(record));
  }

  async appendGameNightResult(
    input: GameNightSessionRecord,
    completedGame: GameNightCompletedGame,
    scoreEvents: GameNightScoreEvent[],
  ): Promise<void> {
    const record = parseGameNightSession(input);
    if (!this.records.has(completedGame.blueprintId))
      throw new Error(`Unknown blueprint: ${completedGame.blueprintId}`);
    const existing = this.gameNights.get(record.id);
    if (!existing) throw new Error(`Unknown game night: ${record.id}`);
    const existingGame = existing.state.completedGames.find(
      (game) =>
        game.gameInstanceId === completedGame.gameInstanceId ||
        game.resultIdempotencyKey === completedGame.resultIdempotencyKey,
    );
    if (existingGame) {
      if (isDeepStrictEqual(existingGame, completedGame)) return;
      throw new Error("Conflicting game-night result.");
    }
    const persistedGame = record.state.completedGames.find(
      (game) => game.gameInstanceId === completedGame.gameInstanceId,
    );
    if (!persistedGame || !isDeepStrictEqual(persistedGame, completedGame))
      throw new Error("Game-night snapshot does not contain the appended result.");
    const persistedEvents = record.state.scoreEvents.filter((event) => completedGame.scoreEventIds.includes(event.id));
    if (!isDeepStrictEqual(persistedEvents, scoreEvents))
      throw new Error("Game-night snapshot does not contain the appended score events.");
    this.gameNights.set(record.id, structuredClone(record));
  }

  async health(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

type BlueprintRow = {
  id: string;
  spec: unknown;
  status: BlueprintStatus;
  provider: string;
  prompt: string | null;
  report: ComposedPlaytestReport | null;
  critique: unknown | null;
  suggested_patch: unknown | null;
};

type BalancePatchRow = {
  id: string;
  source_blueprint_id: string;
  derived_blueprint_id: string;
  provider: string;
  patch: unknown;
  before_report: ComposedPlaytestReport;
  after_report: ComposedPlaytestReport;
  status: BalancePatchStatus;
};

type RoomSessionRow = {
  code: string;
  blueprint_id: string;
  game_night_id: string | null;
  game_instance_id: string | null;
  game_night_team_by_game_team: Record<string, string>;
  players: PublicPlayer[];
  reconnect_token_hashes: Record<string, string>;
  lobby_team_by_player: Record<string, string>;
  lobby_captain_by_team: Record<string, string>;
  seed: string | null;
  checkpoint: unknown | null;
  checkpoint_checksum: string | null;
  checkpoint_revision: number | null;
};

type RoomEventRow = {
  id: string;
  room_code: string;
  created_at: Date;
  sequence: number;
  actor_id: string;
  actor_is_host: boolean;
  expected_revision: number;
  resulting_revision: number;
  idempotency_key: string;
  action: GameAction;
};

type GameNightRow = {
  id: string;
  code: string;
  host_player_id: string;
  players: PublicPlayer[];
  reconnect_token_hashes: Record<string, string>;
  state: unknown;
  current_room_code: string | null;
};

type GameNightGameRow = {
  id: string;
  blueprint_id: string;
  result_idempotency_key: string;
  winner: GameNightCompletedGame["winner"];
  awarded_team_ids: string[];
  score_event_ids: string[];
};

function roomEventFromRow(row: RoomEventRow): RoomEventRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    createdAt: row.created_at.toISOString(),
    sequence: row.sequence,
    actorId: row.actor_id,
    actorIsHost: row.actor_is_host,
    expectedRevision: row.expected_revision,
    resultingRevision: row.resulting_revision,
    idempotencyKey: row.idempotency_key,
    action: row.action,
  };
}

function balancePatchFromRow(row: BalancePatchRow): BalancePatchRecord {
  return {
    id: row.id,
    sourceBlueprintId: row.source_blueprint_id,
    derivedBlueprintId: row.derived_blueprint_id,
    provider: row.provider,
    patch: parseBalancePatch(row.patch),
    beforeReport: row.before_report,
    afterReport: row.after_report,
    status: row.status,
  };
}

class PostgresBlueprintStore implements BlueprintStore {
  readonly mode = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  async migrate(): Promise<void> {
    for (const filename of [
      "0001_blueprints.sql",
      "0002_room_events.sql",
      "0003_balance_patches.sql",
      "0004_game_critiques.sql",
      "0005_review_suggestions.sql",
      "0006_compilation_jobs.sql",
      "0007_room_captains.sql",
      "0008_composed_experience_ids.sql",
      "0009_game_nights.sql",
      "0010_game_night_room_links.sql",
      "0011_game_night_team_mapping.sql",
    ]) {
      const migration = await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8");
      await this.pool.query(migration);
    }
  }

  async get(id: string): Promise<BlueprintRecord | undefined> {
    const result = await this.pool.query<BlueprintRow>(
      `SELECT b.id, b.spec, b.status, b.provider, b.prompt, p.report, c.critique, c.suggested_patch
       FROM blueprint_revisions b
       LEFT JOIN playtest_reports p ON p.blueprint_id = b.id
       LEFT JOIN game_critiques c ON c.blueprint_id = b.id
       WHERE b.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      spec: parseSpec(row.spec),
      status: row.status,
      provider: row.provider,
      ...(row.prompt ? { prompt: row.prompt } : {}),
      ...(row.report ? { playtest: row.report } : {}),
      ...(row.critique ? { critique: parseCritique(row.critique) } : {}),
      ...(row.suggested_patch ? { suggestedPatch: parseBalancePatch(row.suggested_patch) } : {}),
    };
  }

  async saveBlueprint(record: Omit<BlueprintRecord, "playtest" | "critique" | "suggestedPatch">): Promise<void> {
    const spec = parseSpec(record.spec);
    const inserted = await this.pool.query(
      `INSERT INTO blueprint_revisions (id, spec, status, provider, prompt)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [record.id, JSON.stringify(spec), record.status, record.provider, record.prompt ?? null],
    );
    if (inserted.rowCount === 0) {
      const existing = await this.pool.query<{ spec: unknown }>("SELECT spec FROM blueprint_revisions WHERE id = $1", [
        record.id,
      ]);
      if (!existing.rows[0] || !isDeepStrictEqual(parseSpec(existing.rows[0].spec), spec)) {
        throw new Error(`Blueprint revision ${record.id} is immutable.`);
      }
    }
  }

  async savePlaytest(id: string, status: BlueprintStatus, report: ComposedPlaytestReport): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        "UPDATE blueprint_revisions SET status = $2, updated_at = now() WHERE id = $1",
        [id, status],
      );
      if (updated.rowCount !== 1) throw new Error(`Unknown blueprint: ${id}`);
      await client.query(
        `INSERT INTO playtest_reports (blueprint_id, report)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (blueprint_id) DO UPDATE SET report = EXCLUDED.report, updated_at = now()`,
        [id, JSON.stringify(report)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveCritique(id: string, provider: string, input: ComposedGameCritique): Promise<void> {
    await this.saveReview(id, provider, input, null);
  }

  async saveReview(
    id: string,
    provider: string,
    input: ComposedGameCritique,
    suggestedPatchInput: ComposedBalancePatch | null,
  ): Promise<void> {
    const blueprint = await this.get(id);
    if (!blueprint) throw new Error(`Unknown blueprint: ${id}`);
    if (blueprint.spec.template !== "composed")
      throw new Error("Only composed blueprints support structured critiques.");
    const critique = parseCritique(input);
    if (critique.sourceSpecId !== blueprint.spec.id)
      throw new Error("Critique sourceSpecId does not match the blueprint GameSpec.");
    const suggestedPatch = suggestedPatchInput ? parseBalancePatch(suggestedPatchInput) : undefined;
    if (suggestedPatch && suggestedPatch.sourceSpecId !== blueprint.spec.id) {
      throw new Error("Suggested patch sourceSpecId does not match the blueprint GameSpec.");
    }
    const inserted = await this.pool.query(
      `INSERT INTO game_critiques (blueprint_id, provider, critique, suggested_patch)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (blueprint_id) DO NOTHING
       RETURNING blueprint_id`,
      [id, provider, JSON.stringify(critique), suggestedPatch ? JSON.stringify(suggestedPatch) : null],
    );
    if (inserted.rowCount === 0) {
      const existing = await this.pool.query<{ critique: unknown; suggested_patch: unknown | null }>(
        "SELECT critique, suggested_patch FROM game_critiques WHERE blueprint_id = $1",
        [id],
      );
      const row = existing.rows[0];
      const existingPatch = row?.suggested_patch ? parseBalancePatch(row.suggested_patch) : undefined;
      if (
        !row ||
        !isDeepStrictEqual(parseCritique(row.critique), critique) ||
        !isDeepStrictEqual(existingPatch, suggestedPatch)
      ) {
        throw new Error(`Game review for ${id} is immutable.`);
      }
    }
  }

  async getBalancePatch(id: string): Promise<BalancePatchRecord | undefined> {
    const result = await this.pool.query<BalancePatchRow>(
      `SELECT id, source_blueprint_id, derived_blueprint_id, provider, patch,
              before_report, after_report, status
       FROM balance_patches
       WHERE id = $1::uuid`,
      [id],
    );
    return result.rows[0] ? balancePatchFromRow(result.rows[0]) : undefined;
  }

  async listBalancePatchesForBlueprint(id: string): Promise<BalancePatchRecord[]> {
    const result = await this.pool.query<BalancePatchRow>(
      `SELECT id, source_blueprint_id, derived_blueprint_id, provider, patch,
              before_report, after_report, status
       FROM balance_patches
       WHERE source_blueprint_id = $1 OR derived_blueprint_id = $1
       ORDER BY created_at, id`,
      [id],
    );
    return result.rows.map(balancePatchFromRow);
  }

  async saveBalancePatch(record: BalancePatchRecord): Promise<void> {
    const patch = parseBalancePatch(record.patch);
    const inserted = await this.pool.query(
      `INSERT INTO balance_patches (
         id, source_blueprint_id, derived_blueprint_id, provider, patch,
         before_report, after_report, status
       ) VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        record.id,
        record.sourceBlueprintId,
        record.derivedBlueprintId,
        record.provider,
        JSON.stringify(patch),
        JSON.stringify(record.beforeReport),
        JSON.stringify(record.afterReport),
        record.status,
      ],
    );
    if (inserted.rowCount === 0) {
      const existing = await this.getBalancePatch(record.id);
      if (!existing || !isDeepStrictEqual(existing, record))
        throw new Error(`Balance patch ${record.id} is immutable.`);
    }
  }

  async acceptBalancePatch(id: string): Promise<BalancePatchRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<BalancePatchRow>(
        `SELECT id, source_blueprint_id, derived_blueprint_id, provider, patch,
                before_report, after_report, status
         FROM balance_patches
         WHERE id = $1::uuid
         FOR UPDATE`,
        [id],
      );
      const row = selected.rows[0];
      if (!row) throw new Error(`Unknown balance patch: ${id}`);
      if (row.after_report.status !== "passed") throw new Error("A failing balance patch cannot be accepted.");
      if (row.status !== "proposed") throw new Error(`Balance patch ${id} is already ${row.status}.`);
      const derived = await client.query<{ status: BlueprintStatus; critique: unknown | null }>(
        `SELECT b.status, c.critique
         FROM blueprint_revisions b
         LEFT JOIN game_critiques c ON c.blueprint_id = b.id
         WHERE b.id = $1
         FOR UPDATE OF b`,
        [row.derived_blueprint_id],
      );
      const derivedRow = derived.rows[0];
      if (!derivedRow) throw new Error(`Unknown blueprint: ${row.derived_blueprint_id}`);
      const critique = derivedRow.critique ? parseCritique(derivedRow.critique) : undefined;
      if (derivedRow.status !== "validating" || critique?.verdict !== "release_ready") {
        throw new Error("The derived blueprint has not passed its structured critique gate.");
      }
      await client.query("UPDATE balance_patches SET status = 'accepted', decided_at = now() WHERE id = $1::uuid", [
        id,
      ]);
      const updated = await client.query(
        "UPDATE blueprint_revisions SET status = 'release_ready', updated_at = now() WHERE id = $1",
        [row.derived_blueprint_id],
      );
      if (updated.rowCount !== 1) throw new Error(`Unknown blueprint: ${row.derived_blueprint_id}`);
      await client.query("COMMIT");
      return balancePatchFromRow({ ...row, status: "accepted" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectBalancePatch(id: string): Promise<BalancePatchRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<BalancePatchRow>(
        `SELECT id, source_blueprint_id, derived_blueprint_id, provider, patch,
                before_report, after_report, status
         FROM balance_patches
         WHERE id = $1::uuid
         FOR UPDATE`,
        [id],
      );
      const row = selected.rows[0];
      if (!row) throw new Error(`Unknown balance patch: ${id}`);
      if (row.status !== "proposed") throw new Error(`Balance patch ${id} is already ${row.status}.`);
      await client.query("UPDATE balance_patches SET status = 'rejected', decided_at = now() WHERE id = $1::uuid", [
        id,
      ]);
      const updated = await client.query(
        "UPDATE blueprint_revisions SET status = 'needs_review', updated_at = now() WHERE id = $1",
        [row.derived_blueprint_id],
      );
      if (updated.rowCount !== 1) throw new Error(`Unknown blueprint: ${row.derived_blueprint_id}`);
      await client.query("COMMIT");
      return balancePatchFromRow({ ...row, status: "rejected" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async loadRooms(): Promise<RoomSessionRecord[]> {
    const sessions = await this.pool.query<RoomSessionRow>(
      `SELECT code, blueprint_id, game_night_id, game_instance_id, game_night_team_by_game_team,
              players, reconnect_token_hashes,
              lobby_team_by_player, lobby_captain_by_team,
              seed, checkpoint, checkpoint_checksum, checkpoint_revision
       FROM room_sessions
       ORDER BY created_at`,
    );
    const events = await this.pool.query<RoomEventRow>(
      `SELECT id, room_code, created_at, sequence, actor_id, actor_is_host, expected_revision,
              resulting_revision, idempotency_key, action
       FROM room_events
       ORDER BY room_code, sequence`,
    );
    const byRoom = new Map<string, RoomEventRecord[]>();
    for (const row of events.rows) {
      const roomEvents = byRoom.get(row.room_code) ?? [];
      roomEvents.push(roomEventFromRow(row));
      byRoom.set(row.room_code, roomEvents);
    }
    return sessions.rows.map((row) => ({
      code: row.code,
      blueprintId: row.blueprint_id,
      gameNightId: row.game_night_id,
      gameInstanceId: row.game_instance_id,
      gameNightTeamByGameTeam: row.game_night_team_by_game_team,
      players: row.players,
      reconnectTokenHashes: row.reconnect_token_hashes,
      lobbyTeamByPlayer: row.lobby_team_by_player,
      lobbyCaptainByTeam: row.lobby_captain_by_team,
      seed: row.seed,
      checkpoint: row.checkpoint,
      checkpointChecksum: row.checkpoint_checksum,
      checkpointRevision: row.checkpoint_revision,
      events: byRoom.get(row.code) ?? [],
    }));
  }

  async saveRoom(record: Omit<RoomSessionRecord, "events">): Promise<void> {
    await this.pool.query(
      `INSERT INTO room_sessions (
         code, blueprint_id, game_night_id, game_instance_id, game_night_team_by_game_team,
         players, reconnect_token_hashes,
         lobby_team_by_player, lobby_captain_by_team,
         seed, checkpoint, checkpoint_checksum, checkpoint_revision
       ) VALUES ($1, $2, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, $13)
       ON CONFLICT (code) DO UPDATE SET
         game_night_id = EXCLUDED.game_night_id,
         game_instance_id = EXCLUDED.game_instance_id,
         game_night_team_by_game_team = EXCLUDED.game_night_team_by_game_team,
         players = EXCLUDED.players,
         reconnect_token_hashes = EXCLUDED.reconnect_token_hashes,
         lobby_team_by_player = EXCLUDED.lobby_team_by_player,
         lobby_captain_by_team = EXCLUDED.lobby_captain_by_team,
         seed = EXCLUDED.seed,
         checkpoint = EXCLUDED.checkpoint,
         checkpoint_checksum = EXCLUDED.checkpoint_checksum,
         checkpoint_revision = EXCLUDED.checkpoint_revision,
         updated_at = now()`,
      [
        record.code,
        record.blueprintId,
        record.gameNightId,
        record.gameInstanceId,
        JSON.stringify(record.gameNightTeamByGameTeam),
        JSON.stringify(record.players),
        JSON.stringify(record.reconnectTokenHashes),
        JSON.stringify(record.lobbyTeamByPlayer),
        JSON.stringify(record.lobbyCaptainByTeam),
        record.seed,
        record.checkpoint === null ? null : JSON.stringify(record.checkpoint),
        record.checkpointChecksum,
        record.checkpointRevision,
      ],
    );
  }

  async appendRoomEvent(record: Omit<RoomSessionRecord, "events">, event: RoomEventRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO room_events (
           id, room_code, created_at, sequence, actor_id, actor_is_host, expected_revision,
           resulting_revision, idempotency_key, action
         ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10::jsonb)`,
        [
          event.id,
          event.roomCode,
          event.createdAt,
          event.sequence,
          event.actorId,
          event.actorIsHost,
          event.expectedRevision,
          event.resultingRevision,
          event.idempotencyKey,
          JSON.stringify(event.action),
        ],
      );
      await client.query(
        `UPDATE room_sessions SET
           players = $2::jsonb,
           reconnect_token_hashes = $3::jsonb,
           lobby_team_by_player = $4::jsonb,
           lobby_captain_by_team = $5::jsonb,
           seed = $6,
           checkpoint = $7::jsonb,
           checkpoint_checksum = $8,
           checkpoint_revision = $9,
           updated_at = now()
         WHERE code = $1`,
        [
          record.code,
          JSON.stringify(record.players),
          JSON.stringify(record.reconnectTokenHashes),
          JSON.stringify(record.lobbyTeamByPlayer),
          JSON.stringify(record.lobbyCaptainByTeam),
          record.seed,
          record.checkpoint === null ? null : JSON.stringify(record.checkpoint),
          record.checkpointChecksum,
          record.checkpointRevision,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findRoomEvent(roomCode: string, idempotencyKey: string): Promise<RoomEventRecord | undefined> {
    const result = await this.pool.query<RoomEventRow>(
      `SELECT id, room_code, created_at, sequence, actor_id, actor_is_host, expected_revision,
              resulting_revision, idempotency_key, action
       FROM room_events
       WHERE room_code = $1 AND idempotency_key = $2`,
      [roomCode, idempotencyKey],
    );
    return result.rows[0] ? roomEventFromRow(result.rows[0]) : undefined;
  }

  async loadGameNights(): Promise<GameNightSessionRecord[]> {
    const result = await this.pool.query<GameNightRow>(
      `SELECT id, code, host_player_id, players, reconnect_token_hashes, state, current_room_code
       FROM game_nights
       ORDER BY created_at`,
    );
    return result.rows.map((row) =>
      parseGameNightSession({
        id: row.id,
        code: row.code,
        hostPlayerId: row.host_player_id,
        players: row.players,
        reconnectTokenHashes: row.reconnect_token_hashes,
        state: row.state,
        currentRoomCode: row.current_room_code,
      }),
    );
  }

  async saveGameNight(input: GameNightSessionRecord): Promise<void> {
    const record = parseGameNightSession(input);
    await this.pool.query(
      `INSERT INTO game_nights (
         id, code, host_player_id, players, reconnect_token_hashes, state, current_room_code
       ) VALUES ($1::uuid, $2, $3::uuid, $4::jsonb, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (id) DO UPDATE SET
         players = EXCLUDED.players,
         reconnect_token_hashes = EXCLUDED.reconnect_token_hashes,
         state = EXCLUDED.state,
         current_room_code = EXCLUDED.current_room_code,
         updated_at = now()`,
      [
        record.id,
        record.code,
        record.hostPlayerId,
        JSON.stringify(record.players),
        JSON.stringify(record.reconnectTokenHashes),
        JSON.stringify(record.state),
        record.currentRoomCode,
      ],
    );
  }

  async appendGameNightResult(
    input: GameNightSessionRecord,
    completedGame: GameNightCompletedGame,
    scoreEvents: GameNightScoreEvent[],
  ): Promise<void> {
    const record = parseGameNightSession(input);
    const persistedGame = record.state.completedGames.find(
      (game) => game.gameInstanceId === completedGame.gameInstanceId,
    );
    const persistedEvents = record.state.scoreEvents.filter((event) => completedGame.scoreEventIds.includes(event.id));
    if (!persistedGame || !isDeepStrictEqual(persistedGame, completedGame))
      throw new Error("Game-night snapshot does not contain the appended result.");
    if (!isDeepStrictEqual(persistedEvents, scoreEvents))
      throw new Error("Game-night snapshot does not contain the appended score events.");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<GameNightGameRow>(
        `SELECT id, blueprint_id, result_idempotency_key, winner, awarded_team_ids, score_event_ids
         FROM game_night_games
         WHERE game_night_id = $1::uuid AND (id = $2::uuid OR result_idempotency_key = $3)
         FOR UPDATE`,
        [record.id, completedGame.gameInstanceId, completedGame.resultIdempotencyKey],
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        const existingGame: GameNightCompletedGame = {
          gameInstanceId: existingRow.id,
          blueprintId: existingRow.blueprint_id,
          resultIdempotencyKey: existingRow.result_idempotency_key,
          winner: existingRow.winner,
          awardedTeamIds: existingRow.awarded_team_ids,
          scoreEventIds: existingRow.score_event_ids,
        };
        if (!isDeepStrictEqual(existingGame, completedGame)) throw new Error("Conflicting game-night result.");
        await client.query("COMMIT");
        return;
      }

      await client.query(
        `INSERT INTO game_night_games (
           id, game_night_id, ordinal, blueprint_id, room_code, result_idempotency_key,
           winner, awarded_team_ids, score_event_ids
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
        [
          completedGame.gameInstanceId,
          record.id,
          record.state.completedGames.findIndex((game) => game.gameInstanceId === completedGame.gameInstanceId) + 1,
          completedGame.blueprintId,
          record.currentRoomCode,
          completedGame.resultIdempotencyKey,
          JSON.stringify(completedGame.winner),
          JSON.stringify(completedGame.awardedTeamIds),
          JSON.stringify(completedGame.scoreEventIds),
        ],
      );
      for (const event of scoreEvents) {
        await client.query(
          `INSERT INTO game_night_score_events (
             game_night_id, id, game_instance_id, team_id, points, reason
           ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6)`,
          [record.id, event.id, event.gameInstanceId, event.teamId, event.points, event.reason],
        );
      }
      await client.query(
        `UPDATE game_nights SET players = $2::jsonb, reconnect_token_hashes = $3::jsonb,
           state = $4::jsonb, current_room_code = $5, updated_at = now()
         WHERE id = $1::uuid`,
        [
          record.id,
          JSON.stringify(record.players),
          JSON.stringify(record.reconnectTokenHashes),
          JSON.stringify(record.state),
          record.currentRoomCode,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createBlueprintStore(options: {
  databaseUrl?: string | undefined;
  requireDatabase?: boolean | undefined;
  seed: BlueprintRecord[];
  onFallback?: (error: unknown) => void;
}): Promise<BlueprintStore> {
  let store: BlueprintStore;
  if (options.databaseUrl) {
    const pool = new Pool({ connectionString: options.databaseUrl, connectionTimeoutMillis: 2_000, max: 5 });
    const postgres = new PostgresBlueprintStore(pool);
    try {
      await postgres.migrate();
      store = postgres;
    } catch (error) {
      await pool.end().catch(() => undefined);
      if (options.requireDatabase) throw error;
      options.onFallback?.(error);
      store = new MemoryBlueprintStore();
    }
  } else {
    if (options.requireDatabase) throw new Error("DATABASE_URL is required.");
    store = new MemoryBlueprintStore();
  }

  for (const record of options.seed) {
    await store.saveBlueprint(record);
    if (record.playtest) await store.savePlaytest(record.id, record.status, record.playtest);
  }
  return store;
}
