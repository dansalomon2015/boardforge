import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applyComposedBalancePatch } from "@boardforge/game-spec";
import { runComposedPlaytest } from "@boardforge/game-engine";
import type { ComposedBalanceEvidence, GameReviewProvider } from "@boardforge/llm";
import type { BalancePatchRecord, BalanceWorkflowStore, BlueprintRecord } from "./persistence";
import { gamePreview, gameSummary } from "./game-catalog";
import { aiProviderErrorMessage } from "./provider-error";

type BalanceRouteDependencies = {
  llm: GameReviewProvider;
  blueprintStore: BalanceWorkflowStore;
};

function balanceEvidence(report: ReturnType<typeof runComposedPlaytest>): ComposedBalanceEvidence {
  return {
    simulations: report.simulations,
    completionRate: report.completionRate,
    averageActions: report.averageActions,
    failures: report.failures.map((failure) => ({ code: failure.code, evidence: failure.evidence })),
  };
}

async function revisionFamily(
  blueprintStore: BalanceWorkflowStore,
  startBlueprintId: string,
): Promise<{ blueprints: BlueprintRecord[]; patches: BalancePatchRecord[] }> {
  const blueprints = new Map<string, BlueprintRecord>();
  const patches = new Map<string, BalancePatchRecord>();
  const queue = [startBlueprintId];
  const queued = new Set(queue);

  while (queue.length > 0 && blueprints.size < 50) {
    const blueprintId = queue.shift()!;
    const blueprint = await blueprintStore.get(blueprintId);
    if (blueprint) blueprints.set(blueprintId, blueprint);
    const related = await blueprintStore.listBalancePatchesForBlueprint(blueprintId);
    for (const patch of related) {
      patches.set(patch.id, patch);
      for (const linkedId of [patch.sourceBlueprintId, patch.derivedBlueprintId]) {
        if (!queued.has(linkedId)) {
          queued.add(linkedId);
          queue.push(linkedId);
        }
      }
    }
  }

  return { blueprints: [...blueprints.values()], patches: [...patches.values()] };
}

