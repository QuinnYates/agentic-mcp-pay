# mcp-pay M2 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional embedded dashboard to mcp-pay that shows earnings, transactions, and per-tool breakdowns — served on localhost with bearer token auth.

**Architecture:** Express server bound to 127.0.0.1, reading from the existing SQLite transactions database (read-only queries). Server-rendered HTML (no frontend framework). Dashboard starts when `dashboard: { port: 3100 }` is passed to `withPayments()`. Bearer token generated on startup, printed to stdout, required as `?token=` on all requests.

**Tech Stack:** Express, existing better-sqlite3, server-rendered HTML with inline CSS

**Spec:** `docs/superpowers/specs/2026-03-25-mcp-payment-gateway-design.md` (Dashboard section)

---

## File Map

| File | Responsibility |
|---|---|
| `src/dashboard/queries.ts` | Read-only SQLite queries for dashboard data (totals, transactions, per-tool stats) |
| `src/dashboard/server.ts` | Express server setup, routes, auth middleware, HTML rendering |
| `src/dashboard/auth.ts` | Bearer token generation and validation middleware |
| `src/index.ts` | Modify: start dashboard when config.dashboard is set |
| `tests/dashboard-queries.test.ts` | Query logic tests |
| `tests/dashboard-server.test.ts` | HTTP endpoint tests |

---

## Task 1: Install Express

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install express**

```bash
cd /Users/yeqy1/Projects/mcp-pay
npm install express
npm install -D @types/express
```

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express dependency for dashboard"
```

---

## Task 2: Dashboard Queries

**Files:**
- Create: `src/dashboard/queries.ts`
- Create: `tests/dashboard-queries.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/dashboard-queries.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase } from "../src/storage/db.js";
import { insertTransaction } from "../src/storage/transactions.js";
import {
  getOverviewStats,
  getTransactionList,
  getPerToolStats,
} from "../src/dashboard/queries.js";
import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-dashboard-test.db";

