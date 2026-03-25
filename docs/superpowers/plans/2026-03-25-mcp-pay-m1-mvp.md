# mcp-pay M1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core `mcp-pay` npm package — a `withPayments()` wrapper that adds per-tool payment gating to any MCP server, using x402 as the first payment protocol.

**Architecture:** The library wraps an MCP server's tool call handlers with a payment gate. When a paid tool is called without payment, the gate returns a PAYMENT_REQUIRED error with a challenge. When called with payment proof, the gate verifies via the x402 facilitator, executes the tool, and logs the transaction to SQLite.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `better-sqlite3`, `vitest`

**Spec:** `docs/superpowers/specs/2026-03-25-mcp-payment-gateway-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts, package metadata |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Test runner config |
| `src/index.ts` | Public API — exports `withPayments()` |
| `src/types.ts` | All shared TypeScript interfaces and types |
| `src/pricing.ts` | Converts developer pricing config (dollars) to internal cents representation |
| `src/security/nonce.ts` | Cryptographic nonce generation (32 bytes via `crypto.randomBytes`) |
| `src/security/validate.ts` | EIP-55 address validation, amount verification, input sanitization |
| `src/storage/db.ts` | SQLite database initialization, migrations, file permissions |
| `src/storage/challenges.ts` | Challenge CRUD — create, lookup, mark used, expire cleanup |
| `src/storage/transactions.ts` | Transaction logging — append-only insert, query helpers |
| `src/protocols/interface.ts` | `PaymentProtocol` interface definition |
| `src/protocols/x402.ts` | x402 adapter — creates challenges, verifies via facilitator HTTP API |
| `src/protocols/mock.ts` | Mock protocol for testing — configurable success/failure responses |
| `src/gate.ts` | Payment gate — intercepts MCP tool calls, orchestrates challenge/verify/execute flow |
| `tests/pricing.test.ts` | Pricing conversion tests |
| `tests/nonce.test.ts` | Nonce generation + uniqueness tests |
| `tests/validate.test.ts` | Address validation, amount verification tests |
| `tests/storage.test.ts` | SQLite schema, challenges, transactions tests |
| `tests/gate.test.ts` | Payment gate integration tests (using mock protocol) |
| `tests/x402.test.ts` | x402 adapter tests (mocked HTTP) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder)

- [ ] **Step 1: Initialize the project**

```bash
cd /Users/yeqy1/Projects/mcp-pay
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk better-sqlite3 @noble/hashes
npm install -D typescript vitest @types/node @types/better-sqlite3
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Update package.json scripts and metadata**

Set in `package.json`:
```json
{
  "name": "mcp-pay",
  "version": "0.1.0",
  "description": "Payment gateway for MCP servers — monetize your tools with one wrapper",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "files": ["dist"],
  "license": "MIT"
}
```

- [ ] **Step 6: Create placeholder src/index.ts**

```typescript
export function withPayments() {
  throw new Error("Not implemented");
}
```

- [ ] **Step 7: Verify build and test runner work**

Run: `npm run build && npm test`
Expected: Build succeeds (empty output). Tests pass (0 tests found).

- [ ] **Step 8: Initialize git and commit**

```bash
cd /Users/yeqy1/Projects/mcp-pay
git init
echo "node_modules/\ndist/\n*.db\n.env" > .gitignore
git add package.json tsconfig.json vitest.config.ts src/index.ts .gitignore
git commit -m "feat: project scaffold with typescript, vitest, mcp sdk"
```

---

## Task 2: Types and Interfaces

**Files:**
- Create: `src/types.ts`
- Create: `src/protocols/interface.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Write the test for type validation helpers**

```typescript
// tests/types.test.ts
import { describe, it, expect } from "vitest";
import { toCents, fromCents } from "../src/types.js";

describe("toCents", () => {
  it("converts dollars to cents", () => {
    expect(toCents(0.50)).toBe(50);
    expect(toCents(1.00)).toBe(100);
    expect(toCents(0.02)).toBe(2);
    expect(toCents(99.99)).toBe(9999);
  });

  it("rounds to nearest cent", () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(0.004)).toBe(0);
  });
});

