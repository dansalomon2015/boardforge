import { describe, expect, it } from "vitest";
import { issueReconnectToken, reconnectTokenMatches } from "./session-token";

describe("reconnect tokens", () => {
  it("stores a hash and verifies only the issued token", () => {
    const issued = issueReconnectToken();
    expect(issued.token).not.toBe(issued.hash);
    expect(issued.token.length).toBeGreaterThanOrEqual(40);
    expect(reconnectTokenMatches(issued.token, issued.hash)).toBe(true);
    expect(reconnectTokenMatches(`${issued.token}x`, issued.hash)).toBe(false);
  });

  it("issues unique credentials", () => {
    const first = issueReconnectToken();
    const second = issueReconnectToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(second.hash);
  });
});
