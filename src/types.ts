// --- Conversion helpers ---
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
export function fromCents(cents: number): number {
  return cents / 100;
}

// --- Config types ---
export interface ToolPricing {
  amount: number;
  currency: string;
}
export interface McpPayConfig {
  pricing: Record<string, ToolPricing>;
  payTo: string;
  protocols: string[];
  dashboard?: { port: number };
  dbPath?: string;
  challengeTtlMs?: number;
  facilitatorUrl?: string;
  mppApiUrl?: string;
  stripeSecretKey?: string;
}

// --- Payment types ---
export interface PaymentChallenge {
  version: number;
  protocol: string;
  amount: number;
  currency: string;
  nonce: string;
  payTo: string;
  network?: string;
  token?: string;
  expiresAt: number;
}
export interface VerificationResult {
  verified: boolean;
  txHash?: string;
  confirmations?: number;
  paidCents?: number;
  error?: string;
  errorCode?: string;
}

// --- Error codes ---
export const ErrorCode = {
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  PAYMENT_INVALID: "PAYMENT_INVALID",
  PAYMENT_EXPIRED: "PAYMENT_EXPIRED",
  PAYMENT_UNDERPAID: "PAYMENT_UNDERPAID",
  PAYMENT_REPLAY: "PAYMENT_REPLAY",
  VERIFICATION_UNAVAILABLE: "VERIFICATION_UNAVAILABLE",
  PROTOCOL_UNSUPPORTED: "PROTOCOL_UNSUPPORTED",
} as const;
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
