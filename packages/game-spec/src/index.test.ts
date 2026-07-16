import { describe, expect, it } from "vitest";
import { partyPulseSpec, spaceHeistSpec, validateGameSpec } from "./index";

describe("GameSpec validation", () => {
  it("accepts both built-in demo specs", () => {
    expect(validateGameSpec(spaceHeistSpec).ok).toBe(true);
    expect(validateGameSpec(partyPulseSpec).ok).toBe(true);
    expect(spaceHeistSpec.minPlayers).toBe(2);
    expect(partyPulseSpec.minPlayers).toBe(2);
  });

  it("rejects a trivia answer that does not reference an option", () => {
    const broken = structuredClone(partyPulseSpec);
    const question = broken.questions[0];
    if (question?.type === "trivia") {
      question.correctOptionId = "missing";
    }

    const result = validateGameSpec(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "UNKNOWN_CORRECT_OPTION")).toBe(true);
    }
  });

  it("rejects unknown executable-looking fields", () => {
    const result = validateGameSpec({ ...spaceHeistSpec, script: "eval('no')" });
    expect(result.ok).toBe(false);
  });
});
