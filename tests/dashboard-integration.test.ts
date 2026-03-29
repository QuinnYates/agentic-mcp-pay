import { describe, it, expect, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPayments } from "../src/index.js";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/mcp-pay-dash-integration-test.db";
const PAY_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("dashboard integration", () => {
  let cleanup: (() => void) | undefined;

  afterEach(async () => {
    cleanup?.();
    // Small delay for server close
    await new Promise(r => setTimeout(r, 50));
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("starts dashboard when config.dashboard is set", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const result = withPayments(server, {
      pricing: {}, payTo: PAY_TO, protocols: ["mock"],
      dashboard: { port: 0 }, dbPath: TEST_DB,
    });
    cleanup = result.cleanup;

    // Wait for server to start (port 0 = async)
    await new Promise(r => setTimeout(r, 100));

    expect(result.dashboardUrl).toBeTruthy();
    const res = await fetch(result.dashboardUrl!);
    expect(res.status).toBe(200);
  });

  it("does not start dashboard when config.dashboard is not set", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const result = withPayments(server, {
      pricing: {}, payTo: PAY_TO, protocols: ["mock"], dbPath: TEST_DB,
    });
    cleanup = result.cleanup;
    expect(result.dashboardUrl).toBeUndefined();
  });
});
