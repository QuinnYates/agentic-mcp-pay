# agentic-mcp-pay-client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the buyer-side client SDK that auto-handles paid MCP tools — detect PAYMENT_REQUIRED, check budget, sign payment, retry transparently.

**Architecture:** PaidMcpClient wraps the standard MCP Client. Overrides callTool() to detect payment challenges in responses, enforce spending limits, sign payments via protocol-specific signers, and retry. Budget tracked in memory.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, vitest

**Spec:** `docs/superpowers/specs/2026-03-29-mcp-pay-client-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Package config |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Test config |
| `src/index.ts` | Public exports |
| `src/types.ts` | Config types, error classes |
| `src/budget.ts` | BudgetTracker — in-memory spend tracking with per-call and daily limits |
| `src/parser.ts` | Detect PAYMENT_REQUIRED responses, extract challenge data |
| `src/signers/interface.ts` | PaymentSigner interface |
| `src/signers/x402.ts` | x402 signer (wallet private key signing) |
| `src/signers/stripe.ts` | Stripe signer (PaymentMethod ID pass-through) |
| `src/signers/mpp.ts` | MPP signer (session token pass-through) |
| `src/client.ts` | PaidMcpClient — main class wrapping MCP Client |
| `tests/budget.test.ts` | Budget tracking tests |
| `tests/parser.test.ts` | Response parsing tests |
| `tests/signers.test.ts` | Signer tests |
| `tests/client.test.ts` | End-to-end client tests |

---

## Task 1: Project Scaffold

**Files:** package.json, tsconfig.json, vitest.config.ts, src/index.ts

- [ ] **Step 1: Create project directory and init**

```bash
mkdir -p /Users/yeqy1/Projects/mcp-pay-client
cd /Users/yeqy1/Projects/mcp-pay-client
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk
npm install -D typescript vitest @types/node
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
export default defineConfig({ test: { globals: true, include: ["tests/**/*.test.ts"] } });
```

- [ ] **Step 5: Update package.json**

```json
{
  "name": "agentic-mcp-pay-client",
  "version": "0.1.0",
  "description": "Client SDK for paid MCP tools — auto-pay, budget controls, multi-protocol",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc", "test": "vitest run", "test:watch": "vitest" },
  "files": ["dist"],
  "keywords": ["mcp", "payments", "x402", "mpp", "stripe", "agentic", "ai-agents", "client"],
  "author": "Quinn Ye",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/QuinnYates/agentic-mcp-pay-client.git" },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 6: Create placeholder src/index.ts**

```typescript
export class PaidMcpClient {
  constructor() { throw new Error("Not implemented"); }
}
```

- [ ] **Step 7: Verify build, init git, commit**

```bash
npm run build
git init
echo "node_modules/\ndist/\n.env" > .gitignore
git add -A
git commit -m "feat: project scaffold"
```

---

## Task 2: Types and Errors

**Files:** src/types.ts, tests/types.test.ts

- [ ] **Step 1: Write test**

```typescript
// tests/types.test.ts
import { describe, it, expect } from "vitest";
import { BudgetExceededError, PaymentRejectedError } from "../src/types.js";

describe("errors", () => {
  it("BudgetExceededError includes amount info", () => {
    const err = new BudgetExceededError(500, 100, "maxPerCall");
    expect(err.message).toContain("500");
    expect(err.message).toContain("100");
    expect(err.name).toBe("BudgetExceededError");
    expect(err.requestedCents).toBe(500);
    expect(err.limitCents).toBe(100);
  });

  it("PaymentRejectedError includes tool name", () => {
    const err = new PaymentRejectedError("my-tool");
    expect(err.message).toContain("my-tool");
    expect(err.name).toBe("PaymentRejectedError");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/types.ts
export interface PaidClientConfig {
  walletPrivateKey?: string;
  stripePaymentMethodId?: string;
  mppSessionToken?: string;
  budget?: BudgetConfig;
  onPaymentRequired?: (info: PaymentInfo) => Promise<boolean>;
}

export interface BudgetConfig {
  maxPerCallCents?: number;
  maxDailyCents?: number;
}

export interface PaymentInfo {
  toolName: string;
  amountCents: number;
  currency: string;
  protocol: string;
}

export interface PaymentChallenge {
  version: number;
  protocol: string;
  amount: number;
  currency: string;
  nonce: string;
  payTo: string;
  network?: string;
  token?: string;
  expiresAt: number;
}

export interface SpendingStats {
  totalCents: number;
  todayCents: number;
  callCount: number;
}

export class BudgetExceededError extends Error {
  name = "BudgetExceededError" as const;
  constructor(
    public requestedCents: number,
    public limitCents: number,
    public limitType: "maxPerCall" | "maxDaily"
  ) {
    super(`Budget exceeded: requested ${requestedCents} cents, limit is ${limitCents} cents (${limitType})`);
  }
}

export class PaymentRejectedError extends Error {
  name = "PaymentRejectedError" as const;
  constructor(public toolName: string) {
    super(`Payment rejected by approval callback for tool "${toolName}"`);
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/types.test.ts
git add src/types.ts tests/types.test.ts
git commit -m "feat: client config types and error classes"
```

---

## Task 3: Budget Tracker

**Files:** src/budget.ts, tests/budget.test.ts

- [ ] **Step 1: Write test**

```typescript
// tests/budget.test.ts
import { describe, it, expect } from "vitest";
import { BudgetTracker } from "../src/budget.js";

describe("BudgetTracker", () => {
  it("allows spending within limits", () => {
    const tracker = new BudgetTracker({ maxPerCallCents: 100, maxDailyCents: 500 });
    expect(tracker.canSpend(50)).toBe(true);
    expect(tracker.canSpend(100)).toBe(true);
    expect(tracker.canSpend(101)).toBe(false); // over per-call
  });

  it("tracks cumulative daily spend", () => {
    const tracker = new BudgetTracker({ maxDailyCents: 200 });
    tracker.recordSpend(80);
    tracker.recordSpend(80);
    expect(tracker.canSpend(80)).toBe(false); // 80+80+80 > 200
    expect(tracker.canSpend(40)).toBe(true);  // 80+80+40 = 200
  });

  it("returns spending stats", () => {
    const tracker = new BudgetTracker({});
    tracker.recordSpend(50);
    tracker.recordSpend(30);
    const stats = tracker.getStats();
    expect(stats.totalCents).toBe(80);
    expect(stats.todayCents).toBe(80);
    expect(stats.callCount).toBe(2);
  });

  it("allows unlimited when no limits set", () => {
    const tracker = new BudgetTracker({});
    expect(tracker.canSpend(999999)).toBe(true);
  });

  it("resets daily budget on new day", () => {
    const tracker = new BudgetTracker({ maxDailyCents: 100 });
    tracker.recordSpend(90);
    // Simulate day change
    (tracker as any).todayKey = "2020-01-01";
    expect(tracker.canSpend(90)).toBe(true); // new day, budget reset
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/budget.ts
import type { BudgetConfig, SpendingStats } from "./types.js";

export class BudgetTracker {
  private maxPerCallCents?: number;
  private maxDailyCents?: number;
  private totalCents = 0;
  private todayCents = 0;
  private callCount = 0;
  private todayKey: string;

  constructor(config: BudgetConfig) {
    this.maxPerCallCents = config.maxPerCallCents;
    this.maxDailyCents = config.maxDailyCents;
    this.todayKey = this.getCurrentDay();
  }

  canSpend(amountCents: number): boolean {
    if (this.maxPerCallCents !== undefined && amountCents > this.maxPerCallCents) return false;
    this.rolloverIfNewDay();
    if (this.maxDailyCents !== undefined && this.todayCents + amountCents > this.maxDailyCents) return false;
    return true;
  }

  recordSpend(amountCents: number): void {
    this.rolloverIfNewDay();
    this.totalCents += amountCents;
    this.todayCents += amountCents;
    this.callCount++;
  }

  getStats(): SpendingStats {
    this.rolloverIfNewDay();
    return { totalCents: this.totalCents, todayCents: this.todayCents, callCount: this.callCount };
  }

  private rolloverIfNewDay(): void {
    const today = this.getCurrentDay();
    if (today !== this.todayKey) {
      this.todayCents = 0;
      this.todayKey = today;
    }
  }

  private getCurrentDay(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/budget.test.ts
git add src/budget.ts tests/budget.test.ts
git commit -m "feat: budget tracker with per-call and daily limits"
```

---

## Task 4: Response Parser

**Files:** src/parser.ts, tests/parser.test.ts

- [ ] **Step 1: Write test**

```typescript
// tests/parser.test.ts
import { describe, it, expect } from "vitest";
import { parsePaymentRequired, isPaymentRequired } from "../src/parser.js";

describe("isPaymentRequired", () => {
  it("detects PAYMENT_REQUIRED in error response", () => {
    const result = {
      content: [{ type: "text", text: JSON.stringify({ error: "PAYMENT_REQUIRED", challenge: { nonce: "abc", amount: 50 } }) }],
      isError: true,
    };
    expect(isPaymentRequired(result)).toBe(true);
  });

  it("returns false for normal response", () => {
    const result = { content: [{ type: "text", text: "hello" }] };
    expect(isPaymentRequired(result)).toBe(false);
  });

  it("returns false for other errors", () => {
    const result = {
      content: [{ type: "text", text: JSON.stringify({ error: "SOME_OTHER_ERROR" }) }],
      isError: true,
    };
    expect(isPaymentRequired(result)).toBe(false);
  });
});

describe("parsePaymentRequired", () => {
  it("extracts challenge from PAYMENT_REQUIRED response", () => {
    const challenge = { version: 1, protocol: "x402", amount: 50, currency: "usd", nonce: "abc123", payTo: "0xABC", network: "base", token: "USDC", expiresAt: 9999999 };
    const result = {
      content: [{ type: "text", text: JSON.stringify({ error: "PAYMENT_REQUIRED", challenge }) }],
      isError: true,
    };
    const parsed = parsePaymentRequired(result);
    expect(parsed).toBeTruthy();
    expect(parsed!.nonce).toBe("abc123");
    expect(parsed!.amount).toBe(50);
    expect(parsed!.protocol).toBe("x402");
  });

  it("returns null for non-payment responses", () => {
    const result = { content: [{ type: "text", text: "hello" }] };
    expect(parsePaymentRequired(result)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/parser.ts
import type { PaymentChallenge } from "./types.js";

interface ToolCallResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export function isPaymentRequired(result: ToolCallResult): boolean {
  if (!result.isError) return false;
  const text = result.content?.[0]?.text;
  if (!text) return false;
  try {
    const parsed = JSON.parse(text);
    return parsed.error === "PAYMENT_REQUIRED";
  } catch { return false; }
}

export function parsePaymentRequired(result: ToolCallResult): PaymentChallenge | null {
  if (!isPaymentRequired(result)) return null;
  try {
    const parsed = JSON.parse(result.content![0].text!);
    return parsed.challenge as PaymentChallenge;
  } catch { return null; }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/parser.test.ts
git add src/parser.ts tests/parser.test.ts
git commit -m "feat: PAYMENT_REQUIRED response parser"
```

---

## Task 5: Payment Signers

**Files:** src/signers/interface.ts, src/signers/x402.ts, src/signers/stripe.ts, src/signers/mpp.ts, tests/signers.test.ts

- [ ] **Step 1: Write test**

```typescript
// tests/signers.test.ts
import { describe, it, expect } from "vitest";
import { X402Signer } from "../src/signers/x402.js";
import { StripeSigner } from "../src/signers/stripe.js";
import { MppSigner } from "../src/signers/mpp.js";
import type { PaymentChallenge } from "../src/types.js";

const mockChallenge: PaymentChallenge = {
  version: 1, protocol: "x402", amount: 50, currency: "usd",
  nonce: "abc123", payTo: "0xABC", network: "base", token: "USDC", expiresAt: Date.now() + 300000,
};

describe("X402Signer", () => {
  it("produces a signed proof string", async () => {
    const signer = new X402Signer("0x" + "ab".repeat(32));
    const proof = await signer.sign(mockChallenge);
    expect(typeof proof).toBe("string");
    expect(proof.length).toBeGreaterThan(0);
  });
});

describe("StripeSigner", () => {
  it("returns PaymentMethod ID as proof", async () => {
    const signer = new StripeSigner("pm_test_123");
    const proof = await signer.sign(mockChallenge);
    expect(proof).toBe("pm_test_123");
  });
});

describe("MppSigner", () => {
  it("returns session token as proof", async () => {
    const signer = new MppSigner("session_abc");
    const proof = await signer.sign(mockChallenge);
    expect(proof).toBe("session_abc");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/signers/interface.ts
import type { PaymentChallenge } from "../types.js";

export interface PaymentSigner {
  protocol: string;
  sign(challenge: PaymentChallenge): Promise<string>;
}
```

```typescript
// src/signers/x402.ts
import type { PaymentSigner } from "./interface.js";
import type { PaymentChallenge } from "../types.js";
import { createHmac } from "node:crypto";

export class X402Signer implements PaymentSigner {
  protocol = "x402";
  private privateKey: string;

  constructor(privateKey: string) { this.privateKey = privateKey; }

  async sign(challenge: PaymentChallenge): Promise<string> {
    // For MVP: HMAC-sign the challenge data with the private key.
    // In production, this would create an EIP-191 or EIP-712 signed
    // USDC transfer authorization. The full on-chain signing requires
    // ethers.js or viem — deferred to a future version.
    const payload = JSON.stringify({
      nonce: challenge.nonce, amount: challenge.amount,
      currency: challenge.currency, payTo: challenge.payTo,
      network: challenge.network, token: challenge.token,
    });
    return createHmac("sha256", this.privateKey).update(payload).digest("hex");
  }
}
```

```typescript
// src/signers/stripe.ts
import type { PaymentSigner } from "./interface.js";
import type { PaymentChallenge } from "../types.js";

export class StripeSigner implements PaymentSigner {
  protocol = "stripe";
  private paymentMethodId: string;

  constructor(paymentMethodId: string) { this.paymentMethodId = paymentMethodId; }

  async sign(_challenge: PaymentChallenge): Promise<string> {
    return this.paymentMethodId;
  }
}
```

```typescript
// src/signers/mpp.ts
import type { PaymentSigner } from "./interface.js";
import type { PaymentChallenge } from "../types.js";

export class MppSigner implements PaymentSigner {
  protocol = "mpp";
  private sessionToken: string;

  constructor(sessionToken: string) { this.sessionToken = sessionToken; }

  async sign(_challenge: PaymentChallenge): Promise<string> {
    return this.sessionToken;
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/signers.test.ts
git add src/signers/ tests/signers.test.ts
git commit -m "feat: payment signers for x402, stripe, mpp"
```

---

## Task 6: PaidMcpClient

**Files:** src/client.ts, src/index.ts, tests/client.test.ts

This is the main class — wraps MCP Client with payment-aware callTool.

- [ ] **Step 1: Write test**

```typescript
// tests/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PaidMcpClient } from "../src/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BudgetExceededError, PaymentRejectedError } from "../src/types.js";

// We need a test MCP server that simulates paid tools.
// It returns PAYMENT_REQUIRED on first call, then executes on retry with payment.
function createTestServer() {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  const paidNonces = new Set<string>();

  server.tool("paid-tool", {}, async (args: any) => {
    const payment = args._payment;
    if (!payment) {
      const nonce = Math.random().toString(36).slice(2);
      paidNonces.add(nonce);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "PAYMENT_REQUIRED",
            challenge: { version: 1, protocol: "x402", amount: 50, currency: "usd", nonce, payTo: "0xABC", network: "base", token: "USDC", expiresAt: Date.now() + 300000 }
          })
        }],
        isError: true,
      };
    }
    // Payment attached — verify nonce exists and execute
    if (paidNonces.has(payment.nonce)) {
      paidNonces.delete(payment.nonce);
      return { content: [{ type: "text" as const, text: "paid result" }] };
    }
    return { content: [{ type: "text" as const, text: "invalid payment" }], isError: true };
  });

  server.tool("free-tool", {}, async () => {
    return { content: [{ type: "text" as const, text: "free result" }] };
  });

  server.tool("expensive-tool", {}, async (args: any) => {
    if (!args._payment) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "PAYMENT_REQUIRED",
            challenge: { version: 1, protocol: "x402", amount: 10000, currency: "usd", nonce: "exp1", payTo: "0xABC", network: "base", token: "USDC", expiresAt: Date.now() + 300000 }
          })
        }],
        isError: true,
      };
    }
    return { content: [{ type: "text" as const, text: "expensive result" }] };
  });

  return server;
}

describe("PaidMcpClient", () => {
  let client: PaidMcpClient;
  let testServer: McpServer;

  beforeEach(async () => {
    testServer = createTestServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new PaidMcpClient({
      walletPrivateKey: "0x" + "ab".repeat(32),
      budget: { maxPerCallCents: 500, maxDailyCents: 2000 },
    });

    await Promise.all([
      client.connect(clientTransport),
      testServer.connect(serverTransport),
    ]);
  });

  it("passes through free tools unchanged", async () => {
    const result = await client.callTool({ name: "free-tool", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("free result");
  });

  it("auto-pays for paid tools transparently", async () => {
    const result = await client.callTool({ name: "paid-tool", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("paid result");
  });

  it("tracks spending after payment", async () => {
    await client.callTool({ name: "paid-tool", arguments: {} });
    const stats = client.getSpendingStats();
    expect(stats.totalCents).toBe(50);
    expect(stats.callCount).toBe(1);
  });

  it("throws BudgetExceededError when over per-call limit", async () => {
    await expect(
      client.callTool({ name: "expensive-tool", arguments: {} })
    ).rejects.toThrow(BudgetExceededError);
  });

  it("calls onPaymentRequired callback", async () => {
    let callbackCalled = false;
    const clientWithCallback = new PaidMcpClient({
      walletPrivateKey: "0x" + "ab".repeat(32),
      onPaymentRequired: async (info) => {
        callbackCalled = true;
        expect(info.toolName).toBe("paid-tool");
        expect(info.amountCents).toBe(50);
        return true;
      },
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server2 = createTestServer();
    await Promise.all([clientWithCallback.connect(ct), server2.connect(st)]);

    await clientWithCallback.callTool({ name: "paid-tool", arguments: {} });
    expect(callbackCalled).toBe(true);
  });

  it("throws PaymentRejectedError when callback returns false", async () => {
    const rejectClient = new PaidMcpClient({
      walletPrivateKey: "0x" + "ab".repeat(32),
      onPaymentRequired: async () => false,
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server2 = createTestServer();
    await Promise.all([rejectClient.connect(ct), server2.connect(st)]);

    await expect(
      rejectClient.callTool({ name: "paid-tool", arguments: {} })
    ).rejects.toThrow(PaymentRejectedError);
  });
});
```

- [ ] **Step 2: Implement src/client.ts**

```typescript
// src/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { PaidClientConfig, PaymentChallenge, SpendingStats } from "./types.js";
import { BudgetExceededError, PaymentRejectedError } from "./types.js";
import { BudgetTracker } from "./budget.js";
import { isPaymentRequired, parsePaymentRequired } from "./parser.js";
import type { PaymentSigner } from "./signers/interface.js";
import { X402Signer } from "./signers/x402.js";
import { StripeSigner } from "./signers/stripe.js";
import { MppSigner } from "./signers/mpp.js";

export class PaidMcpClient {
  private client: Client;
  private budget: BudgetTracker;
  private signers: Map<string, PaymentSigner>;
  private onPaymentRequired?: (info: { toolName: string; amountCents: number; currency: string; protocol: string }) => Promise<boolean>;

  constructor(config: PaidClientConfig) {
    this.client = new Client({ name: "agentic-mcp-pay-client", version: "0.1.0" });
    this.budget = new BudgetTracker(config.budget ?? {});
    this.onPaymentRequired = config.onPaymentRequired;

    this.signers = new Map();
    if (config.walletPrivateKey) {
      this.signers.set("x402", new X402Signer(config.walletPrivateKey));
    }
    if (config.stripePaymentMethodId) {
      this.signers.set("stripe", new StripeSigner(config.stripePaymentMethodId));
    }
    if (config.mppSessionToken) {
      this.signers.set("mpp", new MppSigner(config.mppSessionToken));
    }
  }

  async connect(transport: Transport): Promise<void> {
    await this.client.connect(transport);
  }

  async callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<any> {
    const result = await this.client.callTool(params);

    if (!isPaymentRequired(result)) {
      return result;
    }

    // Parse challenge
    const challenge = parsePaymentRequired(result);
    if (!challenge) return result;

    // Check budget
    if (!this.budget.canSpend(challenge.amount)) {
      const config = this.budget as any;
      const limit = config.maxPerCallCents !== undefined && challenge.amount > config.maxPerCallCents
        ? config.maxPerCallCents : config.maxDailyCents;
      throw new BudgetExceededError(
        challenge.amount,
        limit ?? 0,
        challenge.amount > (config.maxPerCallCents ?? Infinity) ? "maxPerCall" : "maxDaily"
      );
    }

    // Approval callback
    if (this.onPaymentRequired) {
      const approved = await this.onPaymentRequired({
        toolName: params.name,
        amountCents: challenge.amount,
        currency: challenge.currency,
        protocol: challenge.protocol,
      });
      if (!approved) throw new PaymentRejectedError(params.name);
    }

    // Find signer
    const signer = this.signers.get(challenge.protocol);
    if (!signer) {
      // No signer for this protocol — return original error
      return result;
    }

    // Sign payment
    const proof = await signer.sign(challenge);

    // Retry with payment
    const retryResult = await this.client.callTool({
      name: params.name,
      arguments: {
        ...(params.arguments ?? {}),
        _payment: { nonce: challenge.nonce, proof, protocol: challenge.protocol },
      },
    });

    // Record spend
    this.budget.recordSpend(challenge.amount);

    return retryResult;
  }

  getSpendingStats(): SpendingStats {
    return this.budget.getStats();
  }
}
```

- [ ] **Step 3: Update src/index.ts**

```typescript
// src/index.ts
export { PaidMcpClient } from "./client.js";
export { BudgetExceededError, PaymentRejectedError } from "./types.js";
export type { PaidClientConfig, BudgetConfig, PaymentInfo, SpendingStats } from "./types.js";
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/ tests/
git commit -m "feat: PaidMcpClient with auto-pay, budget controls, and approval callbacks"
```

---

## Task 7: README + LICENSE + Publish

**Files:** README.md, LICENSE, package.json

- [ ] **Step 1: Create README.md**

Quickstart showing PaidMcpClient usage, budget controls, supported protocols, spending stats.

- [ ] **Step 2: Create LICENSE**

MIT, Quinn Ye, 2026.

- [ ] **Step 3: Build, test, publish**

```bash
npm run build && npm test
git add -A && git commit -m "docs: README and LICENSE"
gh repo create agentic-mcp-pay-client --public --description "Client SDK for paid MCP tools — auto-pay, budget controls, multi-protocol" --source . --push
npm publish --access public
```
