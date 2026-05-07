import fs from "fs";
import path from "path";
import type { AppConfig } from "../config.js";
import { createGraphClient } from "../graph/graphClient.js";
import { getInboxMessagesReceivedAfter } from "../graph/mailService.js";
import { resolveGraphAccessToken } from "../graph/tokenProvider.js";
import { logError, logInfo, logWarn } from "../logger.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { completeMailReply } from "./graphMailReply.js";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const WATERMARK_FILE = path.join(CACHE_DIR, "mail-autoreply-watermark.json");
const PROCESSED_FILE = path.join(CACHE_DIR, "mail-autoreply-processed.json");
const MAX_PROCESSED_IDS = 400;

type WatermarkState = { afterReceivedDateTime: string };
type ProcessedState = { ids: string[] };

export function startEmailAutoReplyLoop(cfg: AppConfig, orchestrator: Orchestrator): (() => void) | undefined {
  if (!cfg.emailAutoReplyEnabled) {
    logInfo("mail_autoreply_disabled", {});
    return undefined;
  }

  const intervalMs = Math.max(15, cfg.emailAutoPollIntervalSec) * 1000;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    const correlationId = `autoreply-${Date.now()}`;
    try {
      const token = await resolveGraphAccessToken(cfg.graph.accessTokenEnv, undefined);
      if (!token) {
        logWarn("mail_autoreply_skip_no_token", { correlationId });
        return;
      }

      const client = createGraphClient(async () => token);
      const me = await client.api("/me").select("mail,userPrincipalName").get();
      const selfEmails = new Set<string>();
      const mail = me?.mail as string | undefined;
      const upn = me?.userPrincipalName as string | undefined;
      if (mail) selfEmails.add(mail.toLowerCase());
      if (upn?.includes("@")) selfEmails.add(upn.toLowerCase());

      const watermark = loadOrInitWatermark();
      const after = watermark.afterReceivedDateTime;

      const batch = await getInboxMessagesReceivedAfter(client, after, cfg.emailAutoPollMaxBatch);
      if (batch.length === 0) return;

      const processed = loadProcessedIds();
      let newestInBatch = after;

      for (const msg of batch) {
        if (msg.receivedDateTime && msg.receivedDateTime > newestInBatch) {
          newestInBatch = msg.receivedDateTime;
        }

        if (processed.has(msg.id)) continue;
        if (msg.fromAddress && selfEmails.has(msg.fromAddress)) {
          processed.add(msg.id);
          continue;
        }

        try {
          const { draftId, sent, cached } = await completeMailReply(
            cfg,
            orchestrator,
            client,
            msg.id,
            correlationId,
            cfg.emailAutoReplyMaxThread
          );
          logInfo("mail_autoreply_done", { correlationId, messageId: msg.id, draftId, sent, cached });
          processed.add(msg.id);
        } catch (e) {
          logError("mail_autoreply_message_failed", { correlationId, messageId: msg.id, error: String(e) });
        }
      }

      if (newestInBatch !== after) {
        saveWatermark({ afterReceivedDateTime: newestInBatch });
      }
      saveProcessedIds(processed);
    } catch (e) {
      logError("mail_autoreply_tick_failed", { correlationId, error: String(e) });
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  logInfo("mail_autoreply_started", {
    intervalMs,
    emailMode: cfg.emailMode,
    emailSendEnabled: cfg.emailSendEnabled,
  });

  return () => {
    if (timer) clearInterval(timer);
  };
}

function loadOrInitWatermark(): WatermarkState {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  try {
    const raw = fs.readFileSync(WATERMARK_FILE, "utf8");
    return JSON.parse(raw) as WatermarkState;
  } catch {
    const afterReceivedDateTime = new Date().toISOString();
    const initial: WatermarkState = { afterReceivedDateTime };
    fs.writeFileSync(WATERMARK_FILE, JSON.stringify(initial, null, 2), "utf8");
    logInfo("mail_autoreply_watermark_init", { afterReceivedDateTime });
    return initial;
  }
}

function saveWatermark(s: WatermarkState) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(WATERMARK_FILE, JSON.stringify(s, null, 2), "utf8");
}

function loadProcessedIds(): Set<string> {
  try {
    const raw = fs.readFileSync(PROCESSED_FILE, "utf8");
    const p = JSON.parse(raw) as ProcessedState;
    return new Set(p.ids ?? []);
  } catch {
    return new Set();
  }
}

function saveProcessedIds(ids: Set<string>) {
  const arr = [...ids];
  const trimmed = arr.slice(-MAX_PROCESSED_IDS);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify({ ids: trimmed }, null, 2), "utf8");
}
