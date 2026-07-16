import { z } from "zod";
import {
  validateComposedGameSpec,
  type ComposedGameSpec,
  type Effect,
} from "./composed";

const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/).max(48);
const effectOwnerSchema = z.enum(["action", "rule", "phase"]);

const effectTargetFields = {
  owner: effectOwnerSchema,
  ownerId: idSchema,
  effectIndex: z.number().int().min(0).max(11),
};

export const composedBalanceChangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set_duration"),
      minutes: z.number().int().min(2).max(180),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_timer_seconds"),
      componentId: idSchema,
      seconds: z.number().int().min(5).max(900),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_effect_amount"),
      ...effectTargetFields,
      amount: z.number().int().min(-100).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_draw_count"),
      ...effectTargetFields,
      count: z.number().int().min(1).max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_resource_initial"),
      resourceId: idSchema,
      initialValue: z.number().int().min(-1000).max(1000),
    })
    .strict(),
]);

export const composedBalancePatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceSpecId: idSchema,
    summary: z.string().trim().min(8).max(300),
    changes: z.array(composedBalanceChangeSchema).min(1).max(8),
  })
  .strict();

export type ComposedBalanceChange = z.infer<typeof composedBalanceChangeSchema>;
export type ComposedBalancePatch = z.infer<typeof composedBalancePatchSchema>;

export type BalancePatchIssue = {
  code: string;
  path: string;
  message: string;
};

export type BalancePatchApplication =
  | { ok: true; spec: ComposedGameSpec; patch: ComposedBalancePatch }
  | { ok: false; issues: BalancePatchIssue[] };

function changeTarget(change: ComposedBalanceChange): string {
  if (change.kind === "set_duration") return change.kind;
  if (change.kind === "set_timer_seconds") return `${change.kind}:${change.componentId}`;
  if (change.kind === "set_resource_initial") return `${change.kind}:${change.resourceId}`;
  return `${change.kind}:${change.owner}:${change.ownerId}:${change.effectIndex}`;
}

function findEffects(
  spec: ComposedGameSpec,
  owner: "action" | "rule" | "phase",
  ownerId: string,
): Effect[] | undefined {
  if (owner === "action") return spec.actions.find((action) => action.id === ownerId)?.effects;
  if (owner === "rule") return spec.rules.find((rule) => rule.id === ownerId)?.effects;
  return spec.phases.find((phase) => phase.id === ownerId)?.onComplete;
}

export function applyComposedBalancePatch(
  source: ComposedGameSpec,
  input: unknown,
  derivedSpecId: string,
): BalancePatchApplication {
  const parsed = composedBalancePatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "PATCH_SCHEMA_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const derivedId = idSchema.safeParse(derivedSpecId);
  if (!derivedId.success) {
    return {
      ok: false,
      issues: [{ code: "DERIVED_ID_INVALID", path: "id", message: "The derived GameSpec ID is invalid." }],
    };
  }

  const patch = parsed.data;
  const issues: BalancePatchIssue[] = [];
  if (patch.sourceSpecId !== source.id) {
    issues.push({
      code: "SOURCE_SPEC_MISMATCH",
      path: "sourceSpecId",
      message: `Patch targets ${patch.sourceSpecId}, not ${source.id}.`,
    });
  }

  const targets = patch.changes.map(changeTarget);
  const duplicateTargets = [...new Set(targets.filter((target, index) => targets.indexOf(target) !== index))];
  for (const target of duplicateTargets) {
    issues.push({
      code: "DUPLICATE_PATCH_TARGET",
      path: "changes",
      message: `A balance patch may only change ${target} once.`,
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  const spec = structuredClone(source);
  spec.id = derivedId.data;

  patch.changes.forEach((change, index) => {
    const path = `changes.${index}`;
    if (change.kind === "set_duration") {
      spec.suggestedDurationMinutes = change.minutes;
      return;
    }

    if (change.kind === "set_timer_seconds") {
      const component = spec.components.find((candidate) => candidate.id === change.componentId);
      if (!component) {
        issues.push({ code: "PATCH_TARGET_NOT_FOUND", path, message: `Unknown component: ${change.componentId}.` });
      } else if (component.kind !== "timer") {
        issues.push({ code: "PATCH_TARGET_KIND_INVALID", path, message: `${change.componentId} is not a timer component.` });
      } else {
        component.seconds = change.seconds;
      }
      return;
    }

    if (change.kind === "set_resource_initial") {
      const resource = spec.resources.find((candidate) => candidate.id === change.resourceId);
      if (!resource) {
        issues.push({ code: "PATCH_TARGET_NOT_FOUND", path, message: `Unknown resource: ${change.resourceId}.` });
      } else if (change.initialValue < resource.min || change.initialValue > resource.max) {
        issues.push({
          code: "PATCH_VALUE_OUTSIDE_RESOURCE_RANGE",
          path,
          message: `${change.initialValue} is outside the resource range ${resource.min}..${resource.max}.`,
        });
      } else {
        resource.initialValue = change.initialValue;
      }
      return;
    }

    const effects = findEffects(spec, change.owner, change.ownerId);
    const effect = effects?.[change.effectIndex];
    if (!effects) {
      issues.push({
        code: "PATCH_TARGET_NOT_FOUND",
        path,
        message: `Unknown ${change.owner}: ${change.ownerId}.`,
      });
    } else if (!effect) {
      issues.push({
        code: "PATCH_EFFECT_NOT_FOUND",
        path,
        message: `Effect ${change.effectIndex} does not exist on ${change.owner} ${change.ownerId}.`,
      });
    } else if (change.kind === "set_effect_amount") {
      if (effect.kind !== "add_score" && effect.kind !== "add_resource") {
        issues.push({
          code: "PATCH_TARGET_KIND_INVALID",
          path,
          message: `Effect ${change.effectIndex} does not expose an adjustable amount.`,
        });
      } else {
        effect.amount = change.amount;
      }
    } else if (effect.kind !== "draw_cards") {
      issues.push({
        code: "PATCH_TARGET_KIND_INVALID",
        path,
        message: `Effect ${change.effectIndex} is not a draw_cards effect.`,
      });
    } else {
      effect.count = change.count;
    }
  });

  if (issues.length > 0) return { ok: false, issues };

  const validation = validateComposedGameSpec(spec);
  if (!validation.ok) {
    return {
      ok: false,
      issues: validation.issues.map((issue) => ({
        code: `PATCH_RESULT_${issue.code}`,
        path: issue.path,
        message: issue.message,
      })),
    };
  }
  return { ok: true, spec: validation.spec, patch };
}
