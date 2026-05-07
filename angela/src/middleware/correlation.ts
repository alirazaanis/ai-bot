import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export const CORRELATION_HEADER = "x-correlation-id";

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = (req.get(CORRELATION_HEADER) ?? randomUUID()) as string;
  (req as Request & { correlationId: string }).correlationId = id;
  res.setHeader(CORRELATION_HEADER, id);
  next();
}

export function getCorrelationId(req: Request): string {
  return (req as Request & { correlationId?: string }).correlationId ?? "unknown";
}