function orderedRevisionFamily(blueprints: BlueprintRecord[], patches: BalancePatchRecord[]): BlueprintRecord[] {
  const byId = new Map(blueprints.map((blueprint) => [blueprint.id, blueprint]));
  const derivedIds = new Set(patches.map((patch) => patch.derivedBlueprintId));
  const roots = blueprints
    .filter((blueprint) => !derivedIds.has(blueprint.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const outgoing = new Map<string, BalancePatchRecord[]>();
  for (const patch of patches) {
    const list = outgoing.get(patch.sourceBlueprintId) ?? [];
    list.push(patch);
    outgoing.set(patch.sourceBlueprintId, list);
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const ordered: BlueprintRecord[] = [];
  const visited = new Set<string>();
  const visit = (blueprint: BlueprintRecord) => {
    if (visited.has(blueprint.id)) return;
    visited.add(blueprint.id);
    ordered.push(blueprint);
    for (const patch of outgoing.get(blueprint.id) ?? []) {
      const derived = byId.get(patch.derivedBlueprintId);
      if (derived) visit(derived);
    }
  };
  roots.forEach(visit);
  blueprints.sort((a, b) => a.id.localeCompare(b.id)).forEach(visit);
  return ordered;
}

export function registerBalanceRoutes(app: FastifyInstance, { llm, blueprintStore }: BalanceRouteDependencies): void {
  const balanceParamsSchema = z.object({ id: z.string().trim().min(1).max(120) }).strict();

  app.get<{ Params: { id: string } }>("/api/blueprints/:id/history", async (request, reply) => {
    const params = balanceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid blueprint ID." });
    const selected = await blueprintStore.get(params.data.id);
    if (!selected) return reply.code(404).send({ error: "Game blueprint not found." });

    const family = await revisionFamily(blueprintStore, selected.id);
    const ordered = orderedRevisionFamily(family.blueprints, family.patches);
    const incoming = new Map(family.patches.map((patch) => [patch.derivedBlueprintId, patch]));
    return {
      selectedBlueprintId: selected.id,
      revisions: ordered.map((blueprint, index) => {
        const patch = incoming.get(blueprint.id);
        return {
          revision: index + 1,
          blueprintId: blueprint.id,
          ...(patch
            ? {
                parentBlueprintId: patch.sourceBlueprintId,
                patch: {
                  id: patch.id,
                  status: patch.status,
                  summary: patch.patch.summary,
                  changes: patch.patch.changes,
                },
              }
            : {}),
          releaseStatus: blueprint.status,
          canSelect: blueprint.status === "release_ready",
          game: gameSummary(blueprint.spec),
          preview: gamePreview(blueprint.spec),
          playtest: blueprint.playtest,
          critique: blueprint.critique,
          balanceSuggestionAvailable: Boolean(blueprint.suggestedPatch),
        };
      }),
    };
  });

  app.post<{ Params: { id: string } }>("/api/blueprints/:id/balance", async (request, reply) => {
    const params = balanceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid blueprint ID." });

    const source = await blueprintStore.get(params.data.id);
    if (!source) return reply.code(404).send({ error: "Game blueprint not found." });
    if (source.spec.template !== "composed") {
      return reply.code(409).send({ error: "Only composed games support the constrained balance workflow." });
    }
    if (!source.playtest) {
      return reply.code(409).send({ error: "The source blueprint must complete its initial playtest first." });
    }
    if (!source.critique) {
      return reply.code(409).send({ error: "The source blueprint must complete its structured AI critique first." });
    }

    try {
      const patchSource = source.suggestedPatch ? "precomputed_review" : "live_fallback";
      const patch =
        source.suggestedPatch ??
        (await llm.proposeComposedBalancePatch(source.spec, balanceEvidence(source.playtest), source.critique));
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
      const derivedSpecId = `${source.spec.id.slice(0, 32).replace(/_+$/, "")}_balanced_${suffix}`;
      const applied = applyComposedBalancePatch(source.spec, patch, derivedSpecId);
      if (!applied.ok) {
        app.log.warn({ issues: applied.issues }, "LLM balance patch rejected at the GameSpec boundary");
        return reply.code(422).send({
          error: "The proposed balance patch was rejected by the strict validator.",
          issues: applied.issues,
        });
      }

      const balancePatchId = crypto.randomUUID();
      const derivedBlueprintId = `${applied.spec.id}-${crypto.randomUUID().slice(0, 8)}`;
      await blueprintStore.saveBlueprint({
        id: derivedBlueprintId,
        spec: applied.spec,
        status: "validating",
        provider: llm.name,
        ...(source.prompt ? { prompt: source.prompt } : {}),
      });
      const afterReport = runComposedPlaytest(applied.spec, {
        simulations: source.playtest.simulations,
        seed: `balance:${balancePatchId}`,
      });
      const afterCritique = await llm.critiqueComposedGameSpec(applied.spec, balanceEvidence(afterReport));
      const derivedStatus =
        afterReport.status === "passed" && afterCritique.verdict === "release_ready" ? "validating" : "needs_review";
      await blueprintStore.savePlaytest(derivedBlueprintId, derivedStatus, afterReport);
      await blueprintStore.saveCritique(derivedBlueprintId, llm.name, afterCritique);
      await blueprintStore.saveBalancePatch({
        id: balancePatchId,
        sourceBlueprintId: source.id,
        derivedBlueprintId,
        provider: llm.name,
        patch: applied.patch,
        beforeReport: source.playtest,
        afterReport,
        status: "proposed",
      });

      return {
        balancePatchId,
        status: "proposed",
        sourceBlueprintId: source.id,
        derivedBlueprintId,
        patch: applied.patch,
        before: source.playtest,
        beforeCritique: source.critique,
        after: afterReport,
        afterCritique,
        optimization: { patchSource },
        derived: {
          game: gameSummary(applied.spec),
          preview: gamePreview(applied.spec),
          releaseStatus: derivedStatus === "validating" ? "awaiting_acceptance" : "needs_review",
        },
      };
    } catch (error) {
      app.log.warn(
        { message: error instanceof Error ? error.message : "Unknown balance error" },
        "Balance workflow failed",
      );
      return reply.code(502).send({ error: aiProviderErrorMessage(error), provider: llm.name });
    }
  });

  const balancePatchParamsSchema = z.object({ id: z.string().uuid() }).strict();

  app.post<{ Params: { id: string } }>("/api/balance-patches/:id/accept", async (request, reply) => {
    const params = balancePatchParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid balance patch ID." });
    try {
      const patch = await blueprintStore.acceptBalancePatch(params.data.id);
      const blueprint = await blueprintStore.get(patch.derivedBlueprintId);
      if (!blueprint) return reply.code(500).send({ error: "Accepted blueprint could not be loaded." });
      return {
        balancePatchId: patch.id,
        status: patch.status,
        blueprintId: blueprint.id,
        releaseStatus: blueprint.status,
        game: gameSummary(blueprint.spec),
        preview: gamePreview(blueprint.spec),
        playtest: patch.afterReport,
        critique: blueprint.critique,
        balanceSuggestionAvailable: Boolean(blueprint.suggestedPatch),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Balance patch acceptance failed.";
      return reply.code(message.includes("Unknown balance patch") ? 404 : 409).send({ error: message });
    }
  });

  app.post<{ Params: { id: string } }>("/api/balance-patches/:id/reject", async (request, reply) => {
    const params = balancePatchParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid balance patch ID." });
    try {
      const patch = await blueprintStore.rejectBalancePatch(params.data.id);
      return {
        balancePatchId: patch.id,
        status: patch.status,
        sourceBlueprintId: patch.sourceBlueprintId,
        derivedBlueprintId: patch.derivedBlueprintId,
        releaseStatus: "needs_review",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Balance patch rejection failed.";
      return reply.code(message.includes("Unknown balance patch") ? 404 : 409).send({ error: message });
    }
  });
}
