# Community Outreach Posts — agentic-mcp-pay

**Links reference sheet**
- npm: https://npmjs.com/package/agentic-mcp-pay
- GitHub (gateway): https://github.com/QuinnYates/agentic-mcp-pay
- GitHub (client): https://github.com/QuinnYates/agentic-mcp-pay-client
- GitHub (demo): https://github.com/QuinnYates/agentic-mcp-pay-demo
- Tutorial gist: https://gist.github.com/QuinnYates/53c927dac091dc7c8ff694c54b69cabd

---

## 1. X/Twitter — Single Post

Monetize your MCP tools in one line. `withPayments(server, config)` adds x402/Stripe/MPP payment enforcement to any MCP server. Agents pay per call, you keep the revenue.

`npm install agentic-mcp-pay`

https://github.com/QuinnYates/agentic-mcp-pay

#MCP #AI #agents #x402 #buildinpublic

---

## 2. X/Twitter — Thread (5 tweets)

**Tweet 1 — Problem**
MCP tools are free by default. You build something useful, agents use it, you get nothing. There's no charging mechanism in the protocol. You'd have to roll your own from scratch — x402, Stripe, replay protection, nonces, the whole thing.

**Tweet 2 — Solution**
So I built `agentic-mcp-pay`. One npm package. One function call. Wrap your existing MCP server and it becomes a paid API.

```ts
const { server: paidServer } = withPayments(server, {
  pricing: { "analyze-data": { amount: 0.50, currency: "usd" } },
  payTo: "0xYourWalletAddress",
  protocols: ["x402"],
});
```

`npm install agentic-mcp-pay`

**Tweet 3 — How it works**
The payment loop in 4 steps:

1. Agent calls your tool (no payment yet)
2. Gateway returns PAYMENT_REQUIRED + signed challenge (nonce, amount, address, expiry)
3. Agent pays on-chain / via API, retries with `_payment` proof
4. Gateway verifies → executes → returns result + `_receipt`

Your tool code sees clean args. No payment logic in your handlers.

**Tweet 4 — Demo output**
The full cycle, verified by the integration test suite:

```
→ client.callTool("paid-tool", { input: "hello" })
← { isError: true, code: "PAYMENT_REQUIRED", data: { nonce: "...", amount: 50, protocol: "mock" } }

→ client.callTool("paid-tool", { input: "hello", _payment: { nonce, proof, protocol } })
← { content: [ { text: "Result: hello" }, { text: '{"_receipt":{"txHash":"...","amountCents":50,"currency":"usd"}}' } ] }
```

Replay the same proof? `PAYMENT_REPLAY`. Expired nonce? `PAYMENT_EXPIRED`. Every path handled.

**Tweet 5 — Call to action**
Supports x402 (USDC on Base), MPP (Stripe/Tempo), and traditional Stripe PaymentIntents. Free tools pass through untouched — no accidental gating.

Server: https://github.com/QuinnYates/agentic-mcp-pay
Client (for agents that auto-pay): https://github.com/QuinnYates/agentic-mcp-pay-client
Tutorial: https://gist.github.com/QuinnYates/53c927dac091dc7c8ff694c54b69cabd

#MCP #AI #x402 #agents

---

## 3. Reddit Post (r/mcp / r/programming / r/artificial)

**Title:** I built a payment gateway for MCP servers — `withPayments()` wraps any server and adds per-tool pricing in one call

**Body:**

Hey all — I've been building MCP tools for a while and kept running into the same issue: there's no built-in way to charge for tool usage. If you want per-call payments you have to implement x402 or Stripe yourself, handle challenge/verify/replay-protection logic, and wire it into every tool you build.

I got tired of redoing that work, so I extracted it into a standalone package: **agentic-mcp-pay**.

### How it works

You register your tools as normal, then wrap the server with one function call:

```typescript
import { withPayments } from "agentic-mcp-pay";

const { server: paidServer, cleanup, dashboardUrl } = withPayments(server, {
  pricing: {
    "analyze-sentiment":  { amount: 0.02,  currency: "usd" },
    "summarize-document": { amount: 0.50,  currency: "usd" },
    "deep-research":      { amount: 2.00,  currency: "usd" },
    // "health-check" not listed → passes through free
  },
  payTo: "0xYourEthereumAddress",
  protocols: ["x402", "mpp"],
  dashboard: { port: 3100 },
  dbPath: "./transactions.db",
});
```

The gateway intercepts every tool call. If a tool has a price set and the caller hasn't paid:

1. Returns `PAYMENT_REQUIRED` with a signed challenge (nonce, amount, payTo, expiry, protocol list)
2. Caller submits payment and retries with `_payment: { nonce, proof, protocol }`
3. Gateway verifies against the protocol adapter, checks replay protection, executes
4. Returns the tool result + a `_receipt` block (txHash, amount, protocol, timestamp)

The `_payment` arg is stripped before your handler runs — your tool code sees clean args, zero payment logic.

### The payment loop (from the integration test)

```
// Step 1: call without payment
→ client.callTool("paid-tool", { input: "hello" })
← isError: true
  { code: "PAYMENT_REQUIRED", data: { nonce: "abc123", amount: 50, protocol: "mock" } }

// Step 2: call with proof
→ client.callTool("paid-tool", { input: "hello", _payment: { nonce: "abc123", proof: "...", protocol: "mock" } })
← isError: false
  content[0]: "Result: hello"
  content[1]: { "_receipt": { txHash: "0x...", amountCents: 50, currency: "usd" } }
```

### Supported protocols

| Protocol | Description |
|----------|-------------|
| `x402`   | USDC on Base via Coinbase facilitator. Just an Ethereum address — no API keys needed. |
| `mpp`    | Stripe/Tempo Machine Payments Protocol |
| `stripe` | Traditional Stripe PaymentIntents |
| `mock`   | In-memory stub — always verifies. Use for development. |

### For agent developers

There's a companion client package (`agentic-mcp-pay-client`) that handles the challenge/pay/retry cycle automatically. Your agent calls a paid tool the same way it calls a free one — the client handles the rest, with configurable spend budgets.

```typescript
import { PaidMcpClient } from "agentic-mcp-pay-client";

const client = new PaidMcpClient({
  serverUrl: "http://localhost:3000/mcp",
  budget: { maxPerCall: 5.00, maxTotal: 50.00, currency: "usd" },
  wallet: { protocol: "x402", privateKey: process.env.AGENT_WALLET_KEY },
});

const result = await client.callTool("deep-research", { query: "..." });
```

### Links

- npm: https://npmjs.com/package/agentic-mcp-pay
- GitHub (gateway): https://github.com/QuinnYates/agentic-mcp-pay
- GitHub (client): https://github.com/QuinnYates/agentic-mcp-pay-client
- Demo repo: https://github.com/QuinnYates/agentic-mcp-pay-demo
- Full tutorial: https://gist.github.com/QuinnYates/53c927dac091dc7c8ff694c54b69cabd

Happy to answer questions about the design. Still early (v0.1.1) — feedback on the protocol design and API surface is especially welcome.

---

## 4. Hacker News

**Title:** Show HN: agentic-mcp-pay – payment gateway for MCP servers (x402/Stripe/MPP)

**Comment:**

MCP tools are free by default — there's no charging mechanism in the protocol. If you want per-call payments you have to implement x402 or Stripe yourself, handle challenge/verify/replay-protection, and wire it into every tool you ship.

`agentic-mcp-pay` extracts that into a single wrapper function. You register your tools as normal, then pass your server to `withPayments()` with a pricing table and a wallet address. The gateway intercepts tool calls, issues a signed challenge (nonce + expiry), verifies the payment proof from the caller, enforces replay protection via SQLite, and executes the handler only after verification passes.

Payment protocols: x402 (USDC on Base via Coinbase facilitator), MPP (Stripe/Tempo), plain Stripe PaymentIntents, and a mock adapter for testing. Tools not listed in the pricing table pass through unconditionally — free tools stay free without any config change.

There's also a companion client package (`agentic-mcp-pay-client`) for agent developers. It handles the challenge/pay/retry cycle automatically with configurable spend budgets, so calling a paid tool looks identical to calling a free one from the agent's perspective.

MIT, Node 18+.

- npm: https://npmjs.com/package/agentic-mcp-pay
- GitHub: https://github.com/QuinnYates/agentic-mcp-pay
- Tutorial: https://gist.github.com/QuinnYates/53c927dac091dc7c8ff694c54b69cabd

Still at v0.1.1. The x402 path is furthest along; MPP and Stripe need production testing with real accounts. Interested in any feedback on the protocol design — specifically whether the challenge/proof structure is compatible with how people are building agentic payment flows.

---

## 5. MCP Discord / GitHub Discussions

**Title:** Hey — I built a payment gateway for MCP servers, feedback welcome

Hey everyone,

I built a thing and wanted to share it here where people actually understand the protocol.

**Problem I kept hitting:** I build MCP tools, agents use them, but there's no standard way to get paid per call. Every time I wanted to add billing I had to re-implement the whole challenge/verify/replay-protection stack. Got tedious fast.

**What I made:** `agentic-mcp-pay` — a single wrapper function that adds payment enforcement to any MCP server.