describe("fromCents", () => {
  it("converts cents to dollars", () => {
    expect(fromCents(50)).toBe(0.50);
    expect(fromCents(100)).toBe(1.00);
    expect(fromCents(2)).toBe(0.02);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/types.ts**

```typescript
// --- Conversion helpers ---

/** Convert dollar amount to integer cents. Rounds to nearest cent. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert integer cents to dollar amount. */
export function fromCents(cents: number): number {
  return cents / 100;
}

// --- Config types ---

export interface ToolPricing {
  amount: number;   // in dollars (developer-facing)
  currency: string; // e.g. "usd"
}

export interface McpPayConfig {
  pricing: Record<string, ToolPricing>;
  payTo: string;
  protocols: string[];
  dashboard?: { port: number };
  challengeTtlMs?: number; // default: 300_000 (5 min)
  facilitatorUrl?: string; // default: Coinbase hosted
}

// --- Payment types ---

export interface PaymentChallenge {
  version: number;
  protocol: string;
  amount: number;        // in cents
  currency: string;
  nonce: string;
  payTo: string;
  network?: string;
  token?: string;
  expiresAt: number;     // unix timestamp ms
}

export interface VerificationResult {
  verified: boolean;
  txHash?: string;
  confirmations?: number;
  paidCents?: number;    // actual amount paid (for underpayment check)
  error?: string;
  errorCode?: string;
}

// --- Error codes ---

export const ErrorCode = {
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  PAYMENT_INVALID: "PAYMENT_INVALID",
  PAYMENT_EXPIRED: "PAYMENT_EXPIRED",
  PAYMENT_UNDERPAID: "PAYMENT_UNDERPAID",
  PAYMENT_REPLAY: "PAYMENT_REPLAY",
  VERIFICATION_UNAVAILABLE: "VERIFICATION_UNAVAILABLE",
  PROTOCOL_UNSUPPORTED: "PROTOCOL_UNSUPPORTED",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
```

- [ ] **Step 4: Create src/protocols/interface.ts**

```typescript
import type { PaymentChallenge, VerificationResult } from "../types.js";

export interface PaymentProtocol {
  name: string;
  createChallenge(
    tool: string,
    amountCents: number,
    currency: string,
    payTo: string
  ): PaymentChallenge;
  verifyPayment(
    challenge: PaymentChallenge,
    proof: string
  ): Promise<VerificationResult>;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/protocols/interface.ts tests/types.test.ts
git commit -m "feat: add core types, interfaces, and cent conversion helpers"
```

---

## Task 3: Security — Nonce Generation

**Files:**
- Create: `src/security/nonce.ts`
- Create: `tests/nonce.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/nonce.test.ts
import { describe, it, expect } from "vitest";
import { generateNonce } from "../src/security/nonce.js";

describe("generateNonce", () => {
  it("returns a 64-character hex string (32 bytes)", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique nonces", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nonce.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/security/nonce.ts
import { randomBytes } from "node:crypto";

/** Generate a cryptographically random 32-byte hex nonce. */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/nonce.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/security/nonce.ts tests/nonce.test.ts
git commit -m "feat: cryptographic nonce generation for replay protection"
```

---

## Task 4: Security — Validation

**Files:**
- Create: `src/security/validate.ts`
- Create: `tests/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/validate.test.ts
import { describe, it, expect } from "vitest";
import {
  isValidEIP55Address,
  validatePayTo,
  validateAmount,
} from "../src/security/validate.js";

describe("isValidEIP55Address", () => {
  it("accepts valid checksummed address", () => {
    // Vitalik's address (valid EIP-55 checksum)
    expect(isValidEIP55Address("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
  });

  it("rejects all-lowercase (not checksummed)", () => {
    expect(isValidEIP55Address("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidEIP55Address("0x1234")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidEIP55Address("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
  });
});

describe("validatePayTo", () => {
  it("throws on invalid address", () => {
    expect(() => validatePayTo("not-an-address")).toThrow("Invalid payTo address");
  });

  it("does not throw on valid address", () => {
    expect(() => validatePayTo("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).not.toThrow();
  });
});

describe("validateAmount", () => {
  it("returns true when amounts match", () => {
    expect(validateAmount(50, 50)).toBe(true);
  });

  it("returns false when paid less than required", () => {
    expect(validateAmount(49, 50)).toBe(false);
  });

  it("returns true when overpaid", () => {
    expect(validateAmount(51, 50)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/security/validate.ts
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Validate an Ethereum address against EIP-55 checksum.
 * Uses keccak256 via @noble/hashes (audited, zero-dependency).
 * IMPORTANT: Node.js crypto.createHash("sha3-256") is NOT keccak256.
 * They are different algorithms despite the similar naming.
 */
export function isValidEIP55Address(address: string): boolean {
  // Must start with 0x and be 42 chars total
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return false;
  }

  // Reject all-lowercase or all-uppercase (not checksummed)
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) {
    return false;
  }

  // Full EIP-55 checksum validation using keccak256
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(hex.toLowerCase())));
  for (let i = 0; i < 40; i++) {
    const hashNibble = parseInt(hash[i], 16);
    const char = hex[i];
    if (hashNibble > 7) {
      if (char !== char.toUpperCase()) return false;
    } else {
      if (char !== char.toLowerCase()) return false;
    }
  }
  return true;
}

/** Validate payTo address at startup. Throws if invalid. */
export function validatePayTo(address: string): void {
  if (!isValidEIP55Address(address)) {
    throw new Error(
      `Invalid payTo address: "${address}". Must be a valid EIP-55 checksummed Ethereum address.`
    );
  }
}

/** Check that paid amount (cents) meets or exceeds required amount (cents). */
export function validateAmount(
  paidCents: number,
  requiredCents: number
): boolean {
  return paidCents >= requiredCents;
}
```

- [ ] **Step 4: Run tests and fix if keccak issue arises**

Run: `npx vitest run tests/validate.test.ts`
Expected: PASS (may need `@noble/hashes` — see note above)

If sha3-256 fails the Vitalik address test:
```bash
npm install @noble/hashes
```
Then update the hash computation to use keccak_256.

- [ ] **Step 5: Commit**

```bash
git add src/security/validate.ts tests/validate.test.ts
git commit -m "feat: EIP-55 address validation and amount verification"
```

---

## Task 5: Storage — SQLite Database

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/challenges.ts`
- Create: `src/storage/transactions.ts`
- Create: `tests/storage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase } from "../src/storage/db.js";
import {
  insertChallenge,
  findChallenge,
  markChallengeUsed,
  cleanupExpiredChallenges,
} from "../src/storage/challenges.js";
import {
  insertTransaction,
  getTransactions,
} from "../src/storage/transactions.js";
import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-test.db";

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = createDatabase(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("creates tables on init", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("transactions");
    expect(names).toContain("challenges");
    expect(names).toContain("schema_version");
  });
});

describe("challenges", () => {
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = createDatabase(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("inserts and finds a challenge", () => {
    const challenge = {
      nonce: "abc123",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    };
    insertChallenge(db, challenge);
    const found = findChallenge(db, "abc123");
    expect(found).toBeTruthy();
    expect(found!.tool_name).toBe("test-tool");
    expect(found!.used).toBe(0);
  });

  it("rejects duplicate nonce", () => {
    const challenge = {
      nonce: "abc123",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    };
    insertChallenge(db, challenge);
    expect(() => insertChallenge(db, challenge)).toThrow();
  });

  it("marks challenge as used", () => {
    const challenge = {
      nonce: "abc123",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    };
    insertChallenge(db, challenge);
    markChallengeUsed(db, "abc123");
    const found = findChallenge(db, "abc123");
    expect(found!.used).toBe(1);
  });

  it("cleans up expired challenges", () => {
    const expired = {
      nonce: "old",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      expires_at: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
    };
    const valid = {
      nonce: "new",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    };
    insertChallenge(db, expired);
    insertChallenge(db, valid);
    cleanupExpiredChallenges(db);
    expect(findChallenge(db, "old")).toBeNull();
    expect(findChallenge(db, "new")).toBeTruthy();
  });
});

describe("transactions", () => {
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = createDatabase(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("inserts a transaction", () => {
    insertTransaction(db, {
      id: "tx-1",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      payer_address: "0xABC",
      tx_hash: "0xDEF",
      nonce: "nonce-1",
      status: "verified",
    });
    const txs = getTransactions(db);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe("tx-1");
    expect(txs[0].amount_cents).toBe(50);
  });

  it("silently ignores duplicate nonce (INSERT OR IGNORE)", () => {
    const tx = {
      id: "tx-1",
      tool_name: "test-tool",
      amount_cents: 50,
      currency: "usd",
      protocol: "x402",
      payer_address: "0xABC",
      tx_hash: "0xDEF",
      nonce: "nonce-1",
      status: "verified",
    };
    insertTransaction(db, tx);
    // Second insert with same nonce is silently ignored (not thrown)
    insertTransaction(db, { ...tx, id: "tx-2" });
    // Only one row exists
    const txs = getTransactions(db);
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe("tx-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement src/storage/db.ts**

```typescript
// src/storage/db.ts
import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS challenges (
  nonce TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  protocol TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  protocol TEXT NOT NULL,
  payer_address TEXT,
  tx_hash TEXT,
  nonce TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function createDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Apply schema
  db.exec(SCHEMA_V1);

  // Record schema version
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
  }

  // Set file permissions (0600 — owner only)
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // May fail on some platforms — non-fatal
  }

  return db;
}
```

- [ ] **Step 4: Implement src/storage/challenges.ts**

```typescript
// src/storage/challenges.ts
import type Database from "better-sqlite3";

export interface ChallengeRow {
  nonce: string;
  tool_name: string;
  amount_cents: number;
  currency: string;
  protocol: string;
  expires_at: string;
  created_at: string;
  used: number;
}

export interface InsertChallenge {
  nonce: string;
  tool_name: string;
  amount_cents: number;
  currency: string;
  protocol: string;
  expires_at: string;
}

export function insertChallenge(
  db: Database.Database,
  challenge: InsertChallenge
): void {
  db.prepare(
    `INSERT INTO challenges (nonce, tool_name, amount_cents, currency, protocol, expires_at)
     VALUES (@nonce, @tool_name, @amount_cents, @currency, @protocol, @expires_at)`
  ).run(challenge);
}

export function findChallenge(
  db: Database.Database,
  nonce: string
): ChallengeRow | null {
  const row = db
    .prepare("SELECT * FROM challenges WHERE nonce = ?")
    .get(nonce) as ChallengeRow | undefined;
  return row ?? null;
}

export function markChallengeUsed(
  db: Database.Database,
  nonce: string
): void {
  db.prepare("UPDATE challenges SET used = 1 WHERE nonce = ?").run(nonce);
}

export function cleanupExpiredChallenges(db: Database.Database): void {
  db.prepare(
    "DELETE FROM challenges WHERE expires_at < datetime('now')"
  ).run();
}
```

- [ ] **Step 5: Implement src/storage/transactions.ts**

```typescript
// src/storage/transactions.ts
import type Database from "better-sqlite3";

export interface TransactionRow {
  id: string;
  tool_name: string;
  amount_cents: number;
  currency: string;
  protocol: string;
  payer_address: string | null;
  tx_hash: string | null;
  nonce: string;
  status: string;
  created_at: string;
}

export interface InsertTransaction {
  id: string;
  tool_name: string;
  amount_cents: number;
  currency: string;
  protocol: string;
  payer_address: string | null;
  tx_hash: string | null;
  nonce: string;
  status: string;
}

export function insertTransaction(
  db: Database.Database,
  tx: InsertTransaction
): void {
  db.prepare(
    `INSERT OR IGNORE INTO transactions (id, tool_name, amount_cents, currency, protocol, payer_address, tx_hash, nonce, status)
     VALUES (@id, @tool_name, @amount_cents, @currency, @protocol, @payer_address, @tx_hash, @nonce, @status)`
  ).run(tx);
}

export function getTransactions(
  db: Database.Database,
  limit = 100
): TransactionRow[] {
  return db
    .prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?")
    .all(limit) as TransactionRow[];
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/storage/ tests/storage.test.ts
git commit -m "feat: SQLite storage with challenges and transactions tables"
```

---

## Task 6: Mock Payment Protocol

**Files:**
- Create: `src/protocols/mock.ts`
- Create: `tests/mock-protocol.test.ts`

This mock protocol allows testing the full payment gate without real blockchain interaction.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/mock-protocol.test.ts
import { describe, it, expect } from "vitest";
import { MockProtocol } from "../src/protocols/mock.js";

describe("MockProtocol", () => {
  it("creates a challenge with correct fields", () => {
    const mock = new MockProtocol({ shouldVerify: true });
    const challenge = mock.createChallenge("test-tool", 50, "usd", "0xABC");
    expect(challenge.version).toBe(1);
    expect(challenge.protocol).toBe("mock");
    expect(challenge.amount).toBe(50);
    expect(challenge.currency).toBe("usd");
    expect(challenge.payTo).toBe("0xABC");
    expect(challenge.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
  });

  it("verifies successfully when configured to", async () => {
    const mock = new MockProtocol({ shouldVerify: true });
    const challenge = mock.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await mock.verifyPayment(challenge, "any-proof");
    expect(result.verified).toBe(true);
    expect(result.txHash).toBeTruthy();
  });

  it("rejects when configured to", async () => {
    const mock = new MockProtocol({ shouldVerify: false });
    const challenge = mock.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await mock.verifyPayment(challenge, "any-proof");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("PAYMENT_INVALID");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mock-protocol.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/protocols/mock.ts
import type { PaymentProtocol } from "./interface.js";
import type { PaymentChallenge, VerificationResult } from "../types.js";
import { generateNonce } from "../security/nonce.js";

export interface MockProtocolOptions {
  shouldVerify: boolean;
  delayMs?: number;
}

export class MockProtocol implements PaymentProtocol {
  name = "mock";
  private shouldVerify: boolean;
  private delayMs: number;

  constructor(options: MockProtocolOptions) {
    this.shouldVerify = options.shouldVerify;
    this.delayMs = options.delayMs ?? 0;
  }

  createChallenge(
    tool: string,
    amountCents: number,
    currency: string,
    payTo: string
  ): PaymentChallenge {
    return {
      version: 1,
      protocol: this.name,
      amount: amountCents,
      currency,
      nonce: generateNonce(),
      payTo,
      network: "mock-network",
      token: "MOCK",
      expiresAt: Date.now() + 300_000,
    };
  }

  async verifyPayment(
    _challenge: PaymentChallenge,
    _proof: string
  ): Promise<VerificationResult> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.shouldVerify) {
      return {
        verified: true,
        txHash: "0xmock_" + generateNonce().slice(0, 16),
        confirmations: 1,
      };
    }
    return {
      verified: false,
      error: "Mock verification failed",
      errorCode: "PAYMENT_INVALID",
    };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mock-protocol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/mock.ts tests/mock-protocol.test.ts
git commit -m "feat: mock payment protocol for testing"
```

---

## Task 7: Pricing Module

**Files:**
- Create: `src/pricing.ts`
- Create: `tests/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pricing.test.ts
import { describe, it, expect } from "vitest";
import { PricingTable } from "../src/pricing.js";

describe("PricingTable", () => {
  const table = new PricingTable({
    "format-manuscript": { amount: 0.50, currency: "usd" },
    "check-compliance": { amount: 0.02, currency: "usd" },
  });

  it("returns price in cents for a paid tool", () => {
    const price = table.getPrice("format-manuscript");
    expect(price).toEqual({ amountCents: 50, currency: "usd" });
  });

  it("returns null for a free (unlisted) tool", () => {
    expect(table.getPrice("free-tool")).toBeNull();
  });

  it("identifies paid tools", () => {
    expect(table.isPaid("format-manuscript")).toBe(true);
    expect(table.isPaid("free-tool")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pricing.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/pricing.ts
import { toCents, type ToolPricing } from "./types.js";

export interface ResolvedPrice {
  amountCents: number;
  currency: string;
}

export class PricingTable {
  private prices: Map<string, ResolvedPrice>;

  constructor(pricing: Record<string, ToolPricing>) {
    this.prices = new Map();
    for (const [tool, config] of Object.entries(pricing)) {
      this.prices.set(tool, {
        amountCents: toCents(config.amount),
        currency: config.currency,
      });
    }
  }

  getPrice(tool: string): ResolvedPrice | null {
    return this.prices.get(tool) ?? null;
  }

  isPaid(tool: string): boolean {
    return this.prices.has(tool);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/pricing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pricing.ts tests/pricing.test.ts
git commit -m "feat: pricing table with dollar-to-cents conversion"
```

---

## Task 8: Payment Gate (Core Logic)

**Files:**
- Create: `src/gate.ts`
- Create: `tests/gate.test.ts`

This is the heart of the library — intercepts MCP tool calls and orchestrates the challenge/verify/execute flow.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/gate.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PaymentGate } from "../src/gate.js";
import { MockProtocol } from "../src/protocols/mock.js";
import { createDatabase } from "../src/storage/db.js";
import { PricingTable } from "../src/pricing.js";
import { ErrorCode } from "../src/types.js";
import Database from "better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-gate-test.db";
const PAY_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("PaymentGate", () => {
  let db: Database.Database;
  let gate: PaymentGate;
  let mockProtocol: MockProtocol;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = createDatabase(TEST_DB);
    mockProtocol = new MockProtocol({ shouldVerify: true });
    const pricing = new PricingTable({
      "paid-tool": { amount: 0.50, currency: "usd" },
    });
    gate = new PaymentGate({
      db,
      pricing,
      protocols: [mockProtocol],
      payTo: PAY_TO,
      challengeTtlMs: 300_000,
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("passes through free tools without payment", async () => {
    const result = await gate.handleToolCall("free-tool", { input: "data" });
    expect(result.action).toBe("passthrough");
  });

  it("returns PAYMENT_REQUIRED for paid tool without payment", async () => {
    const result = await gate.handleToolCall("paid-tool", { input: "data" });
    expect(result.action).toBe("payment_required");
    expect(result.challenge).toBeTruthy();
    expect(result.challenge!.amount).toBe(50);
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_REQUIRED);
  });

  it("verifies payment and returns execute for valid proof", async () => {
    // First call — get challenge
    const challenge = await gate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;

    // Second call — with payment
    const result = await gate.handleToolCall("paid-tool", {
      _payment: { nonce, proof: "valid-proof", protocol: "mock" },
    });
    expect(result.action).toBe("execute");
    expect(result.receipt).toBeTruthy();
    expect(result.receipt!.txHash).toBeTruthy();
  });

  it("rejects expired challenge", async () => {
    // Create gate with very short TTL
    const shortGate = new PaymentGate({
      db,
      pricing: new PricingTable({ "paid-tool": { amount: 0.50, currency: "usd" } }),
      protocols: [mockProtocol],
      payTo: PAY_TO,
      challengeTtlMs: 1, // 1ms — will expire immediately
    });

    const challenge = await shortGate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;

    // Wait for expiration
    await new Promise((r) => setTimeout(r, 10));

    const result = await shortGate.handleToolCall("paid-tool", {
      _payment: { nonce, proof: "valid-proof", protocol: "mock" },
    });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_EXPIRED);
  });

  it("rejects replay (same nonce used twice)", async () => {
    const challenge = await gate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;

    // First use — succeeds
    await gate.handleToolCall("paid-tool", {
      _payment: { nonce, proof: "valid-proof", protocol: "mock" },
    });

    // Second use — rejected
    const result = await gate.handleToolCall("paid-tool", {
      _payment: { nonce, proof: "valid-proof", protocol: "mock" },
    });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_REPLAY);
  });

  it("rejects invalid payment proof", async () => {
    const failProtocol = new MockProtocol({ shouldVerify: false });
    const failGate = new PaymentGate({
      db,
      pricing: new PricingTable({ "paid-tool": { amount: 0.50, currency: "usd" } }),
      protocols: [failProtocol],
      payTo: PAY_TO,
      challengeTtlMs: 300_000,
    });

    const challenge = await failGate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;

    const result = await failGate.handleToolCall("paid-tool", {
      _payment: { nonce, proof: "bad-proof", protocol: "mock" },
    });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_INVALID);
  });

  it("rejects unsupported protocol", async () => {
    const challenge = await gate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;

    const result = await gate.handleToolCall("paid-tool", {
      _payment: { nonce, proof: "valid-proof", protocol: "nonexistent" },
    });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PROTOCOL_UNSUPPORTED);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement src/gate.ts**

```typescript
// src/gate.ts
import type Database from "better-sqlite3";
import type { PaymentProtocol } from "./protocols/interface.js";
import type { PaymentChallenge } from "./types.js";
import { ErrorCode } from "./types.js";
import { PricingTable } from "./pricing.js";
import { validateAmount } from "./security/validate.js";
import {
  insertChallenge,
  findChallenge,
  markChallengeUsed,
} from "./storage/challenges.js";
import { insertTransaction } from "./storage/transactions.js";
import { randomUUID } from "node:crypto";

export interface GateConfig {
  db: Database.Database;
  pricing: PricingTable;
  protocols: PaymentProtocol[];
  payTo: string;
  challengeTtlMs: number;
}

export interface PaymentProof {
  nonce: string;
  proof: string;
  protocol: string;
}

export interface GateResult {
  action: "passthrough" | "payment_required" | "execute" | "rejected";
  challenge?: PaymentChallenge;
  receipt?: { txHash: string; amountCents: number; currency: string };
  errorCode?: string;
  error?: string;
}

export class PaymentGate {
  private db: Database.Database;
  private pricing: PricingTable;
  private protocols: Map<string, PaymentProtocol>;
  private payTo: string;
  private challengeTtlMs: number;

  constructor(config: GateConfig) {
    this.db = config.db;
    this.pricing = config.pricing;
    this.payTo = config.payTo;
    this.challengeTtlMs = config.challengeTtlMs;
    this.protocols = new Map();
    for (const p of config.protocols) {
      this.protocols.set(p.name, p);
    }
  }

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<GateResult> {
    // 1. Check if this is a paid tool
    const price = this.pricing.getPrice(toolName);
    if (!price) {
      return { action: "passthrough" };
    }

    // 2. Check if payment proof is attached
    const payment = args._payment as PaymentProof | undefined;
    if (!payment) {
      return this.issueChallenge(toolName, price.amountCents, price.currency);
    }

    // 3. Verify payment
    return this.verifyAndExecute(toolName, payment, price.amountCents, price.currency);
  }

  private issueChallenge(
    toolName: string,
    amountCents: number,
    currency: string
  ): GateResult {
    // Use first configured protocol to create challenge
    const protocol = this.protocols.values().next().value;
    if (!protocol) {
      return {
        action: "rejected",
        errorCode: ErrorCode.VERIFICATION_UNAVAILABLE,
        error: "No payment protocols configured",
      };
    }

    const challenge = protocol.createChallenge(
      toolName,
      amountCents,
      currency,
      this.payTo
    );

    // Override expiresAt with our configured TTL
    challenge.expiresAt = Date.now() + this.challengeTtlMs;

    // Store challenge in database
    insertChallenge(this.db, {
      nonce: challenge.nonce,
      tool_name: toolName,
      amount_cents: amountCents,
      currency,
      protocol: protocol.name,
      expires_at: new Date(challenge.expiresAt).toISOString(),
    });

    return {
      action: "payment_required",
      challenge,
      errorCode: ErrorCode.PAYMENT_REQUIRED,
    };
  }

  private async verifyAndExecute(
    toolName: string,
    payment: PaymentProof,
    amountCents: number,
    currency: string
  ): Promise<GateResult> {
    // Find the protocol
    const protocol = this.protocols.get(payment.protocol);
    if (!protocol) {
      return {
        action: "rejected",
        errorCode: ErrorCode.PROTOCOL_UNSUPPORTED,
        error: `Protocol "${payment.protocol}" is not configured`,
      };
    }

    // Look up the challenge
    const challengeRow = findChallenge(this.db, payment.nonce);
    if (!challengeRow) {
      return {
        action: "rejected",
        errorCode: ErrorCode.PAYMENT_INVALID,
        error: "Unknown nonce — no matching challenge found",
      };
    }

    // Check if already used (replay)
    if (challengeRow.used) {
      return {
        action: "rejected",
        errorCode: ErrorCode.PAYMENT_REPLAY,
        error: "This nonce has already been used",
      };
    }

    // Check expiration
    const expiresAt = new Date(challengeRow.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return {
        action: "rejected",
        errorCode: ErrorCode.PAYMENT_EXPIRED,
        error: "Challenge has expired",
      };
    }

    // Reconstruct the challenge for verification
    const challenge: PaymentChallenge = {
      version: 1,
      protocol: challengeRow.protocol,
      amount: challengeRow.amount_cents,
      currency: challengeRow.currency,
      nonce: challengeRow.nonce,
      payTo: this.payTo,
      expiresAt,
    };

    // Verify with the protocol
    const result = await protocol.verifyPayment(challenge, payment.proof);

    if (!result.verified) {
      // Distinguish transient errors from definitive rejections.
      // Transient (facilitator down): do NOT burn the challenge — agent can retry.
      // Definitive (bad signature, underpayment): burn the challenge.
      const isTransient = result.errorCode === ErrorCode.VERIFICATION_UNAVAILABLE;

      if (!isTransient) {
        markChallengeUsed(this.db, payment.nonce);
      }

      return {
        action: "rejected",
        errorCode: result.errorCode ?? ErrorCode.PAYMENT_INVALID,
        error: result.error ?? "Payment verification failed",
      };
    }

    // Amount verification (defense-in-depth — even if facilitator confirmed)
    // The facilitator may not enforce our exact price.
    if (!validateAmount(result.paidCents ?? amountCents, amountCents)) {
      markChallengeUsed(this.db, payment.nonce);
      return {
        action: "rejected",
        errorCode: ErrorCode.PAYMENT_UNDERPAID,
        error: `Paid ${result.paidCents} cents, required ${amountCents} cents`,
      };
    }

    // Mark challenge as used
    markChallengeUsed(this.db, payment.nonce);

    // Log successful transaction (INSERT OR IGNORE for safety)
    insertTransaction(this.db, {
      id: randomUUID(),
      tool_name: toolName,
      amount_cents: amountCents,
      currency,
      protocol: payment.protocol,
      payer_address: null,
      tx_hash: result.txHash ?? null,
      nonce: payment.nonce,
      status: "verified",
    });

    return {
      action: "execute",
      receipt: {
        txHash: result.txHash ?? "",
        amountCents,
        currency,
      },
    };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/gate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gate.ts tests/gate.test.ts
git commit -m "feat: payment gate — core challenge/verify/execute flow"
```

---

## Task 9: withPayments Wrapper

**Files:**
- Modify: `src/index.ts`
- Create: `tests/integration.test.ts`

This is the public API — wraps an MCP server's tool handlers with the payment gate.

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPayments } from "../src/index.js";
import { ErrorCode } from "../src/types.js";
import { unlinkSync, existsSync } from "node:fs";
import { z } from "zod";

// Note: The MCP SDK may use zod for schemas. If not available,
// use simple object schemas. Adjust based on actual SDK API.

const TEST_DB = "/tmp/mcp-pay-integration-test.db";
const PAY_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("withPayments", () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  afterEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("creates a wrapped server without throwing", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    server.tool("my-tool", {}, async () => {
      return { content: [{ type: "text" as const, text: "hello" }] };
    });

    // Should not throw
    const wrapped = withPayments(server, {
      pricing: { "my-tool": { amount: 0.50, currency: "usd" } },
      payTo: PAY_TO,
      protocols: ["mock"],
      _testDbPath: TEST_DB, // internal: override db path for testing
    });

    expect(wrapped).toBeTruthy();
  });

  it("throws on invalid payTo address", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    expect(() =>
      withPayments(server, {
        pricing: {},
        payTo: "not-an-address",
        protocols: ["mock"],
      })
    ).toThrow("Invalid payTo address");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement src/index.ts**

```typescript
// src/index.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpPayConfig } from "./types.js";
import { validatePayTo } from "./security/validate.js";
import { PricingTable } from "./pricing.js";
import { PaymentGate } from "./gate.js";
import { createDatabase } from "./storage/db.js";
import { MockProtocol } from "./protocols/mock.js";
import type { PaymentProtocol } from "./protocols/interface.js";
import { join } from "node:path";
import { homedir } from "node:os";

export type { McpPayConfig } from "./types.js";
export { ErrorCode } from "./types.js";
export type { PaymentChallenge, VerificationResult } from "./types.js";
export type { PaymentProtocol } from "./protocols/interface.js";

interface WithPaymentsOptions extends McpPayConfig {
  /** Internal: override database path for testing */
  _testDbPath?: string;
}

/**
 * Wrap an MCP server with per-tool payment gating.
 *
 * Tools listed in `pricing` require payment before execution.
 * Unlisted tools pass through without payment checks.
 */
export function withPayments(
  server: McpServer,
  config: WithPaymentsOptions
): McpServer {
  // Validate wallet address at startup
  validatePayTo(config.payTo);

  // Initialize storage
  const dbPath =
    config._testDbPath ?? join(homedir(), ".mcp-pay", "transactions.db");
  const db = createDatabase(dbPath);

  // Build pricing table
  const pricing = new PricingTable(config.pricing);

  // Initialize protocols
  const protocols: PaymentProtocol[] = [];
  for (const name of config.protocols) {
    if (name === "mock") {
      protocols.push(new MockProtocol({ shouldVerify: true }));
    }
    // x402 protocol will be added in a later task
  }

  // Create payment gate
  const _gate = new PaymentGate({
    db,
    pricing,
    protocols,
    payTo: config.payTo,
    challengeTtlMs: config.challengeTtlMs ?? 300_000,
  });

  // TODO (Task 10): Intercept MCP server tool handlers via the gate.
  // The MCP SDK's tool interception mechanism needs to be determined
  // based on the actual SDK API (monkey-patching, middleware, or proxy).
  // For now, the gate is created and ready — wiring happens next.

  return server;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/integration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/integration.test.ts
git commit -m "feat: withPayments public API with validation and gate initialization"
```

---

## Task 10: MCP Tool Interception

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/integration.test.ts`

This task wires the payment gate into the MCP server's tool call lifecycle. The exact approach depends on the MCP SDK's API — the implementer must read the SDK source to determine whether tool handlers can be wrapped via middleware, proxy, or monkey-patching.

- [ ] **Step 1: Research the MCP SDK's tool handler API**

Read the `@modelcontextprotocol/sdk` source to understand how `server.tool()` registers handlers and how to intercept tool calls. Key files to check:

```bash
ls node_modules/@modelcontextprotocol/sdk/dist/server/
```

Read the McpServer class source — look for the internal `Server` instance and its `setRequestHandler` method. The MCP SDK's `Server` class (lower-level) uses `setRequestHandler` to register JSON-RPC method handlers. `McpServer` wraps this and registers a `CallToolRequestSchema` handler internally.

- [ ] **Step 2: Write integration tests for tool interception**

Add to `tests/integration.test.ts`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("tool interception", () => {
  let client: Client;

  beforeEach(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    server.tool("paid-tool", {}, async () => {
      return { content: [{ type: "text" as const, text: "secret result" }] };
    });
    server.tool("free-tool", {}, async () => {
      return { content: [{ type: "text" as const, text: "free result" }] };
    });

    const wrapped = withPayments(server, {
      pricing: { "paid-tool": { amount: 0.50, currency: "usd" } },
      payTo: PAY_TO,
      protocols: ["mock"],
      _testDbPath: TEST_DB,
    });

    // Connect via in-memory transport
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      wrapped.server.connect(serverTransport),
    ]);
  });

  afterEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("returns PAYMENT_REQUIRED for paid tool without payment", async () => {
    const result = await client.callTool({ name: "paid-tool", arguments: {} });
    // The response should contain an error with payment instructions
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text).toContain("PAYMENT_REQUIRED");
  });

  it("passes through free tools without payment check", async () => {
    const result = await client.callTool({ name: "free-tool", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("free result");
  });

  it("executes paid tool after valid payment", async () => {
    // Step 1: Call without payment, get challenge
    const challengeResult = await client.callTool({
      name: "paid-tool",
      arguments: {},
    });
    const challengeText = (challengeResult.content as Array<{ type: string; text: string }>)[0].text;
    const challengeData = JSON.parse(challengeText);
    const nonce = challengeData.challenge.nonce;

    // Step 2: Call with payment proof
    const result = await client.callTool({
      name: "paid-tool",
      arguments: {
        _payment: { nonce, proof: "valid-proof", protocol: "mock" },
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("secret result");
  });
});
```

**Note:** The exact API for `InMemoryTransport` may vary across SDK versions. The implementer should check the actual imports. If `InMemoryTransport` is not available, use `StreamableHTTPServerTransport` with a local HTTP server or test via the gate directly.

- [ ] **Step 3: Implement tool interception in src/index.ts**

The approach: intercept the lower-level `Server` instance's request handler for `tools/call`. The `McpServer` class exposes its internal `Server` via a public `.server` property. We hook into the request flow by wrapping the `CallToolRequest` handler.

Update `withPayments()` in `src/index.ts`:

```typescript
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function withPayments(
  mcpServer: McpServer,
  config: WithPaymentsOptions
): McpServer {
  // Validate wallet address at startup
  validatePayTo(config.payTo);

  // Initialize storage
  const dbPath =
    config._testDbPath ?? join(homedir(), ".mcp-pay", "transactions.db");
  const db = createDatabase(dbPath);

  // Build pricing table
  const pricing = new PricingTable(config.pricing);

  // Initialize protocols
  const protocols: PaymentProtocol[] = [];
  for (const name of config.protocols) {
    if (name === "mock") {
      protocols.push(new MockProtocol({ shouldVerify: true }));
    }
    // x402 wired in Task 11
  }

  // Create payment gate
  const gate = new PaymentGate({
    db,
    pricing,
    protocols,
    payTo: config.payTo,
    challengeTtlMs: config.challengeTtlMs ?? 300_000,
  });

  // Periodic challenge cleanup (every 15 min, unref'd so it won't keep process alive)
  const cleanupInterval = setInterval(() => {
    cleanupExpiredChallenges(db);
  }, 15 * 60 * 1000);
  cleanupInterval.unref();

  // Intercept tool calls via the lower-level Server instance.
  // McpServer registers its own CallToolRequest handler internally.
  // We need to wrap it. The approach:
  //   1. Let McpServer register all its tools normally.
  //   2. Override the CallToolRequest handler on the underlying Server
  //      to run the payment gate BEFORE the original handler.
  //
  // The McpServer class stores the original handler. We save a reference
  // to it and replace it with our wrapper.

  const server = mcpServer.server;

  // Save the original handler that McpServer registered
  const originalHandler = (server as any)._requestHandlers?.get(
    CallToolRequestSchema.method
  );

  // Register our intercepting handler
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    // Run through payment gate
    const gateResult = await gate.handleToolCall(toolName, args);

    switch (gateResult.action) {
      case "passthrough":
        // Free tool — forward to original handler
        return originalHandler!(request, extra);

      case "payment_required":
        // Return payment instructions as tool result (not an MCP error,
        // because MCP errors are transport-level. Tool-level errors are
        // returned as content with isError flag.)
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: gateResult.errorCode,
                challenge: gateResult.challenge,
              }),
            },
          ],
          isError: true,
        };

      case "execute":
        // Payment verified — strip _payment from args, forward to original
        const cleanArgs = { ...args };
        delete cleanArgs._payment;
        const cleanRequest = {
          ...request,
          params: { ...request.params, arguments: cleanArgs },
        };
        const result = await originalHandler!(cleanRequest, extra);

        // Append receipt to the response
        if (gateResult.receipt) {
          const resultContent = (result as any).content ?? [];
          resultContent.push({
            type: "text" as const,
            text: JSON.stringify({ _receipt: gateResult.receipt }),
          });
        }
        return result;

      case "rejected":
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: gateResult.errorCode,
                message: gateResult.error,
              }),
            },
          ],
          isError: true,
        };
    }
  });

  return mcpServer;
}
```

**Key design decisions:**
- Payment errors are returned as tool results with `isError: true`, not as MCP protocol errors. This keeps the MCP transport clean and lets agent-side code parse the payment instructions from the tool response.
- `_payment` is stripped from args before forwarding to the real handler (prevents leaking payment metadata).
- Receipt is appended as an additional content block in the response.
- The `originalHandler` capture works because McpServer registers its handler synchronously during `server.tool()` calls, before `withPayments` runs.

**Fallback if `_requestHandlers` is not accessible:** If the SDK does not expose the handler map, use a different approach: wrap each tool's callback function directly by iterating `mcpServer`'s internal tool registry. The implementer should check the SDK source for the actual internal structure.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/integration.test.ts
git commit -m "feat: wire payment gate into MCP tool call lifecycle"
```

---

## Task 11: x402 Protocol Adapter

**Files:**
- Create: `src/protocols/x402.ts`
- Create: `tests/x402.test.ts`

- [ ] **Step 1: Research x402 facilitator API**

The x402 facilitator is an HTTP API. Check:
```bash
npm info @x402/core
npm info @x402/server
```

If `@x402/core` exists and is usable, use it. Otherwise, implement the HTTP calls directly (the protocol is simple: POST to facilitator with payment details, get back verification result).

Key x402 flow:
1. Server creates a payment requirement (amount, recipient, network)
2. Client signs a payment and sends it back
3. Server sends the signed payment to the facilitator for verification
4. Facilitator returns: verified/not, tx hash, confirmations

- [ ] **Step 2: Write the failing test (with mocked HTTP)**

```typescript
// tests/x402.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { X402Protocol } from "../src/protocols/x402.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("X402Protocol", () => {
  const protocol = new X402Protocol({
    facilitatorUrl: "https://x402.org/facilitator",
    network: "base",
    token: "USDC",
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates a challenge with x402 fields", () => {
    const challenge = protocol.createChallenge(
      "test-tool", 50, "usd", "0xABC"
    );
    expect(challenge.protocol).toBe("x402");
    expect(challenge.network).toBe("base");
    expect(challenge.token).toBe("USDC");
    expect(challenge.amount).toBe(50);
  });

  it("verifies payment via facilitator HTTP API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        txHash: "0xabc123",
        confirmations: 1,
      }),
    });

    const challenge = protocol.createChallenge(
      "test-tool", 50, "usd", "0xABC"
    );
    const result = await protocol.verifyPayment(challenge, "signed-payment-data");

    expect(result.verified).toBe(true);
    expect(result.txHash).toBe("0xabc123");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("handles facilitator rejection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: "Invalid signature",
      }),
    });

    const challenge = protocol.createChallenge(
      "test-tool", 50, "usd", "0xABC"
    );
    const result = await protocol.verifyPayment(challenge, "bad-data");

    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("PAYMENT_INVALID");
  });

  it("handles facilitator downtime", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const challenge = protocol.createChallenge(
      "test-tool", 50, "usd", "0xABC"
    );
    const result = await protocol.verifyPayment(challenge, "signed-data");

    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("VERIFICATION_UNAVAILABLE");
  });

  it("opens circuit breaker after 3 consecutive failures", async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      const ch = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
      await protocol.verifyPayment(ch, "data");
    }

    // 4th call should not hit fetch at all — circuit is open
    mockFetch.mockClear();
    const ch = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await protocol.verifyPayment(ch, "data");

    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("VERIFICATION_UNAVAILABLE");
    expect(result.error).toContain("circuit open");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/x402.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement**

```typescript
// src/protocols/x402.ts
import type { PaymentProtocol } from "./interface.js";
import type { PaymentChallenge, VerificationResult } from "../types.js";
import { ErrorCode } from "../types.js";
import { generateNonce } from "../security/nonce.js";

export interface X402ProtocolOptions {
  facilitatorUrl: string;
  network: string;    // e.g. "base"
  token: string;      // e.g. "USDC"
}

export class X402Protocol implements PaymentProtocol {
  name = "x402";
  private facilitatorUrl: string;
  private network: string;
  private token: string;

  // Circuit breaker state
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(options: X402ProtocolOptions) {
    this.facilitatorUrl = options.facilitatorUrl;
    this.network = options.network;
    this.token = options.token;
  }

  createChallenge(
    tool: string,
    amountCents: number,
    currency: string,
    payTo: string
  ): PaymentChallenge {
    return {
      version: 1,
      protocol: this.name,
      amount: amountCents,
      currency,
      nonce: generateNonce(),
      payTo,
      network: this.network,
      token: this.token,
      expiresAt: Date.now() + 300_000,
    };
  }

  async verifyPayment(
    challenge: PaymentChallenge,
    proof: string
  ): Promise<VerificationResult> {
    // Check circuit breaker
    if (Date.now() < this.circuitOpenUntil) {
      return {
        verified: false,
        error: "Facilitator temporarily unavailable (circuit open)",
        errorCode: ErrorCode.VERIFICATION_UNAVAILABLE,
      };
    }

    try {
      const response = await fetch(this.facilitatorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment: proof,
          challenge: {
            nonce: challenge.nonce,
            amount: challenge.amount,
            currency: challenge.currency,
            payTo: challenge.payTo,
            network: challenge.network,
            token: challenge.token,
          },
        }),
      });

      if (!response.ok) {
        this.recordFailure();
        return {
          verified: false,
          error: `Facilitator returned HTTP ${response.status}`,
          errorCode: ErrorCode.VERIFICATION_UNAVAILABLE,
        };
      }

      const data = (await response.json()) as {
        success: boolean;
        txHash?: string;
        confirmations?: number;
        error?: string;
      };

      // Reset circuit breaker on successful communication
      this.consecutiveFailures = 0;

      if (data.success) {
        return {
          verified: true,
          txHash: data.txHash,
          confirmations: data.confirmations,
        };
      }

      return {
        verified: false,
        error: data.error ?? "Payment verification failed",
        errorCode: ErrorCode.PAYMENT_INVALID,
      };
    } catch (err) {
      this.recordFailure();
      return {
        verified: false,
        error: err instanceof Error ? err.message : "Facilitator request failed",
        errorCode: ErrorCode.VERIFICATION_UNAVAILABLE,
      };
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 3) {
      // Open circuit for 60 seconds
      this.circuitOpenUntil = Date.now() + 60_000;
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/x402.test.ts`
Expected: PASS

- [ ] **Step 6: Wire x402 into withPayments**

Update `src/index.ts` to support `"x402"` in the protocols array:

```typescript
// In the protocol initialization loop:
if (name === "x402") {
  protocols.push(new X402Protocol({
    facilitatorUrl: config.facilitatorUrl ?? "https://x402.org/facilitator",
    network: "base",
    token: "USDC",
  }));
}
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/protocols/x402.ts tests/x402.test.ts src/index.ts
git commit -m "feat: x402 protocol adapter with circuit breaker"
```

---

## Task 12: Run Full Test Suite and Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 3: Verify no secrets in codebase**

```bash
grep -r "private.*key\|secret\|password\|seed" src/ --include="*.ts" -l
```
Expected: No files contain actual secrets (only type references are OK)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: M1 MVP complete — mcp-pay core library with x402 support"
```
