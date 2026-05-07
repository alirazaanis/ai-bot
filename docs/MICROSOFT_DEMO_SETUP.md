# Microsoft demo setup — keys, portals, and env (Angela MVP)

Use this checklist with a **work or school Microsoft 365** tenant (for example the [Microsoft 365 Developer Program](https://developer.microsoft.com/microsoft-365/dev-program)). **Personal (consumer) Teams** is not a reliable target for the Teams + Graph chat features in this demo.

You will obtain:

1. **Bot credentials** — Teams talks to your app via the Bot Framework (`MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`).
2. **Public HTTPS URL** — required for the bot messaging endpoint. **Recommended for demos:** [Azure App Service](#part-g--azure-app-service-demo-hosting) (`https://<app>.azurewebsites.net`). Alternatives: your own domain + reverse proxy, **ngrok** for quick local tests.
3. **Graph token for mail** — delegated sign-in for your mailbox (`npm run auth:mail` locally → `.cache/graph-token.json`, or short-lived token in App Service **Application settings** — see App Service section).
4. **Azure OpenAI** — model deployment and API key for real replies (optional for a “connectivity only” demo).

---

## Part A — Azure subscription and Entra tenant

**Microsoft 365 (Teams, Exchange, …) and Azure App Service are not the same bill.**

- **M365 / work or school** gives you an **Entra ID tenant** and Teams. You create **App registrations** there for the bot and Graph.
- **Azure App Service** needs a separate **Azure subscription** (pay-as-you-go, credits, CSP, etc.). You can link it to the **same tenant** you use for Teams — that is the usual setup.

Steps:

1. Sign in to [Azure Portal](https://portal.azure.com/) with an account that has an **Azure subscription** (it can be the same work account as M365).
2. Confirm your **Entra ID** directory matches the tenant where Teams runs. You will use this tenant for **app registrations** and **admin consent**.

**You do not paste “tenant id” into the bot env for basic multi-tenant bots**, but you need it for `GRAPH_TENANT_ID` when acquiring mail tokens for a **single** tenant.

---

## Part B — Register the Teams / Bot Framework application

1. Open [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: e.g. `Angela-MVP-Bot`.
3. **Supported account types**: choose **Accounts in any organizational directory (Multitenant)** if you will use the default Azure Bot pattern; or **single tenant** if you prefer.
4. After creation, copy:
   - **Application (client) ID** → this is `MICROSOFT_APP_ID` and must match the Teams manifest `botId` / package `id` (same GUID in all places).
5. **Certificates & secrets** → **New client secret** → copy the **Value** immediately → `MICROSOFT_APP_PASSWORD` (store in Key Vault or App Service **Application settings** for demos).

**Authentication (only if you use interactive flows on this same app):**  
For `npm run auth:mail` you typically use a **second** app registration marked as a **public client**, or enable **Allow public client flows** on this app if your security review allows it. The runbook’s mail script uses device code and `GRAPH_CLIENT_ID`.

---

## Part C — Azure Bot resource

1. In Azure Portal → **Create a resource** → search **Azure Bot** → create.
2. Link it to the **Microsoft App ID** from Part B (or create a new app from the wizard — then use that app’s id/secret instead).
3. **Configuration** → **Messaging endpoint** → set to:

   `https://<YOUR_PUBLIC_HOST>/api/messages`

   If you use **App Service**, that is typically:

   `https://<your-webapp-name>.azurewebsites.net/api/messages`

4. **Channels** → open **Microsoft Teams** → **Apply** / enable.
5. No extra “key” here beyond the **App ID + secret** from Entra (some wizards show “Bot handle”; that is not the same as the client secret).

---

## Part D — Graph API permissions (mail + sign-in)

For **delegated** mail access used by `angela/scripts/auth-mail.ts` and the auto-reply poller:

1. Entra → **App registrations** → the app you use for mail (`GRAPH_CLIENT_ID` — can be the same as the bot app or a separate “Angela-Mail” app).
2. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
   - `User.Read`
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `offline_access`
3. **Grant admin consent** for the tenant (button on the API permissions blade). If **you** bought Microsoft 365 / own the tenant and your account is **Global Administrator** (or another role that can consent to Graph permissions), **you** perform this step in Entra — there is no separate fee and no third party required. Without consent, device code sign-in will fail or return tokens without mail scopes.

**Public client (device code):**  
**Authentication** → **Advanced settings** → **Allow public client flows** = **Yes** (if this app is used with `npm run auth:mail`).

Copy **Directory (tenant) ID** from Entra **Overview** → set `GRAPH_TENANT_ID=<that-guid>` in App Service settings or `.env` (recommended instead of `common` for demos).

---

## Part E — Azure OpenAI (recommended for real LLM text)

1. Azure Portal → **Create a resource** → **Azure OpenAI**.
2. After deployment → **Keys and Endpoint** → copy **Key 1** and **Endpoint**.
3. **Model deployments** → deploy a chat model (e.g. `gpt-4o-mini`). The **deployment name** is what you put in `AZURE_OPENAI_DEPLOYMENT_NAME`.

Map to application settings / `.env`:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT_NAME`
- `AZURE_OPENAI_API_VERSION` (must match what your resource supports; see Azure OpenAI “API version” docs).

---

## Part F — Teams app package (sideload)

1. Edit [`angela/teams-app/manifest.json`](../angela/teams-app/manifest.json):
   - Replace placeholder GUIDs with your **`MICROSOFT_APP_ID`** (same value in `id` and `bots[0].botId`).
   - Under `validDomains`, add the **hostname only** of your public URL (no `https://`), e.g. `your-app.azurewebsites.net`, or `bot.contoso.com` if you use a custom domain in front of App Service.
2. From repo root, run `npm install` inside `angela/` so `color.png` / `outline.png` exist.
3. Zip **only** `manifest.json`, `color.png`, `outline.png` at the **root** of the zip.
4. Teams client (signed in with your **work/school** user) → **Apps** → **Manage your apps** → **Upload an app** → upload the zip.  
   If upload is blocked, sign in to the **[Microsoft Teams admin center](https://admin.teams.microsoft.com/)** with your **tenant administrator** account (e.g. **Global Administrator** on the subscription you own) and turn on **custom app upload** / sideloading for the accounts that will demo the bot — still **no extra Microsoft fee**; it is a setting **you** control.

---

## Part G — Azure App Service (demo hosting)

App Service gives you **HTTPS**, a stable hostname, and an **always-on** process — a good fit for the **Teams bot** and the **inbox poller** (unlike short-lived serverless hosts).

### G.1 — Treat `angela/` as the deployed site root

The Node app and `package.json` live under [`angela/`](../angela/). Easiest paths:

- **Zip deploy / GitHub Actions:** build and publish the **`angela`** folder contents as the App Service **wwwroot** (so `package.json` is at the site root), **or**
- **Monorepo:** set **Startup Command** (Linux) to install and start from the subfolder, e.g.:

  ```text
  bash -c "cd angela && npm ci && npm run build && npm start"
  ```

  and ensure **SCM / Oryx** can see that path, **or** use a pipeline that copies `angela/` into the artifact root before deploy.

For the smallest surprise: **deploy only `angela/`** as the site root.

### G.2 — Create the Web App

1. Azure Portal → **Create a resource** → **Web App**.
2. **Runtime stack:** Node **20 LTS** (match [`angela/package.json`](../angela/package.json) `engines`).
3. **Operating System:** Linux is typical for Node; Windows also works.
4. **Region:** same region as OpenAI if you use it (latency).
5. **Pricing:** any tier that allows **always on** for demos you do not want to sleep (check **Configuration** → **General settings** → **Always On** where available).

### G.3 — Build and start commands

- **Startup Command** (Linux), if the site root is `angela`:

  ```text
  npm start
  ```

  which runs `node dist/index.js` after build.

- Enable **build during deploy** or run **`npm ci` + `npm run build`** in your CI before zipping, so `dist/` exists on the server.

App Service sets **`PORT`**; Angela already reads `process.env.PORT` (default 3978 locally). **Do not hardcode** 3978 in Azure Bot — use the URL **without** a port (`https://<name>.azurewebsites.net` uses 443).

### G.4 — Application settings (environment variables)

In the Web App → **Configuration** → **Application settings**, add every variable you would put in [`angela/.env.example`](../angela/.env.example): `MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`, `GRAPH_*`, `AZURE_OPENAI_*`, `EMAIL_*`, `TEAMS_*`, etc.

- Use **Key Vault references** later for production; for a pilot demo, **plain app settings** are common.
- **Never** commit real secrets to git.

### G.5 — Mail token on App Service (important)

`npm run auth:mail` writes **`.cache/graph-token.json` on disk**. On App Service the default disk is **ephemeral** (lost on move/restart) unless you add **persistent storage**.

**Practical demo options:**

1. **Short demo:** add an application setting **`GRAPH_ACCESS_TOKEN`** with a delegated access token from [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) or from running `npm run auth:mail` **on your PC**, paste before the demo, accept that it **expires** (often ~1 hour unless refresh is wired).
2. **Longer pilot:** mount **Azure Files** to a path and point token cache there, or implement a proper **confidential-client** or **managed identity** mail path (outside this MVP doc).
3. **Teams-only in cloud, mail locally:** run the **bot** on App Service and run **mail poller** on your laptop with `.env` — split only if you must.

For **auto-reply mail** on the same App Service instance, you need a **valid token** in settings or durable cache as above.

### G.6 — Point Azure Bot at App Service

Set **Messaging endpoint** to:

`https://<your-webapp-name>.azurewebsites.net/api/messages`

Save, then use **Test in Web Chat** if you want a quick connectivity check before Teams.

### G.7 — Custom domain (optional)

If you use **Cloudflare** (or any DNS) in front of App Service:

- Add Azure’s **custom domain + certificate** bindings on the Web App (or use **App Service Managed Certificate** for your hostname).
- CNAME your hostname to the **azurewebsites.net** hostname (or use A/AAAA records as Microsoft documents for your scenario).
- Put that **hostname** (only the name) in Teams **`validDomains`**.

### G.8 — Why not only “Cloudflare to my home IP”?

That still needs **something listening on 443** at home (reverse proxy to Node). App Service avoids opening your home firewall and gives you a managed TLS hostname quickly.

---

## Part H — Local machine + ngrok (optional dev path)

1. Install [ngrok](https://ngrok.com/) and expose local port: `ngrok http 3978`
2. Set Azure Bot **Messaging endpoint** to the ngrok `https://…/api/messages` URL.
3. In `angela/.env` (**copy from `.env.example`** — demo-first defaults). Set `MICROSOFT_APP_*`, `GRAPH_*`, OpenAI, etc.
4. From `angela/`:

   ```bash
   npm install
   npm run auth:mail
   npm run dev
   ```

5. **Teams:** messages to the bot hit `/api/messages` immediately. With sample `TEAMS_REQUIRE_MENTION=false`, no `@Angela` needed in a 1:1 / pilot chat.
6. **Mail:** poller uses `.cache/` watermark; new mail only **after** first run watermark.

---

## Quick env reference

| Variable | Where you get it |
|----------|-------------------|
| `MICROSOFT_APP_ID` | Entra app → Application (client) ID |
| `MICROSOFT_APP_PASSWORD` | Entra app → Client secret **value** |
| `GRAPH_CLIENT_ID` | Usually same app as mail, or a dedicated mail app’s client id |
| `GRAPH_TENANT_ID` | Entra **Overview** → Directory (tenant) ID |
| `AZURE_OPENAI_*` | Azure OpenAI resource → Keys & Endpoint + Deployments |
| `EMAIL_AUTO_REPLY_ENABLED` | `true` in sample `.env` / App Service settings for inbox polling |
| Public base URL | App Service: `https://<name>.azurewebsites.net` → Bot + `validDomains` |

Full env template: [`angela/.env.example`](../angela/.env.example). Operational detail: [RUNBOOK.md](./RUNBOOK.md). Governance: [GOVERNANCE.md](./GOVERNANCE.md).
