# Angela MVP — Pilot governance

This document operationalizes the rules in the Angela MVP plan before any production rollout.

## Who controls mail “send vs draft”?

**You do (the pilot operator / whoever deploys the service).** The running app reads **environment variables** on the host (`EMAIL_MODE`, `EMAIL_SEND_ENABLED`, `EMAIL_SEND_ALLOWLIST`). That is what earlier notes called “policy” in the loose sense of **governance**: it is **not** a separate Microsoft product managing Angela, and it is **not** the same thing as Microsoft 365 **DLP** or Exchange **transport rules** (those can still block or modify mail outside this codebase).

## Allowlists

| Dimension | MVP rule | Configuration |
|-----------|----------|----------------|
| **Teams tenants** | Single pilot Entra tenant | `ALLOWED_TENANT_IDS` (comma-separated) in environment |
| **Teams channels** | Optional channel allowlist; empty = all channels where bot is installed | `ALLOWED_TEAM_CHANNEL_KEYS` (`teamId:channelId` per line in env or governance file) |
| **Mail** | Pilot mailboxes only; folder scope recommended | `MAIL_FOLDER_WELL_KNOWN` (default `inbox`), delegated user = token subject |

**Team/channel key format:** `{teamId}:{channelId}` (Azure Bot / Teams provide team and channel ids on each activity).

## Email auto-reply (polling)

When `EMAIL_AUTO_REPLY_ENABLED=true`, the service **polls** the signed-in mailbox on an interval and runs the **same** mail reply logic as `POST /api/mail/reply-draft`: **draft-only** when `EMAIL_MODE=draft`, or **create then send** when `EMAIL_MODE=send` together with `EMAIL_SEND_ENABLED` and the **Email: draft vs send** table below. New messages are only those received **after** a watermark file under `.cache/` (first run does not blast old inbox).

## Email: draft vs send

| Mode | Meaning | Enforcement |
|------|---------|-------------|
| **Draft** | Create an Outlook **draft** reply only | `EMAIL_MODE=draft` |
| **Send** | After building the reply, **send** it via Graph | `EMAIL_MODE=send` requires `EMAIL_SEND_ENABLED=true` and optional `EMAIL_SEND_ALLOWLIST` (comma-separated UPNs) |

**Note:** [`angela/.env.example`](../angela/.env.example) is intentionally **demo-first** (`EMAIL_MODE=send`, `EMAIL_SEND_ENABLED=true`, `EMAIL_AUTO_REPLY_ENABLED=true`). For a cautious production pilot, switch back to **draft** until you trust the model and scope.

If `EMAIL_SEND_ALLOWLIST` is set, only matching signed-in principals may trigger send (when using delegated mail auth).

## Teams trigger

| Rule | MVP default | Configuration |
|------|-------------|---------------|
| **@mention** | **`angela/.env.example` ships `TEAMS_REQUIRE_MENTION=false`** so pilot demos reply without typing `@Angela` in 1:1 or a dedicated chat | Set `true` for shared channels to reduce noise/cost |
| **Dedicated channel** | If `TEAMS_REQUIRE_MENTION=false`, the bot responds to **every** message where it is installed | Use a **pilot channel or 1:1 with the bot**, not a large production channel |

## Logging and retention

| Data | Logged | Notes |
|------|--------|-------|
| Correlation ID | Yes | Propagated across bot turn, Graph, LLM |
| Message / activity IDs | Yes | Microsoft Graph and Teams identifiers only |
| Full mail bodies / chat text | **Configurable** | Default: include truncated excerpts in debug; set `LOG_MESSAGE_BODIES=false` in pilot tenants with strict DLP |
| Prompts / completions | **Optional** | `LOG_LLM_IO=false` by default; enable only under NDA test |

Retention: treat application logs per your org policy; this MVP does not ship a log store.

## Admin consent alignment (Graph)

If **you** are the **tenant owner / Global Administrator**, you approve these yourself in **Entra → App registrations → API permissions → Grant admin consent** — no separate Microsoft product or fee for that action.

Request the **minimal** delegated permissions for the pilot:

- **Mail:** `Mail.Read`, `Mail.ReadWrite` (draft and send), `offline_access`, `User.Read`
- **Bot:** No Graph scopes on the bot app for “conversation-only” replies; add scopes only if enabling Graph thread fetch (documented separately in [RUNBOOK.md](./RUNBOOK.md))

Do not request `Chat.Read.All` / `ChannelMessage.Read.All` unless **you** have explicitly decided the risk is acceptable and the feature requires it.
