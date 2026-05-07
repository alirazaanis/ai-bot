import "dotenv/config";

function splitComma(s: string | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export type EmailMode = "draft" | "send";

export interface AppConfig {
  port: number;
  microsoftAppId: string;
  microsoftAppPassword: string;
  allowedTenantIds: string[];
  allowedTeamChannelKeys: Set<string>;
  teamsRequireMention: boolean;
  emailMode: EmailMode;
  emailSendEnabled: boolean;
  emailSendAllowlist: Set<string>;
  mailFolderWellKnown: string;
  logMessageBodies: boolean;
  logLlmIo: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxPerConversation: number;
  azureOpenAi: {
    endpoint: string;
    apiKey: string;
    deployment: string;
    apiVersion: string;
  };
  graph: {
    clientId: string;
    tenantId: string;
    scopes: string[];
    accessTokenEnv?: string;
  };
  /** Poll inbox and run the same mail reply path as HTTP (draft vs send per `EMAIL_*` env vars) */
  emailAutoReplyEnabled: boolean;
  emailAutoPollIntervalSec: number;
  emailAutoPollMaxBatch: number;
  emailAutoReplyMaxThread: number;
}

export function loadConfig(): AppConfig {
  const allowedTeamChannelKeys = new Set(
    (process.env.ALLOWED_TEAM_CHANNEL_KEYS ?? "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
  );

  return {
    port: Number(process.env.PORT ?? "3978"),
    microsoftAppId: process.env.MICROSOFT_APP_ID ?? "",
    microsoftAppPassword: process.env.MICROSOFT_APP_PASSWORD ?? "",
    allowedTenantIds: splitComma(process.env.ALLOWED_TENANT_IDS),
    allowedTeamChannelKeys,
    teamsRequireMention: (process.env.TEAMS_REQUIRE_MENTION ?? "true").toLowerCase() !== "false",
    emailMode: (process.env.EMAIL_MODE === "send" ? "send" : "draft") as EmailMode,
    emailSendEnabled: (process.env.EMAIL_SEND_ENABLED ?? "").toLowerCase() === "true",
    emailSendAllowlist: new Set(splitComma(process.env.EMAIL_SEND_ALLOWLIST)),
    mailFolderWellKnown: process.env.MAIL_FOLDER_WELL_KNOWN ?? "inbox",
    logMessageBodies: (process.env.LOG_MESSAGE_BODIES ?? "").toLowerCase() === "true",
    logLlmIo: (process.env.LOG_LLM_IO ?? "").toLowerCase() === "true",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"),
    rateLimitMaxPerConversation: Number(process.env.RATE_LIMIT_MAX_PER_CONVERSATION ?? "20"),
    azureOpenAi: {
      endpoint: (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, ""),
      apiKey: process.env.AZURE_OPENAI_API_KEY ?? "",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "gpt-4o-mini",
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview",
    },
    graph: {
      clientId: process.env.GRAPH_CLIENT_ID ?? "",
      tenantId: process.env.GRAPH_TENANT_ID ?? "common",
      scopes: (process.env.GRAPH_SCOPES ?? "offline_access User.Read Mail.Read Mail.ReadWrite")
        .split(/\s+/)
        .filter(Boolean),
      accessTokenEnv: process.env.GRAPH_ACCESS_TOKEN,
    },
    emailAutoReplyEnabled: (process.env.EMAIL_AUTO_REPLY_ENABLED ?? "").toLowerCase() === "true",
    emailAutoPollIntervalSec: Number(process.env.EMAIL_AUTO_POLL_INTERVAL_SEC ?? "45"),
    emailAutoPollMaxBatch: Math.min(Number(process.env.EMAIL_AUTO_POLL_MAX_BATCH ?? "15") || 15, 50),
    emailAutoReplyMaxThread: Math.min(Number(process.env.EMAIL_AUTO_REPLY_MAX_THREAD ?? "12") || 12, 25),
  };
}
