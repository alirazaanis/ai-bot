import type { AppConfig } from "./config.js";
import type { Activity } from "botbuilder";

/**
 * **Who controls this?** The **pilot / operator** (you) via environment variables on the host
 * (`EMAIL_MODE`, `EMAIL_SEND_ENABLED`, `EMAIL_SEND_ALLOWLIST`) and the human-readable rules in
 * `docs/GOVERNANCE.md`. This is **not** Microsoft 365 DLP or transport rules — those are separate
 * layers that can still block sends outside this app.
 */

export function tenantAllowed(cfg: AppConfig, tenantId: string | undefined): boolean {
  if (!tenantId) return cfg.allowedTenantIds.length === 0;
  if (cfg.allowedTenantIds.length === 0) return true;
  return cfg.allowedTenantIds.includes(tenantId);
}

export function teamChannelAllowed(cfg: AppConfig, teamId: string | undefined, channelId: string | undefined): boolean {
  if (cfg.allowedTeamChannelKeys.size === 0) return true;
  if (!teamId || !channelId) return false;
  const key = `${teamId}:${channelId}`;
  return cfg.allowedTeamChannelKeys.has(key);
}

export function isBotMentioned(activity: Activity): boolean {
  const botId = activity.recipient?.id;
  if (!botId || !activity.entities?.length) return false;
  return activity.entities.some((e: { type?: string; mentioned?: { id?: string } }) => {
    return e.type === "mention" && e.mentioned?.id === botId;
  });
}

/** True if this deployment’s **configuration** allows Graph to send (draft → send path). */
export function emailSendAllowedByConfig(cfg: AppConfig, signedInUserPrincipalName: string | undefined): boolean {
  if (cfg.emailMode !== "send") return false;
  if (!cfg.emailSendEnabled) return false;
  if (cfg.emailSendAllowlist.size === 0) return true;
  if (!signedInUserPrincipalName) return false;
  return cfg.emailSendAllowlist.has(signedInUserPrincipalName);
}