The one-liner:

```typescript
import { withPayments } from "agentic-mcp-pay";

const { server: paidServer } = withPayments(server, {
  pricing: { "my-tool": { amount: 0.10, currency: "usd" } },
  payTo: "0xYourAddress",
  protocols: ["x402"],
});

// connect paidServer to your transport as normal
```

That's genuinely all you need. Your tool code doesn't change — the `_payment` arg is stripped before your handler runs, and a `_receipt` is appended to the response after verification.

**Supported protocols:** x402 (USDC on Base), MPP (Stripe/Tempo), Stripe PaymentIntents, mock (for testing).

**There's also a client package** (`agentic-mcp-pay-client`) for agents that need to auto-pay. It handles challenge → pay → retry invisibly, with spend budget limits.

**Links:**
- npm: https://npmjs.com/package/agentic-mcp-pay
- GitHub (server): https://github.com/QuinnYates/agentic-mcp-pay
- GitHub (client): https://github.com/QuinnYates/agentic-mcp-pay-client
- Demo: https://github.com/QuinnYates/agentic-mcp-pay-demo
- Tutorial (full walkthrough): https://gist.github.com/QuinnYates/53c927dac091dc7c8ff694c54b69cabd

Still v0.1.1. Would love feedback on the API surface, anything weird about how the challenge/proof structure maps to how you're thinking about agentic payments, or protocol gaps I haven't covered.

---

## 6. Dev.to / Hashnode Article Outline

**Title:** How to Monetize Your MCP Tools in 5 Minutes (With x402, Stripe, and MPP)

---

### Section 1: The Gap in MCP
- MCP has no native payment mechanism — tools are free by default
- As the agentic ecosystem scales, MCP tool developers need a way to capture value
- Rolling your own: what it takes (x402 integration, challenge/nonce logic, replay protection, Stripe wiring) — realistic estimate: 1–2 weeks of solid work per project
- The cost of doing it wrong: replay attacks, expired challenges accepted, payment proofs never verified

### Section 2: Introducing agentic-mcp-pay
- One package, one function: `withPayments(server, config)`
- What it handles so you don't have to: challenge issuance, nonce/expiry management, protocol adapter dispatch, replay protection (SQLite), receipt generation
- What it doesn't touch: your tool logic, your transport, your MCP server structure
- Philosophy: verify before execute — gateway never calls your handler until proof is confirmed

### Section 3: The Payment Flow (Step by Step)
- Diagram: agent call → PAYMENT_REQUIRED → payment submission → proof verification → execution → receipt
- Walk through each error code: `PAYMENT_REQUIRED`, `PAYMENT_INVALID`, `PAYMENT_EXPIRED`, `PAYMENT_REPLAY`, `PAYMENT_UNDERPAID`
- Why replay protection matters in agentic systems (agents retry aggressively; without it, one payment could unlock unlimited calls)
- The `_receipt` block: what's in it and why agents care (spend tracking, audit logs)

### Section 4: Full Code Walkthrough
- Start with a plain MCP server (3 tools at different price points: $0.02 / $0.50 / $2.00)
- Add `withPayments()` — show before/after diff
- Enable the dashboard (`dashboard: { port: 3100 }`) — what you can see
- Persist transactions across restarts (`dbPath: "./transactions.db"`)
- Graceful shutdown (`process.on("SIGTERM", cleanup)`)
- Full working example (link to tutorial gist)

### Section 5: Supported Payment Protocols
- **x402**: USDC on Base, Coinbase facilitator, no API keys — just an Ethereum address. Best for cent-scale micropayments.
- **MPP (Machine Payments Protocol)**: Stripe/Tempo integration, fiat payments, good for higher-value tools
- **Stripe**: direct PaymentIntents for user-facing agents with card billing
- **mock**: in-memory, always verifies — use during development
- Choosing the right protocol for your use case (micropayments vs. higher-value vs. testing)

### Section 6: The Agent Side — agentic-mcp-pay-client
- Why the client package exists: agents shouldn't need to hand-code the challenge/pay/retry loop
- `PaidMcpClient` — drop-in replacement for standard MCP client
- Budget enforcement: `maxPerCall` and `maxTotal` — safety rails for autonomous agents
- Code example: calling a paid tool that looks identical to calling a free one
- `client.totalSpent` — spend visibility for the agent

### Section 7: What's Next
- MCP Pay Registry: a discovery layer so agents can find paid tools without manual configuration
- Feedback welcome — especially on protocol design and how the challenge/proof structure maps to real agentic payment workflows
- Links: npm, GitHub (server + client), demo, tutorial gist
