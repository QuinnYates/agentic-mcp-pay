import type { PaymentProtocol } from "./interface.js";
import type { PaymentChallenge, VerificationResult } from "../types.js";
import { ErrorCode } from "../types.js";
import { generateNonce } from "../security/nonce.js";

export interface StripeProtocolOptions { secretKey: string; }

export class StripeProtocol implements PaymentProtocol {
  name = "stripe";
  private secretKey: string;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(options: StripeProtocolOptions) { this.secretKey = options.secretKey; }

  createChallenge(tool: string, amountCents: number, currency: string, payTo: string): PaymentChallenge {
    return { version: 1, protocol: this.name, amount: amountCents, currency, nonce: generateNonce(), payTo, expiresAt: Date.now() + 300_000 };
  }

  async verifyPayment(challenge: PaymentChallenge, proof: string): Promise<VerificationResult> {
    if (Date.now() < this.circuitOpenUntil) return { verified: false, error: "Stripe API temporarily unavailable (circuit open)", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE };
    try {
      const response = await fetch(`https://api.stripe.com/v1/payment_intents/${proof}`, { headers: { "Authorization": `Bearer ${this.secretKey}` } });
      if (!response.ok) { this.recordFailure(); return { verified: false, error: `Stripe returned HTTP ${response.status}`, errorCode: ErrorCode.VERIFICATION_UNAVAILABLE }; }
      const pi = (await response.json()) as { id: string; status: string; amount: number; currency: string; };
      this.consecutiveFailures = 0;
      if (pi.status !== "succeeded") return { verified: false, error: `PaymentIntent status: ${pi.status}`, errorCode: ErrorCode.PAYMENT_INVALID };
      if (pi.amount < challenge.amount) return { verified: false, error: `Paid ${pi.amount} cents, required ${challenge.amount} cents`, errorCode: ErrorCode.PAYMENT_UNDERPAID, paidCents: pi.amount };
      return { verified: true, txHash: pi.id, paidCents: pi.amount };
    } catch (err) { this.recordFailure(); return { verified: false, error: err instanceof Error ? err.message : "Stripe request failed", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE }; }
  }

  private recordFailure(): void { this.consecutiveFailures++; if (this.consecutiveFailures >= 3) this.circuitOpenUntil = Date.now() + 60_000; }
}
