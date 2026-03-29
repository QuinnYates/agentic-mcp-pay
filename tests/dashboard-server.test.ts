import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDashboardServer } from "../src/dashboard/server.js";
import { createDatabase } from "../src/storage/db.js";
import { insertTransaction } from "../src/storage/transactions.js";
import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-dashboard-server-test.db";
const TOKEN = "test-token-abc";

function seedData(db: Database.Database) {
  insertTransaction(db, { id: "tx-1", tool_name: "my-tool", amount_cents: 50, currency: "usd", protocol: "x402", payer_address: "0xA", tx_hash: "0x1", nonce: "n1", status: "verified" });
  insertTransaction(db, { id: "tx-2", tool_name: "my-tool", amount_cents: 100, currency: "usd", protocol: "x402", payer_address: "0xB", tx_hash: "0x2", nonce: "n2", status: "verified" });
}

async function makeRequest(app: any, path: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      fetch(`http://127.0.0.1:${addr.port}${path}`).then(resolve).catch(reject).finally(() => server.close());
    });
  });
}

describe("dashboard server", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createDashboardServer>;

  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); db = createDatabase(TEST_DB); seedData(db); app = createDashboardServer(db, TOKEN); });
  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it("rejects requests without token", async () => {
    const res = await makeRequest(app, "/");
    expect(res.status).toBe(401);
  });

  it("serves overview page with valid token", async () => {
    const res = await makeRequest(app, `/?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("$1.50");
    expect(text).toContain("2");
  });

  it("serves transactions page", async () => {
    const res = await makeRequest(app, `/transactions?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("my-tool");
  });

  it("serves per-tool page", async () => {
    const res = await makeRequest(app, `/tools?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("my-tool");
  });

  it("returns JSON for /api/overview", async () => {
    const res = await makeRequest(app, `/api/overview?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalEarningsCents).toBe(150);
    expect(data.totalTransactions).toBe(2);
  });
});
