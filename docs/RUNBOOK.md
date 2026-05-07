# Angela MVP — Pilot runbook

This runbook covers **Email (Graph, governed)** and **Teams (Bot Framework)** for the service in [`angela/`](../angela/).

**Step-by-step Microsoft keys, portals, demo env, and Azure App Service hosting:** [MICROSOFT_DEMO_SETUP.md](./MICROSOFT_DEMO_SETUP.md).

## Prerequisites

- Azure subscription; ability to create **Azure Bot** and (optionally) **App Service** / container host with **HTTPS** public URL.
- **Microsoft Entra ID** app registration for the **bot** (multi-tenant is typical; follow your security standard).
- **Azure OpenAI** resource with a chat deployment (for example `gpt-4o-mini`).
- **Microsoft 365** (work/school) tenant **you** control. If you purchased it, use your **Global Administrator** (or equivalent) account in **Entra** to **grant admin consent** for Graph — no separate Microsoft charge for that click; it is **your** tenant permission.

Governance rules are documented in [GOVERNANCE.md](./GOVERNANCE.md).

---

## 1. Entra app (Bot Framework)

1. Register an application in Entra ID.
2. Create a **client secret** (or use certificate) and store it in **Key Vault** or app settings — map to `MICROSOFT_APP_PASSWORD` in the host environment (Key Vault references are supported on Azure App Service).
3. Set **Application (client) ID** → `MICROSOFT_APP_ID`.
4. Under **Authentication**, allow **Accounts in any organizational directory** if using multi-tenant bot registration (match your Azure Bot configuration).

## 2. Azure Bot + messaging endpoint

1. Create an **Azure Bot** resource linked to the same App ID (or create new app from the wizard).
2. Set **Messaging endpoint** to `https://<your-host>/api/messages`.
3. Ensure **Teams** channel is enabled for the bot.

## 3. Teams app (sideload)

1. Copy [`angela/teams-app/manifest.json`](../angela/teams-app/manifest.json) and replace **both** occurrences of `00000000-0000-0000-0000-000000000001` with your real **Microsoft App ID** (same value as `MICROSOFT_APP_ID`).
2. Ensure `color.png` and `outline.png` exist (run `npm install` inside `angela/`, which runs `generate-icons`).
3. Add your public hostname to `validDomains` in the manifest (for example `yourapp.azurewebsites.net` or your **ngrok** host). The template ships with `localhost` only for local tooling.
4. Zip `manifest.json`, `color.png`, and `outline.png` → upload in Teams **Manage your apps → Upload a custom app**. If the UI blocks upload, enable **custom app upload** / sideloading in **Teams admin center** while signed in as **your** tenant admin — same tenant you own; no extra fee.

## 4. Graph mail (delegated pilot)

1. Create (or reuse) an Entra app registration for **public client** device-code flow **or** use delegated auth appropriate to your security review. The included script [`angela/scripts/auth-mail.ts`](../angela/scripts/auth-mail.ts) uses **MSAL device code** with `GRAPH_CLIENT_ID`.
2. API permissions (delegated): at minimum `User.Read`, `Mail.Read`, `Mail.ReadWrite`, `offline_access`. **Grant admin consent** in Entra (you, if your account is **Global Administrator** on the tenant you purchased).
3. In the app registration, enable **public client flows** if using device code (`npm run auth:mail`).
4. Copy [`angela/.env.example`](../angela/.env.example) to `angela/.env` and fill values. Run from `angela/`:

   ```bash
   npm install
   npm run auth:mail
   ```

   Tokens are cached in `angela/.cache/graph-token.json` (gitignored). For production, replace with a secure token acquisition strategy (for example interactive browser + token cache in a vault-backed store).

5. Optional: pass `Authorization: Bearer <access_token>` to mail APIs instead of the cache.

## 5. Azure OpenAI

Set in `.env`:

