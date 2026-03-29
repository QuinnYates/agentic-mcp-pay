import { describe, it, expect } from "vitest";
import { generateDashboardToken, createAuthMiddleware } from "../src/dashboard/auth.js";
import type { Request, Response, NextFunction } from "express";

describe("generateDashboardToken", () => {
  it("returns a 64-char hex string", () => {
    expect(generateDashboardToken()).toMatch(/^[a-f0-9]{64}$/);
  });
  it("generates unique tokens", () => {
    expect(generateDashboardToken()).not.toBe(generateDashboardToken());
  });
});

describe("createAuthMiddleware", () => {
  const token = "abc123";
  const middleware = createAuthMiddleware(token);

  function mockReq(query: Record<string, string>): Partial<Request> {
    return { query } as any;
  }

  it("calls next() with valid token", () => {
    let called = false;
    middleware(mockReq({ token: "abc123" }) as Request, { status: () => ({ send: () => {} }) } as any, () => { called = true; });
    expect(called).toBe(true);
  });

  it("returns 401 with missing token", () => {
    let statusCode = 0;
    const res = { status(c: number) { statusCode = c; return { send() {} }; } } as any;
    let called = false;
    middleware(mockReq({}) as Request, res, () => { called = true; });
    expect(called).toBe(false);
    expect(statusCode).toBe(401);
  });

  it("returns 401 with wrong token", () => {
    let statusCode = 0;
    const res = { status(c: number) { statusCode = c; return { send() {} }; } } as any;
    let called = false;
    middleware(mockReq({ token: "wrong" }) as Request, res, () => { called = true; });
    expect(called).toBe(false);
    expect(statusCode).toBe(401);
  });
});
