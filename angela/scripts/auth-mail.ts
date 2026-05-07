/**
 * Pilot helper: acquire delegated Graph token via device code and cache to .cache/graph-token.json
 * Run from angela/:  npm run auth:mail
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PublicClientApplication, LogLevel } from "@azure/msal-node";

const cacheDir = path.join(process.cwd(), ".cache");
const cacheFile = path.join(cacheDir, "graph-token.json");

const clientId = process.env.GRAPH_CLIENT_ID;
const tenantId = process.env.GRAPH_TENANT_ID ?? "common";
const scopes = (process.env.GRAPH_SCOPES ?? "offline_access User.Read Mail.Read Mail.ReadWrite")
  .split(/\s+/)
  .filter(Boolean);

async function main() {
  if (!clientId) {
    console.error("Set GRAPH_CLIENT_ID in .env (Entra public client / native redirect app).");
    process.exit(1);
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  const pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    system: {
      loggerOptions: { logLevel: LogLevel.Info },
    },
  });

  const accounts = await pca.getTokenCache().getAllAccounts();
  const silentRequest = {
    scopes,
    account: accounts[0],
  };

  try {
    if (accounts[0]) {
      const silent = await pca.acquireTokenSilent(silentRequest);
      writeCache(silent);
      console.log("Refreshed token silently. Expires:", silent.expiresOn?.toISOString());
      return;
    }
  } catch {
    // fall through to device code
  }

  const device = await pca.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (res) => {
      console.log(res.message);
    },
  });

  writeCache(device);
  console.log("Token acquired. Expires:", device.expiresOn?.toISOString());
  console.log("Cached to", cacheFile);
}

function writeCache(result: { accessToken: string; expiresOn?: Date | null }) {
  const payload = {
    accessToken: result.accessToken,
    expiresAt: result.expiresOn ? result.expiresOn.getTime() : Date.now() + 3600_000,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
