import express, { type Express, type Request } from "express";
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from "botbuilder";
import type { AppConfig } from "./config.js";
import { AngelaBot } from "./bot/AngelaBot.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { registerMailRoutes } from "./api/mailRoutes.js";
import { correlationMiddleware } from "./middleware/correlation.js";
import { ipRateLimiter } from "./middleware/rateLimit.js";
import { logError, logInfo } from "./logger.js";

export function createApp(cfg: AppConfig): { app: Express; orchestrator: InstanceType<typeof Orchestrator> } {
  const orchestrator = new Orchestrator(cfg);
  const bot = new AngelaBot(cfg, orchestrator);

  const authentication = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: cfg.microsoftAppId,
    MicrosoftAppPassword: cfg.microsoftAppPassword,
  });

  const adapter = new CloudAdapter(authentication);

  adapter.onTurnError = async (context, error) => {
    logError("bot_turn_error", { message: error.message, stack: error.stack });
    await context.sendActivity("Sorry — something went wrong processing this message.");
  };

  const app = express();

  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(correlationMiddleware);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "angela-mvp" });
  });

  app.get("/api/graph/lifecycle", (req, res) => {
    const token = typeof req.query.validationToken === "string" ? req.query.validationToken : undefined;
    if (token) {
      res.status(200).contentType("text/plain").send(token);
      return;
    }
    res.status(400).contentType("text/plain").send("missing validationToken");
  });

  const botLimiter = ipRateLimiter(cfg, "bot");
  app.post("/api/messages", botLimiter, (req, res) => {
    adapter.process(req, res, async (context) => {
      await bot.run(context);
    });
  });

  const mailLimiter = ipRateLimiter(cfg, "mail");
  registerMailRoutes(app, cfg, orchestrator, mailLimiter);

  return { app, orchestrator };
}

export function listenApp(app: Express, cfg: AppConfig) {
  app.listen(cfg.port, () => {
    logInfo("server_listening", { port: cfg.port });
  });
}
