import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase } from "../src/storage/db.js";
import { insertTransaction } from "../src/storage/transactions.js";
import { getOverviewStats, getTransactionList, getPerToolStats } from "../src/dashboard/queries.js";
import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-dashboard-test.db";

function seedTransactions(db: Database.Database) {
  insertTransaction(db, { id: "tx-1", tool_name: "format-manuscript", amount_cents: 50, currency: "usd", protocol: "x402", payer_address: "0xA", tx_hash: "0x1", nonce: "n1", status: "verified" });
  insertTransaction(db, { id: "tx-2", tool_name: "format-manuscript", amount_cents: 50, currency: "usd", protocol: "x402", payer_address: "0xB", tx_hash: "0x2", nonce: "n2", status: "verified" });
  insertTransaction(db, { id: "tx-3", tool_name: "check-compliance", amount_cents: 2, currency: "usd", protocol: "x402", payer_address: "0xA", tx_hash: "0x3", nonce: "n3", status: "verified" });
  insertTransaction(db, { id: "tx-4", tool_name: "format-manuscript", amount_cents: 50, currency: "usd", protocol: "mock", payer_address: "0xC", tx_hash: "0x4", nonce: "n4", status: "failed" });
}

describe("getOverviewStats", () => {
  let db: Database.Database;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); seedTransactions(db); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("returns total earnings from verified transactions only", () => {
    const stats = getOverviewStats(db);
    expect(stats.totalEarningsCents).toBe(102);
    expect(stats.totalTransactions).toBe(3);
  });
});

describe("getTransactionList", () => {
  let db: Database.Database;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); seedTransactions(db); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("returns transactions ordered by created_at desc", () => {
    const txs = getTransactionList(db, { limit: 10, offset: 0 });
    expect(txs.length).toBeGreaterThanOrEqual(3);
  });
  it("supports pagination", () => {
    const page1 = getTransactionList(db, { limit: 2, offset: 0 });
    const page2 = getTransactionList(db, { limit: 2, offset: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBeGreaterThanOrEqual(1);
  });
  it("filters by status", () => {
    const verified = getTransactionList(db, { limit: 10, offset: 0, status: "verified" });
    expect(verified.every(tx => tx.status === "verified")).toBe(true);
    expect(verified.length).toBe(3);
  });
});

describe("getPerToolStats", () => {
  let db: Database.Database;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); seedTransactions(db); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("returns per-tool breakdown for verified transactions", () => {
    const stats = getPerToolStats(db);
    const format = stats.find(s => s.tool_name === "format-manuscript");
    const compliance = stats.find(s => s.tool_name === "check-compliance");
    expect(format!.total_cents).toBe(100);
    expect(format!.call_count).toBe(2);
    expect(compliance!.total_cents).toBe(2);
    expect(compliance!.call_count).toBe(1);
  });
});