- `AZURE_OPENAI_ENDPOINT` — resource endpoint, no trailing slash required (the code trims).
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT_NAME` — deployment name matching your model deployment.
- `AZURE_OPENAI_API_VERSION` — API version supported by your resource.

If these are missing, the bot still runs but returns a **configuration notice** instead of LLM output.

## 6. Run the service

From `angela/`:

```bash
npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

Expose `/api/messages` over **HTTPS** (ngrok, Azure App Service, etc.). Health check: `GET /health`.

---

## HTTP API (mail)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/mail/reply-draft` | Body: `{ "messageId": "<optional>", "maxThread": 12 }`. Loads thread, calls Azure OpenAI, builds a reply draft; **sends** when your **host env** allows (`EMAIL_MODE=send`, `EMAIL_SEND_ENABLED=true`, allowlist — see [GOVERNANCE](./GOVERNANCE.md)). Response includes `sent: true|false`. |
| POST | `/api/mail/send-draft` | Body: `{ "draftId": "<id>" }`. Sends an existing draft only when the same **env-based** send rules allow. |

Both endpoints accept optional `Authorization: Bearer` for the user token.

### Automatic mail replies (demo)

With **`EMAIL_AUTO_REPLY_ENABLED=true`** (default in [`.env.example`](../angela/.env.example)), the service **polls** the inbox on `EMAIL_AUTO_POLL_INTERVAL_SEC` and runs the **same** reply path as `/api/mail/reply-draft` (the sample env uses **send** — see [GOVERNANCE.md](./GOVERNANCE.md)). Watermark and processed-id files live under `angela/.cache/`. To re-process from a clean slate, stop the app and remove `mail-autoreply-watermark.json` / `mail-autoreply-processed.json`.

---

## Graph change notifications (optional)

If you add mail or Teams **subscriptions**, Microsoft sends a **validation token** to your notification URL. A stub endpoint is provided:

- **GET** `/api/graph/lifecycle?validationToken=...` — responds with the token in **plain text** (required by Graph).

Process **POST** notifications in a future iteration (queue + renewal job). Do not expose this URL without authentication hardening for production POST bodies.

---

## Permissions matrix (MVP)

| Area | Permission type | Examples | Notes |
|------|-----------------|----------|------|
| Teams bot | Bot Framework / Entra app | Bot messaging | Uses `MICROSOFT_APP_ID` / secret |
| Mail | Delegated | `Mail.Read`, `Mail.ReadWrite`, `User.Read`, `offline_access` | Pilot user; avoid org-wide application mail until governance approves |
| Teams reads (optional) | Application / Delegated | `ChannelMessage.Read.All`, `Chat.Read.All` | **High sensitivity** — omit for MVP if bot-visible context is enough |

---

## Troubleshooting

- **401 / consent on Graph:** Re-run `npm run auth:mail`; confirm admin consent and correct scopes.
- **429 from Graph:** The client uses limited retries with backoff; reduce thread size or frequency; check `retry-after` headers in logs.
- **Bot does not answer:** Confirm messaging endpoint URL, secret, and manifest **botId** match `MICROSOFT_APP_ID`. Check Azure Bot “Test in Web Chat” vs Teams sideload.
- **403 send-draft (`send_disabled_by_configuration`):** Your **deployment env** blocks send: `EMAIL_MODE` not `send`, `EMAIL_SEND_ENABLED` not `true`, or UPN not on `EMAIL_SEND_ALLOWLIST` when that list is non-empty.

---

## Secret rotation

- Rotate **Bot** client secret in Entra and Azure Bot; update host settings / Key Vault; restart app.
- Invalidate mail tokens by deleting `angela/.cache/graph-token.json` and re-running `npm run auth:mail`.

---

## Packaging the Teams app (ZIP)

From `angela/teams-app/`:

```bash
zip angela-teams.zip manifest.json color.png outline.png
```

Upload `angela-teams.zip` in Teams.
