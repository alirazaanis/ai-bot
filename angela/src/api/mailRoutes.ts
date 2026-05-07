import type { Express, Request, Response, RequestHandler } from "express";
import express from "express";
import type { AppConfig } from "../config.js";
import { emailSendAllowedByConfig } from "../governance.js";
import { createGraphClient } from "../graph/graphClient.js";
import { getLatestInboxMessage, getMessageById, sendDraft } from "../graph/mailService.js";
import { resolveGraphAccessToken } from "../graph/tokenProvider.js";
import { getCorrelationId } from "../middleware/correlation.js";
import { completeMailReply } from "../mail/graphMailReply.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { logError, logInfo } from "../logger.js";

export function registerMailRoutes(
  app: Express,
  cfg: AppConfig,
  orchestrator: Orchestrator,
  mailLimiter: RequestHandler
) {
  const router = express.Router();
  router.use(mailLimiter);

  router.post("/reply-draft", async (req: Request, res: Response) => {
    const correlationId = getCorrelationId(req);
    try {
      const token = await resolveGraphAccessToken(cfg.graph.accessTokenEnv, req.header("authorization"));
      if (!token) {
        res.status(401).json({
          error: "graph_token_missing",
          hint: "Run npm run auth:mail or set GRAPH_ACCESS_TOKEN, or pass Authorization: Bearer.",
        });
        return;
      }

      const requestedMessageId = (req.body?.messageId as string | undefined)?.trim();
      const maxThread = Math.min(Number(req.body?.maxThread ?? "12") || 12, 25);

      const client = createGraphClient(async () => token);

      const anchor = requestedMessageId
        ? await getMessageById(client, requestedMessageId)
        : await getLatestInboxMessage(client, correlationId);
      if (!anchor) {
        res.status(404).json({ error: "message_not_found" });
        return;
      }

      const { draftId, sent, cached: wasCached, messageId } = await completeMailReply(
        cfg,
        orchestrator,
        client,
        anchor.id,
        correlationId,
        maxThread
      );

      res.json({
        correlationId,
        cached: wasCached,
        messageId,
        draftId,
        sent,
        mode: cfg.emailMode,
      });
      logInfo("mail_reply_ok", { correlationId, messageId, draftId, sent });
    } catch (e) {
      logError("mail_reply_draft_failed", { correlationId, error: String(e) });
      res.status(500).json({ error: "mail_reply_draft_failed", correlationId, message: String(e) });
    }
  });

  router.post("/send-draft", async (req: Request, res: Response) => {
    const correlationId = getCorrelationId(req);
    try {
      const token = await resolveGraphAccessToken(cfg.graph.accessTokenEnv, req.header("authorization"));
      if (!token) {
        res.status(401).json({ error: "graph_token_missing" });
        return;
      }

      const draftId = (req.body?.draftId as string | undefined)?.trim();
      if (!draftId) {
        res.status(400).json({ error: "draftId_required" });
        return;
      }

      const client = createGraphClient(async () => token);
      const me = await client.api("/me").select("userPrincipalName").get();
      const upn = me?.userPrincipalName as string | undefined;

      if (!emailSendAllowedByConfig(cfg, upn)) {
        res.status(403).json({
          error: "send_disabled_by_configuration",
          hint: "Set EMAIL_MODE=send, EMAIL_SEND_ENABLED=true, and optional EMAIL_SEND_ALLOWLIST on this host.",
        });
        return;
      }

      await sendDraft(client, draftId, correlationId);
      res.json({ correlationId, draftId, sent: true });
    } catch (e) {
      logError("mail_send_draft_failed", { correlationId, error: String(e) });
      res.status(500).json({ error: "mail_send_draft_failed", correlationId, message: String(e) });
    }
  });

  app.use("/api/mail", router);
}
