import type { Client } from "@microsoft/microsoft-graph-client";
import pRetry from "p-retry";
import { logError, logInfo } from "../logger.js";

export interface MailMessageSummary {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  bodyText: string;
  from?: string;
  /** Lowercased sender SMTP address when available */
  fromAddress?: string;
  receivedDateTime?: string;
}

export async function getLatestInboxMessage(client: Client, _correlationId: string): Promise<MailMessageSummary | null> {
  const res = await graphCall(() =>
    client
      .api("/me/mailFolders/inbox/messages")
      .top(1)
      .orderby("receivedDateTime DESC")
      .select("id,subject,bodyPreview,body,from,receivedDateTime,conversationId,isDraft")
      .get()
  );
  const msg = res?.value?.[0];
  if (!msg) return null;
  return normalizeMessage(msg);
}

export async function getMessageById(client: Client, id: string): Promise<MailMessageSummary | null> {
  const msg = await graphCall(() =>
    client
      .api(`/me/messages/${id}`)
      .select("id,subject,bodyPreview,body,from,receivedDateTime,conversationId,isDraft")
      .get()
  );
  return msg ? normalizeMessage(msg) : null;
}

/**
 * Inbox messages with `receivedDateTime` strictly after `isoUtc` (RFC3339).
 * Fetches recent messages then filters in-process (avoids OData datetime literal issues).
 */
export async function getInboxMessagesReceivedAfter(
  client: Client,
  isoUtc: string,
  top: number
): Promise<MailMessageSummary[]> {
  const fetchTop = Math.min(50, Math.max(top * 4, top + 10));
  const res = await graphCall(() =>
    client
      .api("/me/mailFolders/inbox/messages")
      .orderby("receivedDateTime desc")
      .top(fetchTop)
      .select("id,subject,bodyPreview,body,from,receivedDateTime,conversationId,isDraft")
      .get()
  );
  const list = (res?.value ?? []) as Record<string, unknown>[];
  const rows = list
    .filter((m) => !m.isDraft)
    .map((m) => normalizeMessage(m))
    .filter((m) => m.receivedDateTime && m.receivedDateTime > isoUtc)
    .sort((a, b) => (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""));
  return rows.slice(0, top);
}

export async function getConversationContext(
  client: Client,
  conversationId: string,
  maxMessages: number,
  _correlationId: string
): Promise<MailMessageSummary[]> {
  const safe = conversationId.replace(/'/g, "''");
  const res = await graphCall(() =>
    client
      .api("/me/messages")
      .filter(`conversationId eq '${safe}'`)
      .orderby("receivedDateTime asc")
      .top(maxMessages)
      .select("id,subject,bodyPreview,body,from,receivedDateTime,conversationId,isDraft")
      .get()
  );
  const list = (res?.value ?? []) as Record<string, unknown>[];
  return list.filter((m) => !m.isDraft).map((m) => normalizeMessage(m));
}

export async function createReplyDraft(
  client: Client,
  messageId: string,
  htmlBody: string,
  correlationId: string
): Promise<{ draftId: string }> {
  const draft = await graphCall(() => client.api(`/me/messages/${messageId}/createReply`).post({}));
  const draftId = draft?.id as string;
  if (!draftId) throw new Error("createReply_missing_id");

  await graphCall(() =>
    client.api(`/me/messages/${draftId}`).patch({
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
    })
  );

  logInfo("mail_draft_created", { correlationId, messageId, draftId });
  return { draftId };
}

export async function sendDraft(client: Client, draftId: string, correlationId: string): Promise<void> {
  await graphCall(() => client.api(`/me/messages/${draftId}/send`).post({}));
  logInfo("mail_sent", { correlationId, draftId });
}

async function graphCall<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(fn, {
    retries: 4,
    factor: 2,
    minTimeout: 500,
    maxTimeout: 8000,
    onFailedAttempt: (e) => {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429 || (status && status >= 500)) return;
      if (status && status >= 400 && status < 500) throw e;
    },
  });
}

function normalizeMessage(msg: Record<string, unknown>): MailMessageSummary {
  const body = msg.body as { content?: string; contentType?: string } | undefined;
  const from = msg.from as { emailAddress?: { name?: string; address?: string } } | undefined;
  const bodyText =
    body?.contentType === "html"
      ? stripHtml(String(body?.content ?? ""))
      : String(body?.content ?? msg.bodyPreview ?? "");

  const addr = from?.emailAddress?.address?.toLowerCase();
  return {
    id: String(msg.id),
    conversationId: msg.conversationId as string | undefined,
    subject: msg.subject as string | undefined,
    bodyPreview: msg.bodyPreview as string | undefined,
    bodyText,
    from: from?.emailAddress?.address
      ? `${from.emailAddress.name ?? ""} <${from.emailAddress.address}>`.trim()
      : undefined,
    fromAddress: addr,
    receivedDateTime: msg.receivedDateTime as string | undefined,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
