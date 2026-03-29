import express from "express";
import type Database from "better-sqlite3";
import { createAuthMiddleware } from "./auth.js";
import { getOverviewStats, getTransactionList, getPerToolStats } from "./queries.js";
import { fromCents } from "../types.js";

export function createDashboardServer(db: Database.Database, token: string) {
  const app = express();
  app.use(createAuthMiddleware(token));

  // HTML pages
  app.get("/", (_req, res) => {
    const stats = getOverviewStats(db);
    res.send(renderPage("Overview", token, `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">$${stats.totalEarningsDollars.toFixed(2)}</div><div class="stat-label">Total Earnings</div></div>
        <div class="stat-card"><div class="stat-value">${stats.totalTransactions}</div><div class="stat-label">Transactions</div></div>
      </div>
    `));
  });

  app.get("/transactions", (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const txs = getTransactionList(db, { limit, offset: (page - 1) * limit, status: req.query.status as string | undefined });
    const rows = txs.map(tx => `<tr><td>${tx.created_at}</td><td>${tx.tool_name}</td><td>$${tx.amount_dollars.toFixed(2)}</td><td>${tx.protocol}</td><td><span class="status-${tx.status}">${tx.status}</span></td><td>${tx.tx_hash ? `<a href="https://basescan.org/tx/${tx.tx_hash}" target="_blank">${tx.tx_hash.slice(0, 10)}...</a>` : "-"}</td></tr>`).join("");
    res.send(renderPage("Transactions", token, `<table><thead><tr><th>Date</th><th>Tool</th><th>Amount</th><th>Protocol</th><th>Status</th><th>Tx Hash</th></tr></thead><tbody>${rows}</tbody></table>`));
  });

  app.get("/tools", (_req, res) => {
    const stats = getPerToolStats(db);
    const rows = stats.map(s => `<tr><td>${s.tool_name}</td><td>$${s.total_dollars.toFixed(2)}</td><td>${s.call_count}</td><td>$${fromCents(s.avg_cents).toFixed(2)}</td></tr>`).join("");
    res.send(renderPage("Per-Tool Breakdown", token, `<table><thead><tr><th>Tool</th><th>Total Earned</th><th>Calls</th><th>Avg Payment</th></tr></thead><tbody>${rows}</tbody></table>`));
  });

  // JSON API
  app.get("/api/overview", (_req, res) => { res.json(getOverviewStats(db)); });
  app.get("/api/transactions", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    res.json(getTransactionList(db, { limit, offset, status: req.query.status as string | undefined }));
  });
  app.get("/api/tools", (_req, res) => { res.json(getPerToolStats(db)); });

  return app;
}

function renderPage(title: string, token: string, content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mcp-pay — ${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}nav{display:flex;gap:1.5rem;margin-bottom:2rem;border-bottom:1px solid #334155;padding-bottom:1rem}nav a{color:#94a3b8;text-decoration:none;font-weight:500}nav a:hover{color:#e2e8f0}h1{font-size:1.5rem;margin-bottom:1.5rem;color:#f8fafc}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}.stat-card{background:#1e293b;border-radius:8px;padding:1.5rem}.stat-value{font-size:2rem;font-weight:700;color:#22d3ee}.stat-label{color:#94a3b8;margin-top:.25rem;font-size:.875rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.75rem 1rem;border-bottom:1px solid #334155}th{color:#94a3b8;font-weight:500;font-size:.875rem;text-transform:uppercase}a{color:#38bdf8}.status-verified{color:#4ade80}.status-failed{color:#f87171}</style>
</head><body>
<nav><a href="/?token=${token}">Overview</a><a href="/transactions?token=${token}">Transactions</a><a href="/tools?token=${token}">Tools</a></nav>
<h1>${title}</h1>${content}</body></html>`;
}
