export type StoredGameNightSession = {
  playerId: string;
  reconnectToken: string;
  name: string;
};

function key(gameNightId: string, field: keyof StoredGameNightSession): string {
  return `boardforge:game-night:${gameNightId}:${field}`;
}

export function saveGameNightSession(gameNightId: string, session: StoredGameNightSession): void {
  localStorage.setItem(key(gameNightId, "playerId"), session.playerId);
  localStorage.setItem(key(gameNightId, "reconnectToken"), session.reconnectToken);
  localStorage.setItem(key(gameNightId, "name"), session.name);
}

export function readGameNightSession(gameNightId: string): StoredGameNightSession | null {
  const playerId = localStorage.getItem(key(gameNightId, "playerId"));
  const reconnectToken = localStorage.getItem(key(gameNightId, "reconnectToken"));
  const name = localStorage.getItem(key(gameNightId, "name"));
  return playerId && reconnectToken && name ? { playerId, reconnectToken, name } : null;
}

export function clearGameNightSession(gameNightId: string): void {
  localStorage.removeItem(key(gameNightId, "playerId"));
  localStorage.removeItem(key(gameNightId, "reconnectToken"));
  localStorage.removeItem(key(gameNightId, "name"));
}
