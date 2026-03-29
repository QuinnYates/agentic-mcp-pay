import type Database from "better-sqlite3";

export interface ChallengeRow { nonce: string; tool_name: string; amount_cents: number; currency: string; protocol: string; expires_at: string; created_at: string; used: number; }
export interface InsertChallenge { nonce: string; tool_name: string; amount_cents: number; currency: string; protocol: string; expires_at: string; }

export function insertChallenge(db: Database.Database, challenge: InsertChallenge): void {
  db.prepare(`INSERT INTO challenges (nonce, tool_name, amount_cents, currency, protocol, expires_at) VALUES (@nonce, @tool_name, @amount_cents, @currency, @protocol, @expires_at)`).run(challenge);
}
export function findChallenge(db: Database.Database, nonce: string): ChallengeRow | null {
  return (db.prepare("SELECT * FROM challenges WHERE nonce = ?").get(nonce) as ChallengeRow | undefined) ?? null;
}
export function markChallengeUsed(db: Database.Database, nonce: string): void {
  db.prepare("UPDATE challenges SET used = 1 WHERE nonce = ?").run(nonce);
}
export function cleanupExpiredChallenges(db: Database.Database): void {
  db.prepare("DELETE FROM challenges WHERE datetime(expires_at) < datetime('now')").run();
}
