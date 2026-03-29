import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase } from "../src/storage/db.js";
import { insertChallenge, findChallenge, markChallengeUsed, cleanupExpiredChallenges } from "../src/storage/challenges.js";
import { insertTransaction, getTransactions } from "../src/storage/transactions.js";
import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-test.db";

describe("database", () => {
  let db: Database.Database;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("creates tables on init", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("transactions");
    expect(names).toContain("challenges");
    expect(names).toContain("schema_version");
  });
});

describe("challenges", () => {
  let db: Database.Database;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("inserts and finds a challenge", () => {
    insertChallenge(db, { nonce: "abc123", tool_name: "test-tool", amount_cents: 50, currency: "usd", protocol: "x402", expires_at: new Date(Date.now() + 300_000).toISOString() });
    const found = findChallenge(db, "abc123");
    expect(found).toBeTruthy();
    expect(found!.tool_name).toBe("test-tool");
    expect(found!.used).toBe(0);
  });
  it("rejects duplicate nonce", () => {
    const c = { nonce: "abc123", tool_name: "test-tool", amount_cents: 50, currency: "usd", protocol: "x402", expires_at: new Date(Date.now() + 300_000).toISOString() };
    insertChallenge(db, c);
    expect(() => insertChallenge(db, c)).toThrow();
  });
  it("marks challenge as used", () => {
    insertChallenge(db, { nonce: "abc123", tool_name: "test-tool", amount_cents: 50, currency: "usd", protocol: "x402", expires_at: new Date(Date.now() + 300_000).toISOString() });
    markChallengeUsed(db, "abc123");
    expect(findChallenge(db, "abc123")!.used).toBe(1);
  });
  it("cleans up expired challenges", () => {
    insertChallenge(db, { nonce: "old", tool_name: "t", amount_cents: 50, currency: "usd", protocol: "x402", expires_at: new Date(Date.now() - 3600_000).toISOString() });
    insertChallenge(db, { nonce: "new", tool_name: "t", amount_cents: 50, currency: "usd", protocol: "x402", expires_at: new Date(Date.now() + 300_000).toISOString() });
    cleanupExpiredChallenges(db);
    expect(findChallenge(db, "old")).toBeNull();
    expect(findChallenge(db, "new")).toBeTruthy();
  });
});

describe("transactions", () => {
  let db: Database.Database;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("inserts a transaction", () => {
    insertTransaction(db, { id: "tx-1", tool_name: "test-tool", amount_cents: 50, currency: "usd", protocol: "x402", payer_address: "0xABC", tx_hash: "0xDEF", nonce: "nonce-1", status: "verified" });
    const txs = getTransactions(db);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe("tx-1");
  });
  it("silently ignores duplicate nonce (INSERT OR IGNORE)", () => {
    const tx = { id: "tx-1", tool_name: "test-tool", amount_cents: 50, currency: "usd", protocol: "x402", payer_address: "0xABC", tx_hash: "0xDEF", nonce: "nonce-1", status: "verified" };
    insertTransaction(db, tx);
    insertTransaction(db, { ...tx, id: "tx-2" });
    const txs = getTransactions(db);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe("tx-1");
  });
});
