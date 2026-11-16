# DSH Agent

A standalone DeepSeek Harness (DSH) control panel. It runs the DeepSeek Agent
inside a Google Colab session and exposes a small web UI for starting,
stopping, configuring, and opening the agent. Optional image generation and a
QQ Bot plugin are included.

## Architecture

```
Browser ──▶ apps/web (TanStack Start on Cloudflare Workers)
              │  /api/dsh/* proxy
              ▼
         apps/bridge (Cloudflare Worker + Container)
              │  Docker: Colab CLI, SSH tunnel, Node 24
              ▼
         Colab VM: DSH web UI on :18080, bridge API on :7791
```

The bridge can also run directly as a Node process during local development.
It then listens on `127.0.0.1:7791`.

## Features

- **Agent control** — start/stop the Colab `dsh` session, inspect hardware and
  status, open the DSH Web UI.
- **Identity and provider config** — agent name, persona, personality,
  communication style, additional instructions, API key, base URL, and model.
- **Snapshot cache** — uploads a Node 24 snapshot to Google Drive and restores
  it on later starts.
- **Image generation** — a persistent `sdxl-turbo` worker on a separate GPU
  session, exposed to the agent through MCP (`generate_image`).
- **QQ Bot** — installs and reports the Tencent QQ Bot plugin state, including
  the login QR code.
- **Public image URLs** — generated images are served by the bridge at
  unguessable UUID paths.

## Requirements

- Node.js 24 and pnpm 11.
- Docker for the Cloudflare Container build.
- A Google account with Colab access and the Colab CLI.
- A Google Cloud project for Drive API quota.
- A DeepSeek-compatible provider key, base URL, and model.

## Local development

Copy the example environment files:

```bash
cp apps/bridge/.dev.vars.example apps/bridge/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Fill `apps/bridge/.dev.vars` with your provider and Colab credentials. Keep
`DSH_BRIDGE_TOKEN` identical in both files.

Run the local bridge (no Worker or container required):

```bash
pnpm install
DSH_BRIDGE_TOKEN=local-dev-token \
  node apps/bridge/scripts/colab-bridge.mjs
```

In another terminal, start the web UI:

```bash
pnpm dev
```

Open <http://localhost:3000>. The web proxy defaults to
`http://127.0.0.1:7791` when `DSH_BRIDGE_URL` is unset.

To exercise the Cloudflare Worker and container locally instead:

```bash
pnpm --filter @dsh-agent/bridge dev
```

Docker must be running. The Worker listens on `127.0.0.1:7791`; the container
publishes the bridge on `7791` and the DSH Web UI on `18080`.

## Deploy

Deploy the bridge first; the web Worker binds to it by service name.

```bash
pnpm --filter @dsh-agent/bridge exec wrangler secret put DSH_BRIDGE_TOKEN
pnpm --filter @dsh-agent/bridge exec wrangler secret put DEEPSEEK_API_KEY
pnpm --filter @dsh-agent/bridge exec wrangler secret put DEEPSEEK_BASE_URL
pnpm --filter @dsh-agent/bridge exec wrangler secret put DEEPSEEK_MODEL
pnpm --filter @dsh-agent/bridge exec wrangler secret put COLAB_OAUTH_TOKEN
pnpm --filter @dsh-agent/bridge exec wrangler secret put GOOGLE_CLOUD_PROJECT
pnpm --filter @dsh-agent/bridge deploy
```

Set the public origin of the deployed bridge Worker:

```bash
pnpm --filter @dsh-agent/bridge exec wrangler deploy \
  --var DSH_PUBLIC_URL:https://<bridge-worker>.workers.dev
```

Then set the same bridge token on the web Worker and deploy it:

```bash
pnpm --filter @dsh-agent/web exec wrangler secret put DSH_BRIDGE_TOKEN
pnpm --filter @dsh-agent/web deploy
```

The web Worker's `services` binding (`DSH_BRIDGE` → `dsh-agent-bridge`)
reaches the bridge without a public URL. The bridge bearer token is still
required for all control endpoints.

## Security

This is a **single-tenant** bridge. One container owns one Colab session and
one config file. Do not expose it to unrelated users. The web panel has no
login of its own; put Cloudflare Access or another authentication layer in
front of it before using a public hostname. Generated images are public by
UUID. The bridge container filesystem is ephemeral: config and snapshot cache
are lost when the container is replaced.

## Layout

```
apps/web/       TanStack Start UI and /api/dsh proxy
apps/bridge/    Cloudflare Worker, Docker container, local Node bridge
packages/contract/  Shared Zod schemas and types
```
