import type Database from "better-sqlite3";

export interface TransactionRow { id: string; tool_name: string; amount_cents: number; currency: string; protocol: string; payer_address: string | null; tx_hash: string | null; nonce: string; status: string; created_at: string; }
export interface InsertTransaction { id: string; tool_name: string; amount_cents: number; currency: string; protocol: string; payer_address: string | null; tx_hash: string | null; nonce: string; status: string; }

export function insertTransaction(db: Database.Database, tx: InsertTransaction): void {
  db.prepare(`INSERT OR IGNORE INTO transactions (id, tool_name, amount_cents, currency, protocol, payer_address, tx_hash, nonce, status) VALUES (@id, @tool_name, @amount_cents, @currency, @protocol, @payer_address, @tx_hash, @nonce, @status)`).run(tx);
}
export function getTransactions(db: Database.Database, limit = 100): TransactionRow[] {
  return db.prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?").all(limit) as TransactionRow[];
}
