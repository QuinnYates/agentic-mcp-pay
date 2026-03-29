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
    const pricing = new PricingTable({ "paid-tool": { amount: 0.50, currency: "usd" } });
    gate = new PaymentGate({ db, pricing, protocols: [mockProtocol], payTo: PAY_TO, challengeTtlMs: 300_000 });
  });

  afterEach(() => { db.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

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
    const challenge = await gate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;
    const result = await gate.handleToolCall("paid-tool", { _payment: { nonce, proof: "valid-proof", protocol: "mock" } });
    expect(result.action).toBe("execute");
    expect(result.receipt).toBeTruthy();
    expect(result.receipt!.txHash).toBeTruthy();
  });

  it("rejects expired challenge", async () => {
    const shortGate = new PaymentGate({ db, pricing: new PricingTable({ "paid-tool": { amount: 0.50, currency: "usd" } }), protocols: [mockProtocol], payTo: PAY_TO, challengeTtlMs: 1 });
    const challenge = await shortGate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;
    await new Promise((r) => setTimeout(r, 10));
    const result = await shortGate.handleToolCall("paid-tool", { _payment: { nonce, proof: "valid-proof", protocol: "mock" } });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_EXPIRED);
  });

  it("rejects replay (same nonce used twice)", async () => {
    const challenge = await gate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;
    await gate.handleToolCall("paid-tool", { _payment: { nonce, proof: "valid-proof", protocol: "mock" } });
    const result = await gate.handleToolCall("paid-tool", { _payment: { nonce, proof: "valid-proof", protocol: "mock" } });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_REPLAY);
  });

  it("rejects invalid payment proof", async () => {
    const failProtocol = new MockProtocol({ shouldVerify: false });
    const failGate = new PaymentGate({ db, pricing: new PricingTable({ "paid-tool": { amount: 0.50, currency: "usd" } }), protocols: [failProtocol], payTo: PAY_TO, challengeTtlMs: 300_000 });
    const challenge = await failGate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;
    const result = await failGate.handleToolCall("paid-tool", { _payment: { nonce, proof: "bad-proof", protocol: "mock" } });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_INVALID);
  });

  it("rejects unsupported protocol", async () => {
    const challenge = await gate.handleToolCall("paid-tool", {});
    const nonce = challenge.challenge!.nonce;
    const result = await gate.handleToolCall("paid-tool", { _payment: { nonce, proof: "valid-proof", protocol: "nonexistent" } });
    expect(result.action).toBe("rejected");
    expect(result.errorCode).toBe(ErrorCode.PROTOCOL_UNSUPPORTED);
  });
});
