import type { PaymentProtocol } from "./interface.js";
import type { PaymentChallenge, VerificationResult } from "../types.js";
import { ErrorCode } from "../types.js";
import { generateNonce } from "../security/nonce.js";

export interface X402ProtocolOptions { facilitatorUrl: string; network: string; token: string; }

export class X402Protocol implements PaymentProtocol {
  name = "x402";
  private facilitatorUrl: string;
  private network: string;
  private token: string;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(options: X402ProtocolOptions) {
    this.facilitatorUrl = options.facilitatorUrl;
    this.network = options.network;
    this.token = options.token;
  }

  createChallenge(tool: string, amountCents: number, currency: string, payTo: string): PaymentChallenge {
    return { version: 1, protocol: this.name, amount: amountCents, currency, nonce: generateNonce(), payTo, network: this.network, token: this.token, expiresAt: Date.now() + 300_000 };
  }

  async verifyPayment(challenge: PaymentChallenge, proof: string): Promise<VerificationResult> {
    if (Date.now() < this.circuitOpenUntil) {
      return { verified: false, error: "Facilitator temporarily unavailable (circuit open)", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE };
    }
    try {
      const response = await fetch(this.facilitatorUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment: proof, challenge: { nonce: challenge.nonce, amount: challenge.amount, currency: challenge.currency, payTo: challenge.payTo, network: challenge.network, token: challenge.token } }),
      });
      if (!response.ok) { this.recordFailure(); return { verified: false, error: `Facilitator returned HTTP ${response.status}`, errorCode: ErrorCode.VERIFICATION_UNAVAILABLE }; }
      const data = (await response.json()) as { success: boolean; txHash?: string; confirmations?: number; error?: string; };
      this.consecutiveFailures = 0;
      if (data.success) return { verified: true, txHash: data.txHash, confirmations: data.confirmations };
      return { verified: false, error: data.error ?? "Payment verification failed", errorCode: ErrorCode.PAYMENT_INVALID };
    } catch (err) {
      this.recordFailure();
      return { verified: false, error: err instanceof Error ? err.message : "Facilitator request failed", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE };
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 3) this.circuitOpenUntil = Date.now() + 60_000;
  }
}
