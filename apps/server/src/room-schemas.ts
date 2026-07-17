import { z } from "zod";

export const roomBodySchema = z
  .object({
    blueprintId: z.string().trim().min(1).optional(),
    template: z.enum(["hidden_roles", "quiz_vote", "composed"]).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.blueprintId || value.template), {
    message: "blueprintId or template is required",
  });

export const joinSchema = z
  .object({
    code: z
      .string()
      .trim()
      .length(6)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(24),
    playerId: z.string().uuid().optional(),
    reconnectToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{40,64}$/)
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.playerId) === Boolean(value.reconnectToken), {
    message: "playerId and reconnectToken must be provided together",
  });

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SUBMIT_MISSION"), choice: z.enum(["success", "sabotage"]) }).strict(),
  z.object({ type: z.literal("CAST_VOTE"), targetPlayerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("SUBMIT_ANSWER"), optionId: z.string().min(1).max(48) }).strict(),
  z.object({ type: z.literal("CAST_PLAYER_VOTE"), targetPlayerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("ADVANCE") }).strict(),
  z
    .object({
      type: z.literal("COMPOSED_ACTION"),
      actionId: z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/)
        .max(48),
      payload: z
        .object({
          choiceId: z.string().max(48).optional(),
          text: z.string().max(600).optional(),
          cardId: z.string().max(48).optional(),
          tokenId: z.string().max(96).optional(),
          spaceId: z.string().max(48).optional(),
          orderedIds: z.array(z.string().max(48)).max(24).optional(),
          pairs: z
            .array(z.object({ leftId: z.string().max(48), rightId: z.string().max(48) }).strict())
            .max(12)
            .optional(),
          targetPlayerId: z.string().uuid().optional(),
          stroke: z
            .object({
              id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
              points: z
                .array(z.object({ x: z.number().min(0).max(600), y: z.number().min(0).max(340) }).strict())
                .min(2)
                .max(160),
            })
            .strict()
            .optional(),
          clear: z.boolean().optional(),
          elapsedMs: z.number().int().min(100).max(30_000).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);

export const actionEnvelopeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .length(6)
      .transform((value) => value.toUpperCase()),
    playerId: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    action: actionSchema,
  })
  .strict();

export const persistedPlayersSchema = z
  .array(
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(24),
        isHost: z.boolean(),
        connected: z.boolean(),
      })
      .strict(),
  )
  .max(12);

export const persistedStringMapSchema = z.record(z.string(), z.string());

export const persistedEventSchema = z
  .object({
    id: z.string().uuid(),
    roomCode: z.string().regex(/^[A-Z2-9]{6}$/),
    createdAt: z.string().datetime(),
    sequence: z.number().int().positive(),
    actorId: z.string().uuid(),
    actorIsHost: z.boolean(),
    expectedRevision: z.number().int().positive(),
    resultingRevision: z.number().int().positive(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    action: actionSchema,
  })
  .strict();

export const teamSelectionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .length(6)
      .transform((value) => value.toUpperCase()),
    playerId: z.string().uuid(),
    teamId: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(48),
  })
  .strict();

export const captainSelectionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .length(6)
      .transform((value) => value.toUpperCase()),
    playerId: z.string().uuid(),
    teamId: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(48),
    captainPlayerId: z.string().uuid(),
  })
  .strict();