function seedTransactions(db: Database.Database) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400_000);
  const lastWeek = new Date(now.getTime() - 7 * 86400_000);

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
    expect(stats.totalEarningsCents).toBe(102); // 50+50+2, excludes failed tx-4
    expect(stats.totalTransactions).toBe(3); // only verified
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
    expect(page1[0].id).not.toBe(page2[0]?.id);
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
    expect(format).toBeTruthy();
    expect(format!.total_cents).toBe(100); // 50+50
    expect(format!.call_count).toBe(2);
    expect(compliance!.total_cents).toBe(2);
    expect(compliance!.call_count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard-queries.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/dashboard/queries.ts
import type Database from "better-sqlite3";
import { fromCents } from "../types.js";

export interface OverviewStats {
  totalEarningsCents: number;
  totalEarningsDollars: number;
  totalTransactions: number;
}

export interface TransactionListItem {
  id: string;
  tool_name: string;
  amount_cents: number;
  amount_dollars: number;
  currency: string;
  protocol: string;
  payer_address: string | null;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

export interface ToolStats {
  tool_name: string;
  total_cents: number;
  total_dollars: number;
  call_count: number;
  avg_cents: number;
}

export interface ListOptions {
  limit: number;
  offset: number;
  status?: string;
}

export function getOverviewStats(db: Database.Database): OverviewStats {
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count
     FROM transactions WHERE status = 'verified'`
  ).get() as { total: number; count: number };

  return {
    totalEarningsCents: row.total,
    totalEarningsDollars: fromCents(row.total),
    totalTransactions: row.count,
  };
}

export function getTransactionList(
  db: Database.Database,
  options: ListOptions
): TransactionListItem[] {
  let sql = `SELECT id, tool_name, amount_cents, currency, protocol, payer_address, tx_hash, status, created_at FROM transactions`;
  const params: unknown[] = [];

  if (options.status) {
    sql += ` WHERE status = ?`;
    params.push(options.status);
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(options.limit, options.offset);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string; tool_name: string; amount_cents: number; currency: string;
    protocol: string; payer_address: string | null; tx_hash: string | null;
    status: string; created_at: string;
  }>;

  return rows.map(row => ({
    ...row,
    amount_dollars: fromCents(row.amount_cents),
  }));
}

export function getPerToolStats(db: Database.Database): ToolStats[] {
  const rows = db.prepare(
    `SELECT tool_name, SUM(amount_cents) as total_cents, COUNT(*) as call_count
     FROM transactions WHERE status = 'verified'
     GROUP BY tool_name ORDER BY total_cents DESC`
  ).all() as Array<{ tool_name: string; total_cents: number; call_count: number }>;

  return rows.map(row => ({
    ...row,
    total_dollars: fromCents(row.total_cents),
    avg_cents: Math.round(row.total_cents / row.call_count),
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/dashboard-queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/queries.ts tests/dashboard-queries.test.ts
git commit -m "feat: dashboard read-only queries for overview, transactions, per-tool stats"
```

---

## Task 3: Auth Middleware

**Files:**
- Create: `src/dashboard/auth.ts`
- Create: `tests/dashboard-auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/dashboard-auth.test.ts
import { describe, it, expect } from "vitest";
import { generateDashboardToken, createAuthMiddleware } from "../src/dashboard/auth.js";
import type { Request, Response, NextFunction } from "express";

describe("generateDashboardToken", () => {
  it("returns a 64-char hex string", () => {
    const token = generateDashboardToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique tokens", () => {
    const a = generateDashboardToken();
    const b = generateDashboardToken();
    expect(a).not.toBe(b);
  });
});

describe("createAuthMiddleware", () => {
  const token = "abc123";
  const middleware = createAuthMiddleware(token);

  function mockReq(query: Record<string, string>): Partial<Request> {
    return { query } as Partial<Request>;
  }
  function mockRes(): Partial<Response> {
    let statusCode = 200;
    let body = "";
    return {
      status(code: number) { statusCode = code; return this as Response; },
      send(data: string) { body = data; return this as Response; },
      get statusCode() { return statusCode; },
      get body() { return body; },
    } as any;
  }

  it("calls next() with valid token", () => {
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ token: "abc123" }) as Request, mockRes() as Response, next);
    expect(called).toBe(true);
  });

  it("returns 401 with missing token", () => {
    const res = mockRes();
    let called = false;
    middleware(mockReq({}) as Request, res as Response, () => { called = true; });
    expect(called).toBe(false);
    expect((res as any).statusCode).toBe(401);
  });

  it("returns 401 with wrong token", () => {
    const res = mockRes();
    let called = false;
    middleware(mockReq({ token: "wrong" }) as Request, res as Response, () => { called = true; });
    expect(called).toBe(false);
    expect((res as any).statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run tests/dashboard-auth.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/dashboard/auth.ts
import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

/** Generate a random 32-byte hex token for dashboard auth. */
export function generateDashboardToken(): string {
  return randomBytes(32).toString("hex");
}

/** Express middleware that validates ?token= query parameter. */
export function createAuthMiddleware(expectedToken: string) {
  const expectedBuf = Buffer.from(expectedToken);

  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.query.token as string | undefined;
    if (!provided) {
      res.status(401).send("Unauthorized: token query parameter required");
      return;
    }

    const providedBuf = Buffer.from(provided);
    if (providedBuf.length !== expectedBuf.length ||
        !timingSafeEqual(providedBuf, expectedBuf)) {
      res.status(401).send("Unauthorized: invalid token");
      return;
    }

    next();
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/dashboard-auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/auth.ts tests/dashboard-auth.test.ts
git commit -m "feat: dashboard bearer token auth with timing-safe comparison"
```

---

## Task 4: Dashboard Express Server

**Files:**
- Create: `src/dashboard/server.ts`
- Create: `tests/dashboard-server.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/dashboard-server.test.ts
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

describe("dashboard server", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createDashboardServer>;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = createDatabase(TEST_DB);
    seedData(db);
    app = createDashboardServer(db, TOKEN);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("rejects requests without token", async () => {
    const res = await makeRequest(app, "/");
    expect(res.status).toBe(401);
  });

  it("serves overview page with valid token", async () => {
    const res = await makeRequest(app, `/?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("$1.50"); // 50+100 cents = $1.50
    expect(text).toContain("2"); // 2 transactions
  });

  it("serves transactions page", async () => {
    const res = await makeRequest(app, `/transactions?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("my-tool");
    expect(text).toContain("0x1");
  });

  it("serves per-tool page", async () => {
    const res = await makeRequest(app, `/tools?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("my-tool");
    expect(text).toContain("$1.50");
  });

  it("returns JSON for /api/overview", async () => {
    const res = await makeRequest(app, `/api/overview?token=${TOKEN}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalEarningsCents).toBe(150);
    expect(data.totalTransactions).toBe(2);
  });
});

// Helper: make a request to the express app without starting a real server
async function makeRequest(app: any, path: string): Promise<Response> {
  // Use node's built-in test capabilities or a lightweight approach
  // We'll start the app on a random port, make the request, then close
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      fetch(`http://127.0.0.1:${addr.port}${path}`)
        .then(resolve)
        .catch(reject)
        .finally(() => server.close());
    });
  });
}
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run tests/dashboard-server.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/dashboard/server.ts
import express from "express";
import type Database from "better-sqlite3";
import { createAuthMiddleware } from "./auth.js";
import { getOverviewStats, getTransactionList, getPerToolStats } from "./queries.js";
import { fromCents } from "../types.js";

