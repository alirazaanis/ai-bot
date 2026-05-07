import OpenAI from "openai";
import type { AppConfig } from "../config.js";
import type { MailMessageSummary } from "../graph/mailService.js";
import { logInfo, logWarn } from "../logger.js";

const SYSTEM_MAIL = `You are Angela, an AI release manager assistant drafting email replies in Microsoft 365.
Rules:
- Be concise, professional, and accurate.
- If you lack facts, say what you need rather than inventing release or ticket details.
- Output plain text only (no HTML). The caller will wrap your text as HTML.`;

const SYSTEM_TEAMS = `You are Angela, an AI release manager assistant replying inside Microsoft Teams.
Rules:
- Be concise and helpful.
- If you lack facts, ask a short clarifying question instead of guessing.
- Plain text only (Teams will render it).`;

export class Orchestrator {
  private client: OpenAI | null;

  constructor(private readonly cfg: AppConfig) {
    const { endpoint, apiKey, deployment, apiVersion } = cfg.azureOpenAi;
    if (!endpoint || !apiKey) {
      this.client = null;
      logWarn("orchestrator_disabled_missing_openai", {});
      return;
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${deployment}`,
      defaultQuery: { "api-version": apiVersion },
      defaultHeaders: { "api-key": apiKey },
    });
  }

  async generateMailReply(
    thread: MailMessageSummary[],
    correlationId: string
  ): Promise<{ plainText: string }> {
    if (!this.client) {
      return {
        plainText:
          "Angela is not configured with Azure OpenAI yet. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.",
      };
    }

    const transcript = thread
      .map((m, i) => `#${i + 1} ${m.from ?? "unknown"} @ ${m.receivedDateTime ?? ""}\n${truncate(m.bodyText, 4000)}`)
      .join("\n\n---\n\n");

    if (this.cfg.logMessageBodies) {
      logInfo("llm_mail_context", { correlationId, transcriptChars: transcript.length });
    }

    const completion = await this.client.chat.completions.create({
      model: this.cfg.azureOpenAi.deployment,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_MAIL },
        {
          role: "user",
          content: `Here is the email thread (oldest to newest). Draft a reply to the latest message.\n\n${truncate(transcript, 120_000)}`,
        },
      ],
    });

    const plainText = completion.choices[0]?.message?.content?.trim() ?? "";
    if (this.cfg.logLlmIo) {
      logInfo("llm_mail_output", { correlationId, chars: plainText.length });
    }
    return { plainText: plainText || "(empty model response)" };
  }

  async generateTeamsReply(userText: string, correlationId: string): Promise<string> {
    if (!this.client) {
      return "Angela is not configured with Azure OpenAI yet. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.";
    }
    if (this.cfg.logMessageBodies) {
      logInfo("llm_teams_context", { correlationId, userChars: userText.length });
    }
    const completion = await this.client.chat.completions.create({
      model: this.cfg.azureOpenAi.deployment,
      temperature: 0.35,
      messages: [
        { role: "system", content: SYSTEM_TEAMS },
        { role: "user", content: userText },
      ],
    });
    const out = completion.choices[0]?.message?.content?.trim() ?? "";
    if (this.cfg.logLlmIo) {
      logInfo("llm_teams_output", { correlationId, chars: out.length });
    }
    return out || "(empty model response)";
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[truncated]`;
}

export function plainTextToHtmlEmail(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
  return `<html><body>${paragraphs.join("\n")}</body></html>`;
}
