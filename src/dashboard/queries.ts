import type Database from "better-sqlite3";
import { fromCents } from "../types.js";

export interface OverviewStats { totalEarningsCents: number; totalEarningsDollars: number; totalTransactions: number; }
export interface TransactionListItem { id: string; tool_name: string; amount_cents: number; amount_dollars: number; currency: string; protocol: string; payer_address: string | null; tx_hash: string | null; status: string; created_at: string; }
export interface ToolStats { tool_name: string; total_cents: number; total_dollars: number; call_count: number; avg_cents: number; }
export interface ListOptions { limit: number; offset: number; status?: string; }

export function getOverviewStats(db: Database.Database): OverviewStats {
  const row = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count FROM transactions WHERE status = 'verified'").get() as { total: number; count: number };
  return { totalEarningsCents: row.total, totalEarningsDollars: fromCents(row.total), totalTransactions: row.count };
}

export function getTransactionList(db: Database.Database, options: ListOptions): TransactionListItem[] {
  let sql = "SELECT id, tool_name, amount_cents, currency, protocol, payer_address, tx_hash, status, created_at FROM transactions";
  const params: unknown[] = [];
  if (options.status) { sql += " WHERE status = ?"; params.push(options.status); }
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(options.limit, options.offset);
  const rows = db.prepare(sql).all(...params) as Array<any>;
  return rows.map(row => ({ ...row, amount_dollars: fromCents(row.amount_cents) }));
}

export function getPerToolStats(db: Database.Database): ToolStats[] {
  const rows = db.prepare("SELECT tool_name, SUM(amount_cents) as total_cents, COUNT(*) as call_count FROM transactions WHERE status = 'verified' GROUP BY tool_name ORDER BY total_cents DESC").all() as Array<any>;
  return rows.map(row => ({ ...row, total_dollars: fromCents(row.total_cents), avg_cents: Math.round(row.total_cents / row.call_count) }));
}
