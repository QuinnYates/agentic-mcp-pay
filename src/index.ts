import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpPayConfig } from "./types.js";
import { validatePayTo } from "./security/validate.js";
import { createDatabase } from "./storage/db.js";
import { cleanupExpiredChallenges } from "./storage/challenges.js";
import { PricingTable } from "./pricing.js";
import { PaymentGate } from "./gate.js";
import { MockProtocol } from "./protocols/mock.js";
import { X402Protocol } from "./protocols/x402.js";
import type { PaymentProtocol } from "./protocols/interface.js";

export type { McpPayConfig } from "./types.js";
export { ErrorCode, toCents, fromCents } from "./types.js";
export type { PaymentChallenge, VerificationResult, ToolPricing } from "./types.js";

const DEFAULT_CHALLENGE_TTL_MS = 300_000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

export interface WithPaymentsResult {
  server: McpServer;
  cleanup: () => void;
}

export function withPayments(
  mcpServer: McpServer,
  config: McpPayConfig,
): WithPaymentsResult {
  // 1. Validate payTo address at startup
  validatePayTo(config.payTo);

  // 2. Create SQLite database
  const dbPath = (config as McpPayConfig & { dbPath?: string }).dbPath ?? ":memory:";
  const db = createDatabase(dbPath);

  // 3. Build PricingTable from config
  const pricing = new PricingTable(config.pricing);

  // 4. Initialize protocol adapters
  const protocols: PaymentProtocol[] = [];
  for (const proto of config.protocols) {
    if (proto === "mock") {
      protocols.push(new MockProtocol({ shouldVerify: true }));
    } else if (proto === "x402") {
      protocols.push(new X402Protocol({
        facilitatorUrl: config.facilitatorUrl ?? "https://x402.org/facilitator",
        network: "base",
        token: "USDC",
      }));
    }
  }

  // 5. Create PaymentGate
  const challengeTtlMs = config.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  const gate = new PaymentGate({
    db,
    pricing,
    protocols,
    payTo: config.payTo,
    challengeTtlMs,
  });

  // 6. Set up periodic challenge cleanup (unref'd so it doesn't block exit)
  const cleanupTimer = setInterval(() => {
    cleanupExpiredChallenges(db);
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  // 7. Intercept MCP tool calls
  // We monkey-patch the server's connect method to install our interception
  // after tool handlers have been registered.
  const innerServer = mcpServer.server;
  const requestHandlers = (innerServer as any)._requestHandlers as Map<string, Function>;

  // Save original connect so we can wrap it
  const originalConnect = mcpServer.connect.bind(mcpServer);

  mcpServer.connect = async (transport) => {
    // Let the original connect proceed (which triggers handler registration)
    await originalConnect(transport);

    // Now intercept the CallToolRequest handler
    installInterceptor();
  };

  // Also install immediately in case tools are already registered
  // (setToolRequestHandlers is idempotent and runs on first tool() call)
  installInterceptor();

  function installInterceptor() {
    const method = "tools/call";
    const originalHandler = requestHandlers.get(method);
    if (!originalHandler || (originalHandler as any).__mcpPayWrapped) {
      return;
    }

    const wrappedHandler = async (request: any, extra: any) => {
      const toolName: string = request.params.name;
      const args: Record<string, unknown> = request.params.arguments ?? {};

      // Run through payment gate
      const gateResult = await gate.handleToolCall(toolName, args);

      switch (gateResult.action) {
        case "passthrough":
          // Forward to original handler unchanged
          return originalHandler(request, extra);

        case "payment_required":
          // Return challenge as error content
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: gateResult.errorCode,
                  challenge: gateResult.challenge,
                }),
              },
            ],
            isError: true,
          };

        case "execute": {
          // Strip _payment from args and forward
          const { _payment, ...cleanArgs } = args;
          const modifiedRequest = {
            ...request,
            params: {
              ...request.params,
              arguments: cleanArgs,
            },
          };
          const result = await originalHandler(modifiedRequest, extra);

          // Append receipt to the result content
          const receipt = gateResult.receipt;
          const resultContent = Array.isArray(result.content) ? result.content : [];
          return {
            ...result,
            content: [
              ...resultContent,
              {
                type: "text",
                text: JSON.stringify({
                  _receipt: receipt,
                }),
              },
            ],
          };
        }

        case "rejected":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: gateResult.errorCode,
                  message: gateResult.error,
                }),
              },
            ],
            isError: true,
          };

        default:
          return originalHandler(request, extra);
      }
    };

    // Mark as wrapped to avoid double-wrapping
    (wrappedHandler as any).__mcpPayWrapped = true;
    requestHandlers.set(method, wrappedHandler);
  }

  function cleanup() {
    clearInterval(cleanupTimer);
    db.close();
  }

  return { server: mcpServer, cleanup };
}
