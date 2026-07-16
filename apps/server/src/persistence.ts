import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import {
  validateComposedGameSpec,
  validateGameSpec,
  type BoardGameSpec,
} from "@boardforge/game-spec";
import type { ComposedPlaytestReport } from "@boardforge/game-engine";
import type { GameAction, PublicPlayer } from "@boardforge/shared";

export type BlueprintStatus = "draft" | "validating" | "playtesting" | "release_ready" | "needs_review";

export type BlueprintRecord = {
  id: string;
  spec: BoardGameSpec;
  status: BlueprintStatus;
  provider: string;
  prompt?: string | undefined;
  playtest?: ComposedPlaytestReport | undefined;
};

export type RoomEventRecord = {
  id: string;
  roomCode: string;
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
  players: PublicPlayer[];
  reconnectTokenHashes: Record<string, string>;
  lobbyTeamByPlayer: Record<string, string>;
  seed: string | null;
  checkpoint: unknown | null;
  checkpointChecksum: string | null;
  checkpointRevision: number | null;
  events: RoomEventRecord[];
};

export interface BlueprintStore {
  readonly mode: "memory" | "postgres";
  get(id: string): Promise<BlueprintRecord | undefined>;
  saveBlueprint(record: Omit<BlueprintRecord, "playtest">): Promise<void>;
  savePlaytest(id: string, status: BlueprintStatus, report: ComposedPlaytestReport): Promise<void>;
  loadRooms(): Promise<RoomSessionRecord[]>;
  saveRoom(record: Omit<RoomSessionRecord, "events">): Promise<void>;
  appendRoomEvent(record: Omit<RoomSessionRecord, "events">, event: RoomEventRecord): Promise<void>;
  findRoomEvent(roomCode: string, idempotencyKey: string): Promise<RoomEventRecord | undefined>;
  health(): Promise<boolean>;
  close(): Promise<void>;
}

function parseSpec(input: unknown): BoardGameSpec {
  const template = typeof input === "object" && input !== null && "template" in input ? input.template : undefined;
  const validation = template === "composed" ? validateComposedGameSpec(input) : validateGameSpec(input);
  if (!validation.ok) {
    throw new Error(`Refusing invalid persisted GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`);
  }
  return validation.spec;
}

function cloneRecord(record: BlueprintRecord): BlueprintRecord {
  return structuredClone(record);
}

export class MemoryBlueprintStore implements BlueprintStore {
  readonly mode = "memory" as const;
  private readonly records = new Map<string, BlueprintRecord>();
  private readonly roomRecords = new Map<string, Omit<RoomSessionRecord, "events">>();
  private readonly roomEvents = new Map<string, RoomEventRecord[]>();

  async get(id: string): Promise<BlueprintRecord | undefined> {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  async saveBlueprint(record: Omit<BlueprintRecord, "playtest">): Promise<void> {
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
};

type RoomSessionRow = {
  code: string;
  blueprint_id: string;
  players: PublicPlayer[];
  reconnect_token_hashes: Record<string, string>;
  lobby_team_by_player: Record<string, string>;
  seed: string | null;
  checkpoint: unknown | null;
  checkpoint_checksum: string | null;
  checkpoint_revision: number | null;
};

type RoomEventRow = {
  id: string;
  room_code: string;
  sequence: number;
  actor_id: string;
  actor_is_host: boolean;
  expected_revision: number;
  resulting_revision: number;
  idempotency_key: string;
  action: GameAction;
};

function roomEventFromRow(row: RoomEventRow): RoomEventRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    sequence: row.sequence,
    actorId: row.actor_id,
    actorIsHost: row.actor_is_host,
    expectedRevision: row.expected_revision,
    resultingRevision: row.resulting_revision,
    idempotencyKey: row.idempotency_key,
    action: row.action,
  };
}

class PostgresBlueprintStore implements BlueprintStore {
  readonly mode = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  async migrate(): Promise<void> {
    for (const filename of ["0001_blueprints.sql", "0002_room_events.sql"]) {
      const migration = await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8");
      await this.pool.query(migration);
    }
  }

  async get(id: string): Promise<BlueprintRecord | undefined> {
    const result = await this.pool.query<BlueprintRow>(
      `SELECT b.id, b.spec, b.status, b.provider, b.prompt, p.report
       FROM blueprint_revisions b
       LEFT JOIN playtest_reports p ON p.blueprint_id = b.id
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
    };
  }

  async saveBlueprint(record: Omit<BlueprintRecord, "playtest">): Promise<void> {
    const spec = parseSpec(record.spec);
    const inserted = await this.pool.query(
      `INSERT INTO blueprint_revisions (id, spec, status, provider, prompt)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [record.id, JSON.stringify(spec), record.status, record.provider, record.prompt ?? null],
    );
    if (inserted.rowCount === 0) {
      const existing = await this.pool.query<{ spec: unknown }>("SELECT spec FROM blueprint_revisions WHERE id = $1", [record.id]);
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

  async loadRooms(): Promise<RoomSessionRecord[]> {
    const sessions = await this.pool.query<RoomSessionRow>(
      `SELECT code, blueprint_id, players, reconnect_token_hashes, lobby_team_by_player,
              seed, checkpoint, checkpoint_checksum, checkpoint_revision
       FROM room_sessions
       ORDER BY created_at`,
    );
    const events = await this.pool.query<RoomEventRow>(
      `SELECT id, room_code, sequence, actor_id, actor_is_host, expected_revision,
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
      players: row.players,
      reconnectTokenHashes: row.reconnect_token_hashes,
      lobbyTeamByPlayer: row.lobby_team_by_player,
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
         code, blueprint_id, players, reconnect_token_hashes, lobby_team_by_player,
         seed, checkpoint, checkpoint_checksum, checkpoint_revision
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8, $9)
       ON CONFLICT (code) DO UPDATE SET
         players = EXCLUDED.players,
         reconnect_token_hashes = EXCLUDED.reconnect_token_hashes,
         lobby_team_by_player = EXCLUDED.lobby_team_by_player,
         seed = EXCLUDED.seed,
         checkpoint = EXCLUDED.checkpoint,
         checkpoint_checksum = EXCLUDED.checkpoint_checksum,
         checkpoint_revision = EXCLUDED.checkpoint_revision,
         updated_at = now()`,
      [
        record.code,
        record.blueprintId,
        JSON.stringify(record.players),
        JSON.stringify(record.reconnectTokenHashes),
        JSON.stringify(record.lobbyTeamByPlayer),
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
           id, room_code, sequence, actor_id, actor_is_host, expected_revision,
           resulting_revision, idempotency_key, action
         ) VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8, $9::jsonb)`,
        [
          event.id,
          event.roomCode,
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
           seed = $5,
           checkpoint = $6::jsonb,
           checkpoint_checksum = $7,
           checkpoint_revision = $8,
           updated_at = now()
         WHERE code = $1`,
        [
          record.code,
          JSON.stringify(record.players),
          JSON.stringify(record.reconnectTokenHashes),
          JSON.stringify(record.lobbyTeamByPlayer),
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
      `SELECT id, room_code, sequence, actor_id, actor_is_host, expected_revision,
              resulting_revision, idempotency_key, action
       FROM room_events
       WHERE room_code = $1 AND idempotency_key = $2`,
      [roomCode, idempotencyKey],
    );
    return result.rows[0] ? roomEventFromRow(result.rows[0]) : undefined;
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
