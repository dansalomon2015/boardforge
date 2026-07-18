import { describe, expect, it } from "vitest";
import { synchronizedRemainingSeconds } from "./turn-timer-state";

describe("synchronizedRemainingSeconds", () => {
  const timer = {
    phaseVisit: 4,
    deadlineAt: 70_000,
    serverNow: 10_000,
    totalSeconds: 60,
  };

  it("uses the server delta instead of the client wall clock", () => {
    expect(synchronizedRemainingSeconds(timer, 2_000_000, 2_000_000)).toBe(60);
    expect(synchronizedRemainingSeconds(timer, 2_000_000, 2_029_001)).toBe(31);
  });

  it("never displays a negative countdown", () => {
    expect(synchronizedRemainingSeconds(timer, 2_000_000, 2_061_000)).toBe(0);
  });
});
