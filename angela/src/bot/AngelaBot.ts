import { TeamsActivityHandler, MessageFactory, ActivityTypes } from "botbuilder";
import type { AppConfig } from "../config.js";
import { isBotMentioned, teamChannelAllowed, tenantAllowed } from "../governance.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { logInfo, logWarn } from "../logger.js";

export class AngelaBot extends TeamsActivityHandler {
  constructor(
    private readonly cfg: AppConfig,
    private readonly orchestrator: Orchestrator
  ) {
    super();

    this.onMessage(async (context, next) => {
      if (context.activity.type !== ActivityTypes.Message) {
        await next();
        return;
      }

      const tenantId = context.activity.conversation?.tenantId;
      if (!tenantAllowed(this.cfg, tenantId)) {
        logWarn("teams_tenant_denied", { tenantId });
        await context.sendActivity("This tenant is not enabled for the Angela pilot.");
        return;
      }

      const teamId = (context.activity.channelData as { team?: { id?: string } } | undefined)?.team?.id;
      const channelId = context.activity.channelId;
      if (!teamChannelAllowed(this.cfg, teamId, channelId)) {
        logWarn("teams_channel_denied", { teamId, channelId });
        await context.sendActivity("This channel is not in the Angela pilot allowlist.");
        return;
      }

      if (this.cfg.teamsRequireMention && !isBotMentioned(context.activity)) {
        await next();
        return;
      }

      const text = (context.activity.text ?? "").replace(/<at[^>]*>[^<]*<\/at>/gi, "").trim();
      if (!text) {
        await context.sendActivity("Mention me with a question, for example: @Angela what is blocking the release?");
        return;
      }

      const correlationId = String(context.activity.id ?? context.activity.timestamp ?? "teams");
      logInfo("teams_message_accepted", { correlationId, channelId, teamId });

      const replyText = await this.orchestrator.generateTeamsReply(text, correlationId);
      const activity = MessageFactory.text(replyText);
      activity.replyToId = context.activity.id;
      await context.sendActivity(activity);

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const members = context.activity.membersAdded ?? [];
      for (const m of members) {
        if (m.id === context.activity.recipient.id) {
          await context.sendActivity(
            "Hi — I am **Angela** (pilot). Mention me with @Angela when you want help with release questions."
          );
        }
      }
      await next();
    });
  }
}
