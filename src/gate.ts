import type Database from "better-sqlite3";
import type { PaymentProtocol } from "./protocols/interface.js";
import type { PaymentChallenge } from "./types.js";
import { ErrorCode } from "./types.js";
import { PricingTable } from "./pricing.js";
import { validateAmount } from "./security/validate.js";
import { insertChallenge, findChallenge, markChallengeUsed } from "./storage/challenges.js";
import { insertTransaction } from "./storage/transactions.js";
import { randomUUID } from "node:crypto";

export interface GateConfig {
  db: Database.Database;
  pricing: PricingTable;
  protocols: PaymentProtocol[];
  payTo: string;
  challengeTtlMs: number;
}

export interface PaymentProof { nonce: string; proof: string; protocol: string; }

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
    for (const p of config.protocols) this.protocols.set(p.name, p);
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<GateResult> {
    const price = this.pricing.getPrice(toolName);
    if (!price) return { action: "passthrough" };
    const payment = args._payment as PaymentProof | undefined;
    if (!payment) return this.issueChallenge(toolName, price.amountCents, price.currency);
    return this.verifyAndExecute(toolName, payment, price.amountCents, price.currency);
  }

  private issueChallenge(toolName: string, amountCents: number, currency: string): GateResult {
    const protocol = this.protocols.values().next().value;
    if (!protocol) return { action: "rejected", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE, error: "No payment protocols configured" };

    const challenge = protocol.createChallenge(toolName, amountCents, currency, this.payTo);
    challenge.expiresAt = Date.now() + this.challengeTtlMs;

    insertChallenge(this.db, {
      nonce: challenge.nonce, tool_name: toolName, amount_cents: amountCents,
      currency, protocol: protocol.name, expires_at: new Date(challenge.expiresAt).toISOString(),
    });

    return { action: "payment_required", challenge, errorCode: ErrorCode.PAYMENT_REQUIRED };
  }

  private async verifyAndExecute(toolName: string, payment: PaymentProof, amountCents: number, currency: string): Promise<GateResult> {
    const protocol = this.protocols.get(payment.protocol);
    if (!protocol) return { action: "rejected", errorCode: ErrorCode.PROTOCOL_UNSUPPORTED, error: `Protocol "${payment.protocol}" is not configured` };

    const challengeRow = findChallenge(this.db, payment.nonce);
    if (!challengeRow) return { action: "rejected", errorCode: ErrorCode.PAYMENT_INVALID, error: "Unknown nonce" };
    if (challengeRow.used) return { action: "rejected", errorCode: ErrorCode.PAYMENT_REPLAY, error: "This nonce has already been used" };

    const expiresAt = new Date(challengeRow.expires_at).getTime();
    if (Date.now() > expiresAt) return { action: "rejected", errorCode: ErrorCode.PAYMENT_EXPIRED, error: "Challenge has expired" };

    const challenge: PaymentChallenge = { version: 1, protocol: challengeRow.protocol, amount: challengeRow.amount_cents, currency: challengeRow.currency, nonce: challengeRow.nonce, payTo: this.payTo, expiresAt };

    const result = await protocol.verifyPayment(challenge, payment.proof);

    if (!result.verified) {
      const isTransient = result.errorCode === ErrorCode.VERIFICATION_UNAVAILABLE;
      if (!isTransient) markChallengeUsed(this.db, payment.nonce);
      return { action: "rejected", errorCode: result.errorCode ?? ErrorCode.PAYMENT_INVALID, error: result.error ?? "Payment verification failed" };
    }

    if (!validateAmount(result.paidCents ?? amountCents, amountCents)) {
      markChallengeUsed(this.db, payment.nonce);
      return { action: "rejected", errorCode: ErrorCode.PAYMENT_UNDERPAID, error: `Paid ${result.paidCents} cents, required ${amountCents} cents` };
    }

    markChallengeUsed(this.db, payment.nonce);

    insertTransaction(this.db, {
      id: randomUUID(), tool_name: toolName, amount_cents: amountCents, currency,
      protocol: payment.protocol, payer_address: null, tx_hash: result.txHash ?? null,
      nonce: payment.nonce, status: "verified",
    });

    return { action: "execute", receipt: { txHash: result.txHash ?? "", amountCents, currency } };
  }
}
