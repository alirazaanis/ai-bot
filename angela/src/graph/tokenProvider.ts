import fs from "fs";
import path from "path";
import { logWarn } from "../logger.js";

const CACHE_FILE = path.join(process.cwd(), ".cache", "graph-token.json");

type CacheShape = { accessToken: string; expiresAt: number };

export async function resolveGraphAccessToken(
  envToken: string | undefined,
  authHeader: string | undefined
): Promise<string | null> {
  const bearer = parseBearer(authHeader);
  if (bearer) return bearer;
  if (envToken) return envToken;

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (parsed.expiresAt < Date.now() + 60_000) {
      logWarn("graph_token_expiring_soon", { cacheFile: CACHE_FILE });
    }
    if (parsed.expiresAt <= Date.now()) {
      return null;
    }
    return parsed.accessToken;
  } catch {
    return null;
  }
}

function parseBearer(h: string | undefined): string | null {
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}
