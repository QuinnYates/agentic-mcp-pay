# How to Monetize Your MCP Tools in 5 Minutes

You built an MCP tool. Agents use it. But you're not getting paid. Here's how to add per-use pricing in one line of code.

---

## The Problem

MCP tools are free by default. There's no standard charging mechanism built into the protocol — your tool runs, the agent gets the result, and you get nothing.

You could roll your own payment gate: integrate x402 for stablecoin micropayments, wire up Stripe for card payments, implement MPP for Stripe/Tempo flows, handle challenge/verify/replay-protection logic yourself. That's weeks of work, and you'd need to redo it for every tool you build.

**There's a better way.**

---

## The Solution — `agentic-mcp-pay`

One npm package. One wrapper function. Your existing MCP server becomes a paid API in minutes.

**Before:**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "my-tools", version: "1.0.0" });

server.tool("analyze-sentiment", { text: z.string() }, async ({ text }) => {
  const result = await runSentimentModel(text);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**After:**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { withPayments } from "agentic-mcp-pay";

const server = new McpServer({ name: "my-tools", version: "1.0.0" });

server.tool("analyze-sentiment", { text: z.string() }, async ({ text }) => {
  const result = await runSentimentModel(text);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

// Add this ↓
const { server: paidServer } = withPayments(server, {
  pricing: { "analyze-sentiment": { amount: 0.02, currency: "usd" } },
  payTo: "0xYourWalletAddress",
  protocols: ["x402"],
});

const transport = new StdioServerTransport();
await paidServer.connect(transport);
```

That's it. Your tool now requires payment before it executes.

---

## Step-by-Step Setup

### 1. Install

```bash
npm install agentic-mcp-pay
```

Requires Node.js 18+.

### 2. Import and wrap your server

```typescript
import { withPayments } from "agentic-mcp-pay";

const { server: paidServer, cleanup, dashboardUrl } = withPayments(server, config);
```

`withPayments` returns:
- `server` — your wrapped MCP server (connect this to your transport)
- `cleanup` — call this on process exit to shut down the dashboard and flush storage
- `dashboardUrl` — the dashboard URL with bearer token, if you enabled it

### 3. Configure pricing per tool

Tools not listed in `pricing` pass through free — no accidental gating of tools you want to keep public.

```typescript
pricing: {
  "analyze-sentiment":  { amount: 0.02,  currency: "usd" },  // $0.02 per call
  "generate-report":    { amount: 0.50,  currency: "usd" },  // $0.50 per call
  "deep-research":      { amount: 2.00,  currency: "usd" },  // $2.00 per call
  // "health-check" is not listed — stays free
}
```

### 4. Set your wallet address

For x402 (stablecoin payments on Base), set an Ethereum address:

```typescript
payTo: "0xYourEthereumAddress"
```

For Stripe-based protocols (MPP or stripe), set your Stripe account or destination ID.

### 5. Choose payment protocol(s)

```typescript
protocols: ["x402"]           // stablecoins only
protocols: ["x402", "mpp"]    // stablecoins + Stripe/Tempo
protocols: ["x402", "stripe"] // stablecoins + card payments
```

The first protocol in the list is offered as the preferred option in payment challenges.

---

## Full Working Example

Here's a complete server with three tools at different price points:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { withPayments } from "agentic-mcp-pay";
import { z } from "zod";

const server = new McpServer({ name: "research-tools", version: "1.0.0" });

// Free tool — not in pricing map, always passes through
server.tool("ping", {}, async () => ({
  content: [{ type: "text", text: "pong" }],
}));

// $0.02 — lightweight NLP task
server.tool(
  "analyze-sentiment",
  { text: z.string().describe("Text to analyze") },
  async ({ text }) => {
    const score = await runSentimentModel(text);
    return { content: [{ type: "text", text: JSON.stringify({ score }) }] };
  }
);

// $0.50 — moderate compute task
server.tool(
  "summarize-document",
  {
    content: z.string().describe("Document text"),
    maxWords: z.number().optional().default(200),
  },
  async ({ content, maxWords }) => {
    const summary = await runSummarizer(content, maxWords);
    return { content: [{ type: "text", text: summary }] };
  }
);

// $2.00 — expensive research task
server.tool(
  "deep-research",
  {
    query: z.string().describe("Research question"),
    depth: z.enum(["basic", "thorough", "exhaustive"]).default("thorough"),
  },
  async ({ query, depth }) => {
    const report = await runResearchPipeline(query, depth);
    return { content: [{ type: "text", text: report }] };
  }
);

// Wrap with payment enforcement
const { server: paidServer, cleanup, dashboardUrl } = withPayments(server, {
  pricing: {
    "analyze-sentiment": { amount: 0.02,  currency: "usd" },
    "summarize-document": { amount: 0.50, currency: "usd" },
    "deep-research":      { amount: 2.00, currency: "usd" },
  },
  payTo: "0xYourEthereumAddress",
  protocols: ["x402", "mpp"],
  dashboard: { port: 3100 },
  dbPath: "./transactions.db",  // persist earnings across restarts
});

console.log(`Dashboard: ${dashboardUrl}`);

// Graceful shutdown
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

const transport = new StdioServerTransport();
await paidServer.connect(transport);
```

---

## What Happens When an Agent Calls Your Tool

When an agent calls a paid tool, the gateway intercepts the call before your handler runs:

```
Agent calls tool (no _payment arg)
          │
          ▼
    Gateway checks pricing table
          │
          ├─ Tool not in pricing ──────────► Execute immediately (passthrough)
          │
          └─ Tool has a price
                    │
                    ▼
          Return PAYMENT_REQUIRED error
          (includes: nonce, amount, payTo, expiry, protocol list)
                    │
                    ▼
          Agent submits payment on-chain / via API
                    │
                    ▼
          Agent retries call with _payment = proof
                    │
                    ▼
          Gateway verifies proof
                    │
                    ├─ Invalid / expired ────► PAYMENT_INVALID / PAYMENT_EXPIRED
                    ├─ Replay detected ──────► PAYMENT_REPLAY
                    ├─ Underpaid ────────────► PAYMENT_UNDERPAID
                    │
                    └─ Verified ─────────────► Execute tool handler
                                               Return result + _receipt
```

Your tool handler receives clean `args` — the `_payment` argument is stripped before your code sees it. You don't need to touch any payment logic.

The `_receipt` block appended to the response includes the transaction hash, amount, protocol used, and a timestamp — useful for agents that need to log or audit spend.

---

## The Dashboard

Enable the dashboard to monitor earnings and transactions in real time.

```typescript
withPayments(server, {
  // ...
  dashboard: { port: 3100 },
  dbPath: "./transactions.db",  // required for persistence
});
```

The dashboard URL (with bearer token) is returned as `dashboardUrl`. Open it in your browser.

What you can see:
- **Total earnings** — cumulative revenue across all tools and protocols
- **Transaction count** — total verified calls
- **Per-tool breakdown** — revenue, call count, and average price per tool
- **Recent transaction log** — status, amount, protocol, timestamp, and tool name for each call

The dashboard is localhost-only (`127.0.0.1`) and requires the bearer token in the URL. It is never exposed on `0.0.0.0`.

---

## For Agent Developers — Client Side

If you're building agents that need to call paid MCP tools automatically, use the companion client package.

### Install

```bash
npm install agentic-mcp-pay-client
```

### Use `PaidMcpClient`

```typescript
import { PaidMcpClient } from "agentic-mcp-pay-client";

const client = new PaidMcpClient({
  serverUrl: "http://localhost:3000/mcp",
  budget: {
    maxPerCall: 5.00,    // never pay more than $5 per tool call
    maxTotal: 50.00,     // stop spending after $50 total
    currency: "usd",
  },
  wallet: {
    protocol: "x402",
    privateKey: process.env.AGENT_WALLET_KEY,
  },
});

// Call a paid tool — payment is handled automatically
const result = await client.callTool("deep-research", {
  query: "What are the latest developments in agentic AI?",
  depth: "thorough",
});

console.log(result);
console.log(`Spent so far: $${client.totalSpent.toFixed(2)}`);
```

The client handles the full challenge/pay/retry cycle invisibly. From your agent's perspective, calling a paid tool looks identical to calling a free one. Budget limits are enforced locally before any payment is submitted — if a tool costs more than `maxPerCall`, the client throws rather than paying.

---

## Supported Protocols

### x402 — Stablecoin micropayments

Uses the [x402 protocol](https://x402.org) to accept USDC on Base via the Coinbase facilitator. Best for small, frequent payments (cents per call). No Stripe account needed — just an Ethereum address.

- `payTo`: Ethereum address (`0x...`)
- No API keys required on the server side
- Facilitator endpoint configurable via `facilitatorUrl`

### MPP — Machine Payments Protocol

Integrates with [Stripe/Tempo's MPP](https://mpp.dev) for fiat payments routed through Stripe. Good for higher-value tools where card payments are preferred.

- `payTo`: Stripe destination account ID
- Verification via MPP API (`mppApiUrl` configurable)

### Stripe — Traditional card payments

Direct [Stripe PaymentIntents](https://stripe.com/docs/api/payment_intents). For tools where agents are acting on behalf of human users with card billing.

- Requires `stripeSecretKey` in config or `MCP_PAY_STRIPE_SECRET` env var
- `payTo`: Stripe account ID
- Full PaymentIntent lifecycle managed by the gateway

### mock — Testing stub

In-memory adapter that always verifies. Use this during development to test your payment flow without real transactions.

```typescript
protocols: ["mock"]
```

---

## What's Next

**Server package (this package)**
- GitHub: [github.com/QuinnYates/agentic-mcp-pay](https://github.com/QuinnYates/agentic-mcp-pay)
- npm: `npm install agentic-mcp-pay`

**Client package**
- GitHub: [github.com/QuinnYates/agentic-mcp-pay-client](https://github.com/QuinnYates/agentic-mcp-pay-client)
- npm: `npm install agentic-mcp-pay-client`

**MCP Pay Registry** (coming soon)
Register your paid tool so agents can discover it automatically. Submit your tool's name, endpoint, pricing table, and supported protocols. Agents using `agentic-mcp-pay-client` will be able to find and pay for your tool without any manual configuration.

---

*Built by Quinn Ye. MIT licensed.*
