import { randomBytes } from "node:crypto";

/** Generate a cryptographically random 32-byte hex nonce. */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
