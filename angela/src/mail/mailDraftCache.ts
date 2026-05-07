/** In-process dedupe for draft creation (HTTP API + auto-reply poller). */
export const mailDraftCache = new Map<string, { draftId: string; createdAt: number }>();
export const MAIL_DRAFT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
