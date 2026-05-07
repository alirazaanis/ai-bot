# Angela MVP service

Node **TypeScript** service implementing:

- **Teams:** `POST /api/messages` — Microsoft pushes each chat turn; the bot **auto-replies**. [`.env.example`](./.env.example) sets **`TEAMS_REQUIRE_MENTION=false`** so you do not need `@Angela` in a **1:1 or pilot** chat (set `true` for busy shared channels).
- **Mail:** Inbox **poller is on by default** in [`.env.example`](./.env.example) (`EMAIL_AUTO_REPLY_ENABLED=true`) with **`EMAIL_MODE=send`** so new mail gets **real sent replies** after you run `npm run auth:mail`. Tighten to drafts for safer pilots.

## Quick start

1. `cp .env.example .env` (Windows: `copy .env.example .env`) — **demo-friendly defaults are already ON.**
2. Fill `MICROSOFT_APP_*`, `GRAPH_CLIENT_ID`, Azure OpenAI — **[Microsoft demo setup (includes Azure App Service)](../docs/MICROSOFT_DEMO_SETUP.md)**.
3. `npm install` → `npm run auth:mail` → `npm run dev` → **ngrok** HTTPS to `/api/messages`.

Full pilot steps: [../docs/RUNBOOK.md](../docs/RUNBOOK.md). Governance: [../docs/GOVERNANCE.md](../docs/GOVERNANCE.md).
