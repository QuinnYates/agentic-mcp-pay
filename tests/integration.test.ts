import { describe, it, expect, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { withPayments, type McpPayConfig } from "../src/index.js";
import { z } from "zod";
import { ErrorCode } from "../src/types.js";

const VALID_PAY_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth EIP-55

function makeConfig(overrides?: Partial<McpPayConfig>): McpPayConfig {
  return {
    pricing: {
      "paid-tool": { amount: 0.50, currency: "usd" },
    },
    payTo: VALID_PAY_TO,
    protocols: ["mock"],
    ...overrides,
  };
}

function createTestServer() {
  const mcpServer = new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // Register a paid tool
  mcpServer.tool(
    "paid-tool",
    "A tool that costs money",
    { input: z.string().optional() },
    async (args) => ({
      content: [{ type: "text", text: `Result: ${args.input ?? "no-input"}` }],
    }),
  );

  // Register a free tool
  mcpServer.tool(
    "free-tool",
    "A tool that is free",
    { input: z.string().optional() },
    async (args) => ({
      content: [{ type: "text", text: `Free: ${args.input ?? "no-input"}` }],
    }),
  );

  return mcpServer;
}

async function connectClientServer(mcpServer: McpServer) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, clientTransport, serverTransport };
}

describe("withPayments integration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(async () => {
    for (const fn of cleanups) {
      try { fn(); } catch {}
    }
    cleanups.length = 0;
  });

  it("creates a wrapped server without throwing", () => {
    const mcpServer = createTestServer();
    const { cleanup } = withPayments(mcpServer, makeConfig());
    cleanups.push(cleanup);
    // If we got here, it didn't throw
    expect(true).toBe(true);
  });

  it("throws on invalid payTo address", () => {
    const mcpServer = createTestServer();
    expect(() =>
      withPayments(mcpServer, makeConfig({ payTo: "0xINVALID" }))
    ).toThrow(/Invalid payTo address/);
  });

  it("returns PAYMENT_REQUIRED for paid tool without payment", async () => {
    const mcpServer = createTestServer();
    const { cleanup } = withPayments(mcpServer, makeConfig());
    cleanups.push(cleanup);

    const { client } = await connectClientServer(mcpServer);
    cleanups.push(() => client.close());

    const result = await client.callTool({ name: "paid-tool", arguments: { input: "hello" } });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);

    const parsed = JSON.parse(content[0].text);
    expect(parsed.error).toBe(ErrorCode.PAYMENT_REQUIRED);
    expect(parsed.challenge).toBeTruthy();
    expect(parsed.challenge.nonce).toBeTruthy();
    expect(parsed.challenge.amount).toBe(50); // 0.50 USD = 50 cents
    expect(parsed.challenge.protocol).toBe("mock");
  });

  it("passes through free tools without payment check", async () => {
    const mcpServer = createTestServer();
    const { cleanup } = withPayments(mcpServer, makeConfig());
    cleanups.push(cleanup);

    const { client } = await connectClientServer(mcpServer);
    cleanups.push(() => client.close());

    const result = await client.callTool({ name: "free-tool", arguments: { input: "test" } });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("Free: test");
  });

  it("executes paid tool after valid payment", async () => {
    const mcpServer = createTestServer();
    const { cleanup } = withPayments(mcpServer, makeConfig());
    cleanups.push(cleanup);

    const { client } = await connectClientServer(mcpServer);
    cleanups.push(() => client.close());

    // Step 1: Call without payment to get challenge
    const challengeResult = await client.callTool({
      name: "paid-tool",
      arguments: { input: "hello" },
    });

    expect(challengeResult.isError).toBe(true);
    const challengeContent = challengeResult.content as Array<{ type: string; text: string }>;
    const challengeData = JSON.parse(challengeContent[0].text);
    const nonce = challengeData.challenge.nonce;

    // Step 2: Call with payment proof
    const paidResult = await client.callTool({
      name: "paid-tool",
      arguments: {
        input: "hello",
        _payment: {
          nonce,
          proof: "mock-proof",
          protocol: "mock",
        },
      },
    });

    expect(paidResult.isError).toBeFalsy();
    const paidContent = paidResult.content as Array<{ type: string; text: string }>;

    // Should have the tool result + receipt
    expect(paidContent.length).toBeGreaterThanOrEqual(2);
    expect(paidContent[0].text).toBe("Result: hello");

    const receipt = JSON.parse(paidContent[1].text);
    expect(receipt._receipt).toBeTruthy();
    expect(receipt._receipt.txHash).toBeTruthy();
    expect(receipt._receipt.amountCents).toBe(50);
    expect(receipt._receipt.currency).toBe("usd");
  });
});
