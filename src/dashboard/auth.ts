import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function generateDashboardToken(): string {
  return randomBytes(32).toString("hex");
}

export function createAuthMiddleware(expectedToken: string) {
  const expectedBuf = Buffer.from(expectedToken);
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.query.token as string | undefined;
    if (!provided) { res.status(401).send("Unauthorized: token required"); return; }
    const providedBuf = Buffer.from(provided);
    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      res.status(401).send("Unauthorized: invalid token"); return;
    }
    next();
  };
}
