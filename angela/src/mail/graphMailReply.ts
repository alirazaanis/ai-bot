import type { AppConfig } from "../config.js";
import { emailSendAllowedByConfig } from "../governance.js";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  createReplyDraft,
  getConversationContext,
  getMessageById,
  sendDraft,
} from "../graph/mailService.js";
import { logInfo } from "../logger.js";
import { Orchestrator, plainTextToHtmlEmail } from "../orchestrator/orchestrator.js";
import { MAIL_DRAFT_CACHE_TTL_MS, mailDraftCache } from "./mailDraftCache.js";

/**
 * One path for “reply to this mail”: LLM body → Graph reply draft → **send** only when
 * **deployment configuration** allows (`EMAIL_MODE`, `EMAIL_SEND_ENABLED`, `EMAIL_SEND_ALLOWLIST`).
 * Used by HTTP API and the inbox auto-reply poller.
 */
export async function completeMailReply(
  cfg: AppConfig,
  orchestrator: Orchestrator,
  client: Client,
  anchorMessageId: string,
  correlationId: string,
  maxThread: number
): Promise<{ draftId: string; sent: boolean; cached: boolean; messageId: string }> {
  const entry = mailDraftCache.get(anchorMessageId);
  let draftId: string;
  let cached = false;

  if (entry && Date.now() - entry.createdAt < MAIL_DRAFT_CACHE_TTL_MS) {
    draftId = entry.draftId;
    cached = true;
  } else {
    const anchor = await getMessageById(client, anchorMessageId);
    if (!anchor) {
      throw new Error("message_not_found");
    }

    const conversationId = anchor.conversationId;
    const thread = conversationId
      ? await getConversationContext(client, conversationId, maxThread, correlationId)
      : [anchor];

    const { plainText } = await orchestrator.generateMailReply(thread, correlationId);
    const html = plainTextToHtmlEmail(plainText);

    const created = await createReplyDraft(client, anchor.id, html, correlationId);
    draftId = created.draftId;
    mailDraftCache.set(anchorMessageId, { draftId, createdAt: Date.now() });
  }

  const me = await client.api("/me").select("userPrincipalName").get();
  const upn = me?.userPrincipalName as string | undefined;

  const shouldSend = emailSendAllowedByConfig(cfg, upn);
  let sent = false;
  if (shouldSend) {
    await sendDraft(client, draftId, correlationId);
    sent = true;
    mailDraftCache.delete(anchorMessageId);
    logInfo("mail_reply_sent", { correlationId, messageId: anchorMessageId, draftId, cached });
  } else {
    logInfo("mail_reply_draft_only", { correlationId, messageId: anchorMessageId, draftId, cached });
  }

  return { draftId, sent, cached, messageId: anchorMessageId };
}
