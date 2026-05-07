# Angela (AI bot) — Microsoft 365 MVP

Angela is a **Microsoft 365–oriented MVP**: a **Teams bot** (Bot Framework) that replies in chat, plus **Outlook mail** automation via **Microsoft Graph** (draft or send, with an optional inbox poller). LLM replies use **Azure OpenAI** when configured.

## Repository layout

| Path | Purpose |
|------|---------|
| [`angela/`](./angela/) | Node **TypeScript** service (`npm install`, `npm run dev`, `npm start`) |
| [`docs/`](./docs/) | Runbook, Microsoft demo setup, governance |
| [`config/`](./config/) | Example governance JSON |

## Quick start

1. **Prerequisites:** work/school Microsoft 365 tenant, Azure subscription for hosting/OpenAI (see [docs/MICROSOFT_DEMO_SETUP.md](./docs/MICROSOFT_DEMO_SETUP.md)).
2. **Configure:** `cd angela` → copy [`.env.example`](./angela/.env.example) to `.env` → add bot credentials, Graph app id, Azure OpenAI (optional).
3. **Mail sign-in (pilot):** `npm run auth:mail` (device code) to cache a delegated token under `angela/.cache/`.
4. **Run locally:** `npm run dev` → default **http://localhost:3978** (use **HTTPS** via [Azure App Service](./docs/MICROSOFT_DEMO_SETUP.md#part-g--azure-app-service-demo-hosting), your domain, or ngrok for Teams).

## Documentation

- **[Microsoft demo setup](./docs/MICROSOFT_DEMO_SETUP.md)** — Entra app, Azure Bot, App Service, Teams manifest, env vars  
- **[Runbook](./docs/RUNBOOK.md)** — Operations and HTTP APIs  
- **[Governance](./docs/GOVERNANCE.md)** — Draft vs send, allowlists, logging  

## Remote

Default public clone URL (adjust if you fork):

```bash
git clone https://github.com/alirazaanis/ai-bot.git
```
