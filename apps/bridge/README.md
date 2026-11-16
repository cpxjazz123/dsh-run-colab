# `@dsh-agent/bridge`

Cloudflare Worker and container wrapper around the DSH bridge. The container
runs the same `scripts/colab-bridge.mjs` as the standalone process, so the
Colab CLI, SSH tunnel, snapshot cache, and DSH startup behave identically.

## Endpoints

Authenticated with `Authorization: Bearer <DSH_BRIDGE_TOKEN>`:

- `/state`, `/install`, `/start`, `/stop`, `/session/stop`, `/config`
- `/generate`, `/generate/<job>`
- `/qqbot`

Public by design:

- `/images/<uuid>.jpg` — generated images, addressed by an unguessable UUID.
- `/health` — liveness probe.
- `/` — DSH Web UI, proxied to container port `18080`.

## Image generation

The bridge starts an `image` MCP server on the Colab VM. It exposes
`mcp__image__generate_image`; the tool submits a job to `/generate`, polls it,
and returns the JPEG plus a public image URL. The GPU session is separate from
the CPU `dsh` session.

The GPU session runs `image-worker.py` as a persistent loopback HTTP worker.
It loads `stabilityai/sdxl-turbo` into VRAM once and keeps the process alive,
so later jobs do not re-import torch or reload the model. The worker survives
a bridge container restart; checking its `/health` endpoint reattaches to it.
Stopping the `image` session (`colab stop -s image`) also stops the worker.

After a generation finishes, the bridge stops the `image` session after five
minutes without another job; a new job cancels that timer. Override with
`DSH_IMAGE_IDLE_STOP_MS` (milliseconds), or set it to `0` to keep the worker
resident indefinitely.

## Persona plugin

The standard DSH preset mounts its own scoped `persona` row, which shadows the
deployment-wide `system-prompt` persona. The bridge writes a small
`dsh-persona.mjs` plugin and inserts it as a global prompt section after the
preset persona, so the Agent identity is applied in standard mode.

## QQ Bot

The bridge installs `@tencent-connect/dsh-qqbot` into the DSH web profile.
`/qqbot` proxies the plugin's binding state from the DSH web server, and the
Agent page shows the QQ login QR code while the plugin waits for a scan.
Credentials are written back to the profile patch by the plugin itself. The
bridge validates saved credentials against QQ's token endpoint and reports
the QQ gateway state. It does not restart DSH after a bind: the plugin writes
the profile patch and DSH's HMR reload starts the gateway in place.

## Local development

Docker must be running.

```bash
cd apps/bridge
pnpm dev
```

Create `.dev.vars` from `.dev.vars.example`:

```text
DSH_BRIDGE_TOKEN=<local bearer token>
DEEPSEEK_API_KEY=<provider key>
DEEPSEEK_BASE_URL=https://api.commandcode.ai/provider/v1
DEEPSEEK_MODEL=deepseek/deepseek-v4.1-flash
COLAB_OAUTH_TOKEN=<Colab OAuth JSON>
GOOGLE_CLOUD_PROJECT=<Drive quota project>
DSH_PUBLIC_URL=http://127.0.0.1:7791
```

`COLAB_OAUTH_TOKEN` is materialized as `oauth-token.json` for the bridge and
as the Colab CLI's legacy token file. The container generates an SSH key on
start; the first `colab ssh` registers it with the session.

Test the control API:

```bash
curl -H "Authorization: Bearer $DSH_BRIDGE_TOKEN" \
  http://127.0.0.1:7791/state
```

The container publishes the bridge on `7791` and the DSH Web UI on `18080`
inside the container; the Worker routes by path.

## Deploy

Required Worker secrets: `DSH_BRIDGE_TOKEN`, `DEEPSEEK_API_KEY`,
`DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `COLAB_OAUTH_TOKEN`,
`GOOGLE_CLOUD_PROJECT`.

Set `DSH_PUBLIC_URL` to the public bridge origin so the DSH Web UI and image
links resolve. The web app binds to this Worker with the service binding
`DSH_BRIDGE` and must use the same `DSH_BRIDGE_TOKEN`.
