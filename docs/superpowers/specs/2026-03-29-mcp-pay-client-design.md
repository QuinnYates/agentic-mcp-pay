# MCP Pay Client SDK — Design Spec

**Date:** 2026-03-29
**Package name:** agentic-mcp-pay-client

## Problem

MCP tool consumers (AI agents) have no standard way to handle paid tools. When a tool returns PAYMENT_REQUIRED, the agent must manually parse the challenge, sign a payment, and retry. No budget controls exist.

## Solution

An npm package that wraps the standard MCP Client with automatic payment handling. When a tool call returns PAYMENT_REQUIRED, the client auto-detects it, checks budget, optionally calls an approval callback, signs the payment, and retries — all transparently.

## Developer API

```typescript
import { PaidMcpClient } from "agentic-mcp-pay-client";

const client = new PaidMcpClient({
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
  budget: { maxPerCallCents: 100, maxDailyCents: 5000 },
  onPaymentRequired: async (info) => {
    console.log(`"${info.toolName}" costs $${info.amountCents / 100}`);
    return true;
  },
  stripePaymentMethodId: "pm_...",
});

await client.connect(transport);
const result = await client.callTool({ name: "my-tool", arguments: {} });
console.log(client.getSpendingStats());
```

## Architecture

```
PaidMcpClient wraps MCP Client
    │
    callTool()
    │
    ▼
Forward to real Client.callTool()
    │
    ▼
Is response PAYMENT_REQUIRED?
  NO → return result
  YES ↓
    │
Check budget (maxPerCall, maxDaily)
  OVER BUDGET → throw BudgetExceededError
  OK ↓
    │
Call onPaymentRequired callback (if set)
  REJECTED → throw PaymentRejectedError
  APPROVED ↓
    │
Sign payment via protocol signer
  x402 → sign with wallet private key
  stripe → attach PaymentMethod ID
  mpp → attach session token
    │
    ▼
Retry callTool with _payment proof
    │
    ▼
Track spending, return result + receipt
```

## Core Components

### PaidMcpClient
- Wraps `Client` from `@modelcontextprotocol/sdk`
- Delegates all non-payment methods directly
- Overrides `callTool()` with payment-aware wrapper
- Exposes `connect()`, `callTool()`, `getSpendingStats()`, `resetDailyBudget()`

### BudgetTracker
- In-memory spend tracking (resets on restart)
- `canSpend(amountCents)` checks both per-call and daily limits
- `recordSpend(amountCents)` updates totals
- `getStats()` returns { totalCents, todayCents, callCount }
- Daily reset based on Date boundary

### Protocol Signers
Each protocol needs a different signing mechanism:
- **x402**: Sign a USDC transfer authorization using the wallet private key (via @noble/curves for secp256k1 signing). For MVP, we send the private key's signed approval as proof.
- **stripe**: The proof is just the PaymentMethod ID — Stripe gateway creates the PaymentIntent server-side.
- **mpp**: The proof is a session authorization token.

### Response Parser
- Detects PAYMENT_REQUIRED from tool call responses
- Parses challenge JSON from isError content
- Extracts nonce, amount, protocol options

## Security Model

1. **Private key in memory only** — passed via env var, never logged or persisted
2. **Budget enforcement is local** — defense against runaway spending
3. **Approval callback** — human-in-the-loop for large payments
4. **No auto-retry loops** — one retry per call (prevents infinite payment loops)
5. **Amount validation** — client checks challenge amount against budget before signing

## Project Structure

```
agentic-mcp-pay-client/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # exports PaidMcpClient
│   ├── client.ts             # PaidMcpClient class
│   ├── budget.ts             # BudgetTracker
│   ├── parser.ts             # Response parser (detect PAYMENT_REQUIRED)
│   ├── signers/
│   │   ├── interface.ts      # PaymentSigner interface
│   │   ├── x402.ts           # x402 wallet signer
│   │   ├── stripe.ts         # Stripe PaymentMethod signer
│   │   └── mpp.ts            # MPP session signer
│   └── types.ts              # Config types, errors
├── tests/
│   ├── budget.test.ts
│   ├── parser.test.ts
│   ├── client.test.ts
│   └── signers.test.ts
├── README.md
└── LICENSE
```

## Out of Scope
- Wallet creation / key management
- Fiat on-ramps
- Persistent spend tracking (database)
- Multi-wallet management
