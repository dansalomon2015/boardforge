import type { BoardGameSpec } from "@boardforge/game-spec";
import type { GameSummary } from "@boardforge/shared";

export function gameSummary(spec: BoardGameSpec): GameSummary {
  return {
    template: spec.template,
    title: spec.title,
    description: spec.description,
    minPlayers: spec.minPlayers,
    maxPlayers: spec.maxPlayers,
    durationMinutes: spec.template === "composed" ? (spec.suggestedDurationMinutes ?? 15) : spec.durationMinutes,
    accent: spec.template === "composed" ? (typeof spec.theme === "string" ? spec.theme : "violet") : spec.accent,
    ...(spec.template === "composed" ? { experienceId: spec.experienceId } : {}),
  };
}

export function gamePreview(spec: BoardGameSpec) {
  if (spec.template === "composed") {
    return {
      kind: spec.template,
      theme: spec.theme,
      phases: spec.phases.map((phase) => ({ id: phase.id, title: phase.title })),
      components: [...new Set(spec.components.map((component) => component.kind))],
      actions: spec.actions.map((action) => ({ id: action.id, label: action.label, kind: action.kind })),
    };
  }
  if (spec.template === "hidden_roles") {
    return {
      kind: spec.template,
      rounds: spec.rounds,
      roles: spec.roles.map((role) => ({ name: role.name, team: role.team })),
      missionPrompt: spec.missionPrompt,
    };
  }

  return {
    kind: spec.template,
    answerSeconds: spec.answerSeconds,
    questions: spec.questions.map((question) => ({ type: question.type, prompt: question.prompt })),
  };
}
