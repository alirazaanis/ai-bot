import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "../config.js";

type Bucket = { windowStart: number; count: number };

const buckets = new Map<string, Bucket>();

/** Rate limit by client IP (used for bot and mail HTTP APIs in MVP). */
export function ipRateLimiter(cfg: AppConfig, label: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${label}:${req.ip ?? "unknown"}`;
    return rateLimitKey(cfg, key, res, next);
  };
}

function rateLimitKey(cfg: AppConfig, key: string, res: Response, next: NextFunction) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > cfg.rateLimitWindowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    next();
    return;
  }
  if (b.count >= cfg.rateLimitMaxPerConversation) {
    res.status(429).json({ error: "rate_limited", retryAfterMs: cfg.rateLimitWindowMs - (now - b.windowStart) });
    return;
  }
  b.count += 1;
  next();
}
