import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function issueReconnectToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashReconnectToken(token) };
}

export function hashReconnectToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function reconnectTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashReconnectToken(token), "base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