export function createDashboardServer(db: Database.Database, token: string) {
  const app = express();

  // Auth on all routes
  app.use(createAuthMiddleware(token));

  // --- HTML Pages ---

  app.get("/", (_req, res) => {
    const stats = getOverviewStats(db);
    res.send(renderPage("Overview", `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">$${stats.totalEarningsDollars.toFixed(2)}</div>
          <div class="stat-label">Total Earnings</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalTransactions}</div>
          <div class="stat-label">Transactions</div>
        </div>
      </div>
    `));
  });

  app.get("/transactions", (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const txs = getTransactionList(db, { limit, offset, status });

    const rows = txs.map(tx => `
      <tr>
        <td>${tx.created_at}</td>
        <td>${tx.tool_name}</td>
        <td>$${tx.amount_dollars.toFixed(2)}</td>
        <td>${tx.protocol}</td>
        <td><span class="status-${tx.status}">${tx.status}</span></td>
        <td>${tx.tx_hash ? `<a href="https://basescan.org/tx/${tx.tx_hash}" target="_blank">${tx.tx_hash.slice(0, 10)}...</a>` : "-"}</td>
      </tr>
    `).join("");

    res.send(renderPage("Transactions", `
      <table>
        <thead><tr><th>Date</th><th>Tool</th><th>Amount</th><th>Protocol</th><th>Status</th><th>Tx Hash</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `));
  });

  app.get("/tools", (_req, res) => {
    const stats = getPerToolStats(db);
    const rows = stats.map(s => `
      <tr>
        <td>${s.tool_name}</td>
        <td>$${s.total_dollars.toFixed(2)}</td>
        <td>${s.call_count}</td>
        <td>$${fromCents(s.avg_cents).toFixed(2)}</td>
      </tr>
    `).join("");

    res.send(renderPage("Per-Tool Breakdown", `
      <table>
        <thead><tr><th>Tool</th><th>Total Earned</th><th>Calls</th><th>Avg Payment</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `));
  });

  // --- JSON API ---

  app.get("/api/overview", (_req, res) => {
    res.json(getOverviewStats(db));
  });

  app.get("/api/transactions", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    res.json(getTransactionList(db, { limit, offset, status }));
  });

  app.get("/api/tools", (_req, res) => {
    res.json(getPerToolStats(db));
  });

  return app;
}

function renderPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mcp-pay — ${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    nav { display: flex; gap: 1.5rem; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
    nav a { color: #94a3b8; text-decoration: none; font-weight: 500; }
    nav a:hover { color: #e2e8f0; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #f8fafc; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stat-card { background: #1e293b; border-radius: 8px; padding: 1.5rem; }
    .stat-value { font-size: 2rem; font-weight: 700; color: #22d3ee; }
    .stat-label { color: #94a3b8; margin-top: 0.25rem; font-size: 0.875rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 500; font-size: 0.875rem; text-transform: uppercase; }
    a { color: #38bdf8; }
    .status-verified { color: #4ade80; }
    .status-failed { color: #f87171; }
  </style>
</head>
<body>
  <nav>
    <a href="/?token=\${token}">Overview</a>
    <a href="/transactions?token=\${token}">Transactions</a>
    <a href="/tools?token=\${token}">Tools</a>
  </nav>
  <h1>${title}</h1>
  ${content}
</body>
</html>`;
}
```

**Note:** The nav links include `\${token}` as a template literal placeholder. The implementer must pass the token to `renderPage` so nav links work. Adjust the function signature to accept `token` and interpolate it into the nav hrefs. This is important for navigation to work — without it the user gets 401 on every nav click.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/dashboard-server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/server.ts tests/dashboard-server.test.ts
git commit -m "feat: dashboard express server with overview, transactions, per-tool pages"
```

---

## Task 5: Wire Dashboard into withPayments

**Files:**
- Modify: `src/index.ts`
- Modify: `src/types.ts` (add dashboard config to McpPayConfig if not present)
- Create: `tests/dashboard-integration.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/dashboard-integration.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPayments } from "../src/index.js";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-dash-integration-test.db";
const PAY_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("dashboard integration", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("starts dashboard when config.dashboard is set", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const result = withPayments(server, {
      pricing: {},
      payTo: PAY_TO,
      protocols: ["mock"],
      dashboard: { port: 0 }, // port 0 = random available port
      dbPath: TEST_DB,
    });
    cleanup = result.cleanup;

    // Dashboard should be accessible
    expect(result.dashboardUrl).toBeTruthy();
    expect(result.dashboardUrl).toContain("http://127.0.0.1:");
    expect(result.dashboardUrl).toContain("token=");

    // Fetch overview
    const res = await fetch(result.dashboardUrl!);
    expect(res.status).toBe(200);
  });

  it("does not start dashboard when config.dashboard is not set", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const result = withPayments(server, {
      pricing: {},
      payTo: PAY_TO,
      protocols: ["mock"],
      dbPath: TEST_DB,
    });
    cleanup = result.cleanup;
    expect(result.dashboardUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run tests/dashboard-integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Update `src/types.ts` — ensure `McpPayConfig` has:
```typescript
dashboard?: { port: number };
dbPath?: string; // allow explicit DB path (for testing + standalone use)
```

Update `src/index.ts` — in `withPayments()`, after creating the gate:

```typescript
import { createDashboardServer } from "./dashboard/server.js";
import { generateDashboardToken } from "./dashboard/auth.js";
import type { Server } from "node:http";

// In WithPaymentsResult, add:
export interface WithPaymentsResult {
  server: McpServer;
  cleanup: () => void;
  dashboardUrl?: string;
}

// After gate creation, before return:
let dashboardServer: Server | undefined;
let dashboardUrl: string | undefined;

if (config.dashboard) {
  const token = generateDashboardToken();
  const app = createDashboardServer(db, token);
  dashboardServer = app.listen(config.dashboard.port, "127.0.0.1", () => {
    const addr = dashboardServer!.address() as { port: number };
    dashboardUrl = `http://127.0.0.1:${addr.port}/?token=${token}`;
    console.log(`[mcp-pay] Dashboard: ${dashboardUrl}`);
  });
}

// Update cleanup to also close dashboard:
function cleanup() {
  clearInterval(cleanupTimer);
  dashboardServer?.close();
  db.close();
}

return { server: mcpServer, cleanup, dashboardUrl };
```

**Important:** The `dashboardUrl` is set asynchronously (in the listen callback). The test uses `port: 0`, so the URL isn't known until the callback fires. The implementer may need to make `withPayments` return a promise, or set `dashboardUrl` on the result object after the listen callback. Simplest approach: use a synchronous listen by picking an available port beforehand, or return the result object and mutate `dashboardUrl` after listen.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/types.ts tests/dashboard-integration.test.ts
git commit -m "feat: wire dashboard into withPayments lifecycle"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: M2 dashboard complete"
```
