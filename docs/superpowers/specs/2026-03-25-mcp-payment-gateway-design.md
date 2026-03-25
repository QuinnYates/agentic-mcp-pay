# MCP Payment Gateway — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Working name:** mcp-pay

## Problem

MCP tool developers have no standard way to monetize their tools. The only existing solution (Vercel's x402-mcp) supports a single payment protocol (x402/USDC). There is no multi-protocol payment middleware for MCP servers, and no earnings visibility for tool developers.

## Solution

An npm package that wraps any MCP server with per-tool payment gating. One import, one wrapper call. The library intercepts tool calls, requires payment before execution, verifies payment on-chain, and logs transactions locally. Ships with an optional embedded dashboard for earnings visibility.

## Approach

Hybrid library + optional dashboard (Approach C from brainstorming). The library is the core value; the dashboard is a second milestone. Payment protocols are plugins — ship x402 first, add MPP and Stripe later.

## Developer API

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server";
import { withPayments } from "mcp-pay";

const server = new McpServer({ name: "my-tools", version: "1.0.0" });

server.tool("format-manuscript", { /* input schema */ }, async (args) => {
  return { content: [{ type: "text", text: "formatted result" }] };
});

const paidServer = withPayments(server, {
  pricing: {
    "format-manuscript": { amount: 0.50, currency: "usd" },
    "check-compliance":  { amount: 0.02, currency: "usd" },
  },
  payTo: "0xYourWalletAddress",
  protocols: ["x402"],
  dashboard: { port: 3100 },  // optional
});

paidServer.listen();
```

Tools not listed in `pricing` remain free and pass through without payment checks.

## Architecture

```
                          mcp-pay
┌─────────────────────────────────────────────────┐
│                                                   │
│  Agent ──► MCP Transport (stdio/SSE/HTTP)         │
│                │                                   │
│                ▼                                   │
│        ┌──────────────┐                           │
│        │ Payment Gate  │  ← intercepts tool calls │
│        │              │                           │
│        │ 1. Is this a │  NO ──► pass through      │
│        │    paid tool? │                           │
│        │              │                           │
│        │ 2. Has agent  │  NO ──► return error +   │
│        │    paid?      │        payment options    │
│        │              │                           │
│        │ 3. Verify     │  FAIL ► reject           │
│        │    payment    │                           │
│        │              │                           │
│        │ 4. Execute    │  OK ──► return result    │
│        │    real tool  │        + receipt          │
│        └──────────────┘                           │
│                │                                   │
│                ▼                                   │
│        ┌──────────────┐                           │
│        │ Meter + Log   │ ──► SQLite (local)       │
│        └──────────────┘                           │
│                │                                   │
│                ▼                                   │
│        ┌──────────────┐                           │
│        │ Dashboard     │ ──► localhost:3100        │
│        │ (optional)    │                           │
│        └──────────────┘                           │
└─────────────────────────────────────────────────┘
```

## Payment Flow

```
Agent                          Gateway                    x402 Facilitator
  │                               │                            │
  │  1. callTool("format-ms")     │                            │
  │  (no payment attached)        │                            │
  │──────────────────────────────►│                            │
  │                               │                            │
  │  2. Error: PAYMENT_REQUIRED   │                            │
  │  {                            │                            │
  │    amount: 0.50,              │                            │
  │    currency: "usd",           │                            │
  │    protocols: [{              │                            │
  │      type: "x402",            │                            │
  │      network: "base",         │                            │
  │      token: "USDC",           │                            │
  │      payTo: "0xABC..."        │                            │
  │    }],                        │                            │
  │    nonce: "unique-challenge"  │                            │
  │  }                            │                            │
  │◄──────────────────────────────│                            │
  │                               │                            │
  │  3. callTool("format-ms")     │                            │
  │  + payment signature          │                            │
  │──────────────────────────────►│                            │
  │                               │  4. Verify signature       │
  │                               │───────────────────────────►│
  │                               │                            │
  │                               │  5. Valid + settled         │
  │                               │◄───────────────────────────│
  │                               │                            │
  │                               │  6. Execute real tool       │
  │                               │  7. Log transaction         │
  │                               │                            │
  │  8. Result + receipt          │                            │
  │◄──────────────────────────────│                            │
```

### Step details

1. Agent calls a paid tool without payment metadata.
2. Gateway returns a structured MCP error containing payment instructions, accepted protocols, and a unique nonce (challenge).
3. Agent signs a payment (via its own wallet) and retries the tool call with the payment signature attached in the tool call arguments.
4. Gateway sends the signature to the x402 facilitator for verification and on-chain settlement.
5. Facilitator confirms: payment is valid, amount matches, nonce matches, funds settled.
6. Gateway executes the real tool handler.
7. Transaction is logged to SQLite (append-only).
8. Agent receives the tool result plus a receipt (tx hash, amount, timestamp).

## Payment Protocol Plugin Interface

```typescript
interface PaymentProtocol {
  /** Protocol identifier (e.g., "x402", "mpp", "stripe") */
  name: string;

  /** Generate payment instructions for the agent. Amount is in minor currency units (cents). */
  createChallenge(tool: string, amountCents: number, currency: string, payTo: string): PaymentChallenge;

  /** Verify the agent's payment is real and settled */
  verifyPayment(challenge: PaymentChallenge, proof: string): Promise<VerificationResult>;
}

interface PaymentChallenge {
  version: number;       // protocol version (starts at 1)
  protocol: string;
  amount: number;        // in minor currency units (cents), e.g. 50 = $0.50
  currency: string;
  nonce: string;         // unique per request, prevents replay
  payTo: string;         // recipient address
  network?: string;      // blockchain network (e.g., "base")
  token?: string;        // token symbol (e.g., "USDC")
  expiresAt: number;     // unix timestamp — challenge expires
}

interface VerificationResult {
  verified: boolean;
  txHash?: string;       // on-chain transaction hash
  confirmations?: number; // number of block confirmations
  error?: string;        // reason for failure
  errorCode?: string;    // machine-readable error code
}
```

### Protocol priority

1. **x402** — MVP. Stablecoin micropayments via Coinbase facilitator. Live SDKs.
2. **MPP** — Milestone 2. Stripe-based, supports fiat cards + crypto. Session model.
3. **Stripe** — Milestone 3. Traditional card payments for higher-value tools.

Protocol fallback applies at the **challenge stage only** — the gateway offers the agent multiple payment options in the PAYMENT_REQUIRED response. Once the agent submits proof for a specific protocol, verification either succeeds or fails for that protocol. The gateway does NOT fall through to another protocol on a failed verification (this would allow attackers to submit garbage proofs and exploit weaker protocols).

## Data & Storage

### File layout

```
~/.mcp-pay/
├── config.yaml          # pricing, wallet address, protocol settings
├── transactions.db      # SQLite — all payment records
└── logs/
    └── 2026-03-25.log   # daily structured log files
```

### SQLite schema — transactions table

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | TEXT (UUID) | PRIMARY KEY | Unique transaction identifier |
| `tool_name` | TEXT | NOT NULL | Which tool was called |
| `amount_cents` | INTEGER | NOT NULL | Amount in minor currency units (e.g., 50 = $0.50) |
| `currency` | TEXT | NOT NULL | Currency code (e.g., "usd") |
| `protocol` | TEXT | NOT NULL | Payment protocol used (x402/mpp/stripe) |
| `payer_address` | TEXT | | Agent's wallet or payment identifier |
| `tx_hash` | TEXT | | On-chain transaction hash (proof of payment) |
| `nonce` | TEXT | UNIQUE, NOT NULL | Challenge nonce — UNIQUE constraint enforces atomic replay protection |
| `status` | TEXT | NOT NULL | verified / failed / refunded |
| `created_at` | TEXT (ISO 8601) | NOT NULL | Timestamp |

**Nonce atomicity:** The `UNIQUE` constraint on `nonce` means insertion uses `INSERT ... ON CONFLICT(nonce) DO NOTHING` as a single atomic operation. If two concurrent requests attempt the same nonce, only one succeeds. This prevents double-spend via race condition.

**Integer amounts:** All amounts are stored as integers in the smallest currency unit (cents for USD). This avoids floating-point rounding errors. The API surface accepts decimal amounts (e.g., `0.50`) and converts internally.

### SQLite schema — challenges table

Pending challenges are tracked separately (not in the transactions table) to enforce expiration and enable cleanup.

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| `nonce` | TEXT | PRIMARY KEY | Challenge nonce |
| `tool_name` | TEXT | NOT NULL | Which tool this challenge is for |
| `amount_cents` | INTEGER | NOT NULL | Expected payment amount |
| `currency` | TEXT | NOT NULL | Currency code |
| `protocol` | TEXT | NOT NULL | Which protocol was offered |
| `expires_at` | TEXT (ISO 8601) | NOT NULL | When this challenge expires |
| `created_at` | TEXT (ISO 8601) | NOT NULL | When issued |
| `used` | INTEGER | NOT NULL DEFAULT 0 | 1 if consumed, prevents reuse |

**Expiration enforcement:** Challenges are validated against `expires_at` from the database, not from memory. This survives server restarts. A periodic cleanup job removes expired challenges older than 1 hour.

### Schema versioning

Migrations tracked in a `schema_version` table. Each migration is a numbered SQL file applied in order on startup. This ensures the database can evolve across npm package updates without data loss.

## Dashboard

Optional embedded web UI. Activated by passing `dashboard: { port: 3100 }` in config.

### Pages

- **Overview** — total earnings, transaction count, earnings by period (today / week / month)
- **Transactions** — searchable/filterable table with links to block explorer for each tx hash
- **Per-tool breakdown** — which tools earn the most, call volume, average payment

### Implementation

- Express server bound to `127.0.0.1` (localhost only)
- Server-rendered HTML templates (no frontend framework — keep it minimal)
- Reads directly from SQLite (read-only queries)
- Authentication via randomly-generated bearer token, printed to stdout on startup. Required as a query parameter (`?token=...`) on all dashboard requests. This blocks casual local access and mitigates DNS rebinding attacks.

## Security Model

### Principles

1. **Verify before execute.** The tool handler NEVER runs until the facilitator confirms payment is settled on-chain. No optimistic execution.
2. **No private keys.** The gateway only stores the developer's receiving wallet address (public). No signing keys, no seed phrases, no secrets in config files.
3. **Facilitator as trust anchor.** The gateway never verifies payments itself. It delegates to the x402 facilitator (Coinbase-hosted or self-hosted), which checks the blockchain.
4. **Replay protection.** Every payment challenge includes a cryptographically random nonce (32 bytes, crypto.randomBytes). Nonces are stored in SQLite and checked for uniqueness. A payment signature bound to nonce X cannot be reused.
5. **Challenge expiration.** Payment challenges expire after a configurable TTL (default: 5 minutes). Expired challenges are rejected even if the signature is valid.
6. **Amount verification.** The gateway independently checks that the payment amount matches the configured price. An agent cannot underpay by modifying the payment.
7. **Input sanitization.** All tool call arguments and payment metadata are validated against schemas before processing. No raw user input reaches the tool handler or database queries.
8. **File permissions.** SQLite database, config files, and log files all created with `0600` (owner read/write only).
9. **No secrets in config.** API keys for future protocols (e.g., Stripe secret key) are read from environment variables only, never stored in config.yaml.
10. **Append-only audit trail.** Transaction records are never updated or deleted. Full history preserved for dispute resolution.
11. **Localhost-only dashboard.** Dashboard binds to `127.0.0.1`, not `0.0.0.0`. Not network-accessible by default.
12. **Dependency minimalism.** Minimize npm dependencies to reduce supply chain attack surface. Prefer Node.js built-ins (crypto, fs, path) over third-party packages where possible.
13. **Rate limiting on challenges.** Challenge generation is rate-limited per caller (by IP or transport identity) to prevent DoS via unbounded nonce accumulation. Pending challenges are stored in memory with TTL; only written to SQLite on successful payment verification. Expired in-memory challenges are garbage-collected periodically.
14. **Settlement confirmation.** "Settled" means the facilitator has confirmed the transaction is finalized on-chain (not pending). For Base L2, this is near-instant (~2s). The gateway treats "pending" as "not settled" — tools do not execute on unconfirmed transactions. The `VerificationResult` includes a `confirmations` field for auditability.
15. **Facilitator health monitoring.** The gateway tracks facilitator availability. After 3 consecutive failures, the protocol is marked temporarily unavailable (circuit breaker, 60s cooldown). Agents receive a clear error: `VERIFICATION_UNAVAILABLE` with retry guidance. Failures are logged with timestamps.
16. **Wallet address validation.** The `payTo` address is validated at startup as a well-formed checksummed Ethereum address (EIP-55). The gateway fails loudly with a clear error if the address is invalid — preventing silent payment loss to unrecoverable addresses.

### Threat model

| Threat | Mitigation |
|---|---|
| Agent submits fake payment signature | Facilitator verifies on-chain; gateway never trusts client |
| Agent replays a previous valid payment | Nonce uniqueness check in SQLite |
| Agent underpays (modifies amount) | Gateway checks amount against configured price |
| Attacker reads wallet keys from config | No private keys stored — only public receiving address |
| Attacker reads secrets from config file | Secrets in env vars only; config file has 0600 permissions |
| Attacker accesses dashboard remotely | Localhost-only binding (127.0.0.1) |
| Malicious tool input | Schema validation before handler execution |
| SQL injection via payment metadata | Parameterized queries only; no string concatenation in SQL |
| Supply chain attack via npm dependency | Minimize dependencies; audit before adding |
| Challenge replay after expiration | TTL enforcement; expired challenges rejected |
| DoS via challenge flooding (no payment) | Rate limiting per caller; in-memory challenge storage with TTL; periodic GC |
| DNS rebinding attacks on dashboard | Bearer token required on all dashboard requests |
| Payment confirmed but not settled (chain reorg) | Gateway requires facilitator to confirm finalized settlement, not just validity |
| Facilitator goes down | Circuit breaker marks protocol unavailable after 3 failures; clear error to agent |
| Typo in payTo wallet address | EIP-55 checksum validation at startup; fail loudly |
| Attacker pays and claims different identity | Accepted risk for MVP — caller identity is not verified (see Caller Identity below) |

### Caller identity (accepted MVP limitation)

The gateway has no concept of who the calling agent is. The `payer_address` is captured from the payment proof, but there is nothing preventing an agent from paying with one wallet and claiming to be a different agent, or a middleman intercepting the challenge. For the MVP this is accepted — the tool developer gets paid regardless of who the caller claims to be. Future milestones (especially Stripe integration) will require caller authentication.

### Error codes

Machine-readable error codes for agents to act on programmatically:

| Code | Meaning |
|---|---|
| `PAYMENT_REQUIRED` | Tool requires payment; challenge attached |
| `PAYMENT_INVALID` | Payment signature is invalid or tampered |
| `PAYMENT_EXPIRED` | Challenge nonce has expired |
| `PAYMENT_UNDERPAID` | Payment amount is less than tool price |
| `PAYMENT_REPLAY` | Nonce has already been used |
| `VERIFICATION_UNAVAILABLE` | Facilitator is down; retry later |
| `PROTOCOL_UNSUPPORTED` | Agent submitted proof for an unconfigured protocol |

## Config Precedence

The `withPayments()` constructor is the programmatic API. `~/.mcp-pay/config.yaml` is the external/CLI config for standalone usage. When both are present, **constructor arguments override config file values**. Environment variables override both for secrets (e.g., `MCP_PAY_STRIPE_SECRET`).

Precedence: env vars > constructor args > config.yaml

## Testing Strategy

- **Unit tests** use a mock facilitator that simulates x402 verification responses (success, failure, timeout) without hitting the blockchain.
- **Integration tests** use Base Sepolia testnet with test USDC for end-to-end payment flows.
- **CI/CD** runs unit tests only (no testnet dependency). Integration tests run manually or on-demand.

## Project Structure

```
mcp-pay/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # exports withPayments()
│   ├── gate.ts               # payment gate — intercepts tool calls
│   ├── pricing.ts            # pricing config + amount matching
│   ├── protocols/
│   │   ├── interface.ts      # PaymentProtocol interface
│   │   └── x402.ts           # x402 adapter
│   ├── storage/
│   │   ├── sqlite.ts         # transaction logging + nonce tracking
│   │   └── migrations.ts     # schema versioning
│   ├── dashboard/
│   │   ├── server.ts         # express server (localhost)
│   │   └── views/            # HTML templates
│   └── security/
│       ├── nonce.ts          # nonce generation + uniqueness
│       ├── validate.ts       # input sanitization + amount checks
│       └── permissions.ts    # file permission enforcement
├── tests/
│   ├── gate.test.ts          # payment gating logic
│   ├── x402.test.ts          # x402 protocol adapter
│   ├── nonce.test.ts         # replay protection
│   ├── validate.test.ts      # input validation
│   └── dashboard.test.ts     # dashboard endpoints
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-03-25-mcp-payment-gateway-design.md
```

## Milestones

### M1 — Core library with x402 (MVP)
- `withPayments()` wrapper
- Payment gate (intercept, challenge, verify, execute)
- x402 protocol adapter
- SQLite transaction logging
- Nonce-based replay protection
- Input validation + amount verification
- Tests

### M2 — Dashboard
- Embedded Express dashboard (localhost)
- Overview, transactions, per-tool breakdown pages
- Block explorer links for tx hashes

### M3 — MPP protocol adapter
- MPP session-based payments
- Stripe settlement integration
- Fiat card support via Shared Payment Tokens

### M4 — Stripe protocol adapter
- Direct Stripe PaymentIntents for higher-value tools
- Webhook verification

### M5 — npm publish + documentation
- Public npm package
- README with quickstart
- API reference docs

## Out of Scope (for now)

- Hosted/cloud version (SaaS)
- Multi-tenant support
- User authentication on dashboard
- Subscription/recurring payment models
- Agent-side client SDK (agents bring their own x402 client)
- Refund automation
- Dynamic pricing (price changes per request)
