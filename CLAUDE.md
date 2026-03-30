# agentic-mcp-pay — Project Hub

**Vision:** POS machine for agents — universal payment terminal for AI agent commerce.
**Status:** v0.1.1 published. Strategy approved. Executing Phase 1 Week 1.

## Repos
- **Gateway:** `~/Projects/mcp-pay/` | [npm](https://npmjs.com/package/agentic-mcp-pay) | [GitHub](https://github.com/QuinnYates/agentic-mcp-pay)
- **Client SDK:** `~/Projects/mcp-pay-client/` | [npm](https://npmjs.com/package/agentic-mcp-pay-client) | [GitHub](https://github.com/QuinnYates/agentic-mcp-pay-client)
- **Demo:** `~/Projects/mcp-pay-demo/` | [GitHub](https://github.com/QuinnYates/agentic-mcp-pay-demo)

## Strategy & Design Docs
- **Launch strategy (approved):** `~/.gstack/projects/QuinnYates-agentic-mcp-pay/yeqy1-master-design-20260330-063000.md`
- **Gateway design spec:** `docs/superpowers/specs/2026-03-25-mcp-payment-gateway-design.md`
- **Client SDK spec:** `docs/superpowers/specs/2026-03-29-mcp-pay-client-design.md`

## Implementation Plans
- **M1 MVP plan:** `docs/superpowers/plans/2026-03-25-mcp-pay-m1-mvp.md`
- **M2 dashboard plan:** `docs/superpowers/plans/2026-03-29-mcp-pay-m2-dashboard.md`
- **M3-M5 plan:** `docs/superpowers/plans/2026-03-29-mcp-pay-m3-m4-m5.md`
- **Client SDK plan:** `docs/superpowers/plans/2026-03-29-mcp-pay-client.md`

## Marketing & Outreach
- **Tutorial:** `docs/tutorial-monetize-mcp-tools.md` | [Gist](https://gist.github.com/QuinnYates/53c927dac091dc7c8ff694c54b69cabd)
- **Community posts:** `docs/community-posts.md` (X, Reddit, HN, MCP Discord, Dev.to)

## Current Phase
**Phase 1, Week 1:** Find + wrap a popular MCP server to get first real user.
- Phase gate to Phase 2: 5+ tools in registry, 1 real transaction, 1 non-Quinn user
- npm account: drquinnye (token expires April 28, 2026)

## Key Decisions
- "B then A" strategy: dominate MCP first (3 months), then expand to universal POS
- Open-first, profit later — community builds the moat via network effects
- Moat = registry/marketplace, not code. Code is commoditizable.
- MCP is the wedge, not the ceiling

## Tech Stack
- TypeScript, @modelcontextprotocol/sdk, better-sqlite3, express, vitest
- Protocols: x402 (stablecoins), MPP (Stripe/Tempo), Stripe (cards)
- Quinn is not deeply technical in payments/crypto — Claude handles all implementation
