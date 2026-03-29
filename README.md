# agentic-mcp-pay

[![npm](https://img.shields.io/npm/v/agentic-mcp-pay)](https://npmjs.com/package/agentic-mcp-pay)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Tests](https://img.shields.io/badge/tests-72%20passing-brightgreen)

**Payment gateway for MCP servers — monetize your tools with one wrapper**

Wrap any [Model Context Protocol](https://modelcontextprotocol.io) server with payment enforcement. Agents call your tools normally; the gateway intercepts, issues a payment challenge, verifies the proof, then executes. One function. No protocol lock-in.

## Install

```bash
npm install agentic-mcp-pay
```

Requires Node.js 18+.

## Quickstart

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPayments } from "agentic-mcp-pay";

const server = new McpServer({ name: "my-tools", version: "1.0.0" });

server.tool("analyze-data", {}, async (args) => {
  return { content: [{ type: "text", text: "analysis result" }] };
});

const { server: paidServer, cleanup, dashboardUrl } = withPayments(server, {
  pricing: {
    "analyze-data": { amount: 0.50, currency: "usd" },
  },
  payTo: "0xYourWalletAddress",
  protocols: ["x402"],
  dashboard: { port: 3100 },
});

// Connect to transport as normal
// paidServer.connect(transport);
```

## Supported Protocols

| Protocol | Description |
|----------|-------------|
| **x402** | Stablecoin micropayments (USDC on Base) via Coinbase facilitator |
| **mpp** | Machine Payments Protocol (Stripe/Tempo) |
| **stripe** | Traditional card payments via Stripe PaymentIntents |
| **mock** | In-memory stub for testing — always verifies |

## How It Works

```
Agent calls tool
      │
      ▼
Gateway checks pricing table
      │
      ├─ No price set ──────────────────► Execute immediately (passthrough)
      │
      ├─ No _payment arg ───────────────► Return PAYMENT_REQUIRED + challenge
      │
      └─ _payment arg present
              │
              ▼
         Verify with protocol adapter
              │
              ├─ Invalid / expired ─────► Return PAYMENT_INVALID / PAYMENT_EXPIRED
              ├─ Replay detected ───────► Return PAYMENT_REPLAY
              ├─ Underpaid ─────────────► Return PAYMENT_UNDERPAID
              │
              └─ Verified ──────────────► Execute tool, return result + receipt
```

1. Agent calls your tool without a `_payment` argument.
2. Gateway returns a `PAYMENT_REQUIRED` error with a signed challenge (nonce, amount, payTo address, expiry).
3. Agent submits payment on-chain / via API and retries the tool call with `_payment` set to the proof.
4. Gateway verifies the proof against the protocol adapter, checks replay protection, and executes.
5. Result is returned with a `_receipt` block appended to the content array.

The `_payment` argument is stripped from `args` before your handler is called — your tool code sees clean arguments.

## Dashboard

When `dashboard.port` is set, a local dashboard starts at `http://127.0.0.1:<port>/?token=<bearer>`. The URL (with token) is returned as `dashboardUrl`.

The dashboard shows:
- Total earnings and transaction count
- Per-tool revenue breakdown
- Recent transaction log with status, amount, and protocol

Access requires the bearer token in the query string. The token is generated fresh on each process start.

## Configuration

All options for `McpPayConfig`:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pricing` | `Record<string, ToolPricing>` | Yes | — | Map of tool name → `{ amount, currency }`. Tools not in this map pass through free. |
| `payTo` | `string` | Yes | — | Destination address for payments (Ethereum address or Stripe account ID depending on protocol). |
| `protocols` | `string[]` | Yes | — | Ordered list of protocols to enable: `"x402"`, `"mpp"`, `"stripe"`, `"mock"`. |
| `dashboard` | `{ port: number }` | No | disabled | Starts the local dashboard on `127.0.0.1:<port>`. |
| `dbPath` | `string` | No | `":memory:"` | SQLite path for challenge and transaction storage. Use a file path for persistence across restarts. |
| `challengeTtlMs` | `number` | No | `300000` | How long a payment challenge is valid (ms). Default: 5 minutes. |
| `facilitatorUrl` | `string` | No | `https://x402.org/facilitator` | Override the x402 facilitator endpoint. |
| `mppApiUrl` | `string` | No | `https://mpp.dev/api/verify` | Override the MPP verification endpoint. |
| `stripeSecretKey` | `string` | No | `MCP_PAY_STRIPE_SECRET` env | Stripe secret key. Falls back to the environment variable if not set in config. |

`ToolPricing`:

| Field | Type | Description |
|-------|------|-------------|
| `amount` | `number` | Price in major currency units (e.g. `0.50` = 50 cents USD). |
| `currency` | `string` | ISO 4217 currency code (e.g. `"usd"`). |

## Security

**Verify before execute.** The gateway never calls your tool handler until the payment proof has passed verification with the protocol adapter. An invalid, expired, or replayed proof returns an error immediately.

**No private keys.** `agentic-mcp-pay` holds no signing keys. Payment is the agent's responsibility; the gateway only verifies proofs.

**Replay protection.** Every verified transaction hash is stored in SQLite. A second attempt with the same proof returns `PAYMENT_REPLAY`.

**Nonce + expiry.** Each challenge includes a cryptographically random nonce and an `expiresAt` timestamp. The gateway rejects proofs against expired challenges. Expired challenges are purged from storage every 60 seconds.

**Circuit breaker.** Tools with no entry in `pricing` are passed through unconditionally — they are never gated. This is intentional: free tools stay free without any configuration change.

**Dashboard is localhost-only.** The dashboard binds to `127.0.0.1` and requires a bearer token. It is never exposed on `0.0.0.0`.

## License

MIT

---

## See Also

- [agentic-mcp-pay-client](https://github.com/QuinnYates/agentic-mcp-pay-client) — buyer SDK: transparent auto-pay, budget controls, multi-protocol
- [agentic-mcp-pay-demo](https://github.com/QuinnYates/agentic-mcp-pay-demo) — full end-to-end demo of the payment loop
- [Tutorial: Monetise your MCP tool in 5 minutes](https://gist.github.com/QuinnYates/agentic-mcp-pay-tutorial)
