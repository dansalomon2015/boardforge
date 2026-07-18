import { z } from "zod";

const gameNightCodeSchema = z
  .string()
  .trim()
  .length(6)
  .transform((value) => value.toUpperCase());

export const gameNightCredentialsSchema = z
  .object({
    playerId: z.string().uuid(),
    reconnectToken: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
  })
  .strict();

export const gameNightSocketSessionSchema = gameNightCredentialsSchema.extend({ code: gameNightCodeSchema }).strict();

export const gameNightSocketTeamSelectionSchema = z
  .object({
    code: gameNightCodeSchema,
    playerId: z.string().uuid(),
    teamId: z.string().min(1).max(80),
  })
  .strict();

export const gameNightSocketBoardOpenSchema = z
  .object({
    code: gameNightCodeSchema,
    playerId: z.string().uuid(),
  })
  .strict();

export const gameNightSocketGameSelectionSchema = z
  .object({
    code: gameNightCodeSchema,
    playerId: z.string().uuid(),
    blueprintId: z.string().trim().min(1).max(160),
  })
  .strict();

export const gameNightSocketCaptainSelectionSchema = z
  .object({
    code: gameNightCodeSchema,
    playerId: z.string().uuid(),
    teamId: z.string().min(1).max(80),
    captainPlayerId: z.string().uuid(),
  })
  .strict();

export const gameNightSocketGameLaunchSchema = z
  .object({
    code: gameNightCodeSchema,
    playerId: z.string().uuid(),
    blueprintId: z.string().trim().min(1).max(160),
  })
  .strict();

const gameNightTeamSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    playerIds: z.array(z.string().uuid()),
    captainPlayerId: z.string().uuid().optional(),
  })
  .strict();

const gameNightWinnerSchema = z
  .object({
    kind: z.enum(["players", "teams", "none"]),
    ids: z.array(z.string().min(1).max(80)),
  })
  .strict();

const gameNightCompletedGameSchema = z
  .object({
    gameInstanceId: z.string().uuid(),
    blueprintId: z.string().min(1).max(160),
    resultIdempotencyKey: z.string().min(1).max(160),
    winner: gameNightWinnerSchema,
    awardedTeamIds: z.array(z.string().min(1).max(80)),
    scoreEventIds: z.array(z.string().min(1).max(240)),
  })
  .strict();

const gameNightScoreEventSchema = z
  .object({
    id: z.string().min(1).max(240),
    gameInstanceId: z.string().uuid(),
    teamId: z.string().min(1).max(80),
    points: z.number().int().min(0).max(100),
    reason: z.enum(["win", "tie"]),
  })
  .strict();

const gameNightStateSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["lobby", "playing", "completed"]),
    selectedBlueprintId: z.string().min(1).max(160).nullable().default(null),
    teams: z.array(gameNightTeamSchema).min(2).max(12),
    scores: z.record(z.string(), z.number().int().min(0)),
    completedGames: z.array(gameNightCompletedGameSchema).max(100),
    scoreEvents: z.array(gameNightScoreEventSchema).max(1_200),
  })
  .strict();

export const gameNightSessionSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
    hostPlayerId: z.string().uuid(),
    players: z.array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(40),
          isHost: z.boolean(),
          connected: z.boolean(),
        })
        .strict(),
    ),
    reconnectTokenHashes: z.record(z.string().uuid(), z.string().min(20).max(160)),
    state: gameNightStateSchema,
    currentRoomCode: z
      .string()
      .regex(/^[A-Z2-9]{6}$/)
      .nullable(),
  })
  .strict();
