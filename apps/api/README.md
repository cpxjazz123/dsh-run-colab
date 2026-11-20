# `@dsh-agent/api`

Public edge of the DSH stack (`dsh-agent-api`).

- The panel Worker (`dsh-agent-web`) calls it through the `DSH_API` service
  binding, or `DSH_API_URL` during local development.
- The browser reaches the Agent UI and generated images here, because the
  bridge builds those URLs from `DSH_PUBLIC_URL` (this Worker's origin).
- It forwards everything to `dsh-colab-bridge`, which owns the container.

## Behaviour

| Path | Auth | Destination |
| --- | --- | --- |
| `/health` | none | local response |
| `/state`, `/install`, `/start`, `/stop`, `/session/stop`, `/config`, `/generate`, `/generate/<id>`, `/qqbot` | `Authorization: Bearer <DSH_BRIDGE_TOKEN>` | bridge container |
| `/images/<uuid>.jpg` | none (UUID is the capability) | bridge container |
| everything else, including `/` and WebSocket upgrades | none; the DSH web server enforces its own token cookie | bridge container, port `18080` |

A missing or wrong bearer token returns `401` before the container is touched.
The token must match the one on `dsh-colab-bridge` and the panel Worker.

## Local development

```bash
pnpm dev:api   # wrangler dev --port 8080
```

`apps/api/.dev.vars`:

```text
DSH_BRIDGE_TOKEN=local-dev-token
```

The `DSH_COLAB_BRIDGE` service binding resolves `dsh-colab-bridge` through the
wrangler dev registry, so that Worker must be running (`pnpm dev:colab`).
Status shows `local [connected]` when the two dev sessions are linked.

## Deploy

```bash
pnpm --filter @dsh-agent/api exec wrangler secret put DSH_BRIDGE_TOKEN
pnpm --filter @dsh-agent/api deploy
```

Deploy `dsh-colab-bridge` first: the service binding is resolved by name.
