# `@dsh-agent/mcp`

Stdio MCP server over the backend control API, so an MCP client can drive the
same Colab-hosted agent the web panel controls. It talks to `dsh-agent-api`,
never to the container directly.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DSH_API_URL` | `http://127.0.0.1:8080` | API Worker origin (local `pnpm dev:api` or the deployed Worker). |
| `DSH_API_TOKEN` | none | Bearer token shared with the API Worker and the container. |

Point it at the deployed API Worker with the same token the panel Worker holds.

## Build and run

```bash
pnpm --filter @dsh-agent/mcp build
DSH_API_TOKEN=local-dev-token node apps/mcp/dist/index.js
```

The process speaks MCP on stdin/stdout and logs only to stderr. Example client
entry:

```json
{
  "mcpServers": {
    "dsh-agent": {
      "command": "node",
      "args": ["/absolute/path/to/dsh-run-colab/apps/mcp/dist/index.js"],
      "env": {
        "DSH_API_URL": "http://127.0.0.1:8080",
        "DSH_API_TOKEN": "local-dev-token"
      }
    }
  }
}
```

## Tools

| Tool | API route | Notes |
| --- | --- | --- |
| `dsh_state` | `GET /state` | Session, install/snapshot flags, running flag, key presence, provider config, identity, Agent UI URL. |
| `dsh_start` | `POST /start` | Provisions/reuses the Colab session, installs DSH if missing, launches the Web UI, opens the tunnel. Minutes on a cold runtime. Refuses to run when no API key is saved and none is passed. |
| `dsh_stop` | `POST /stop` | Stops the Web UI and the tunnel; the Colab session survives. |
| `dsh_delete_session` | `POST /session/stop` | Stops the agent and deletes the Colab session. |
| `dsh_configure` | `POST /config` | Patches provider settings and identity without starting. Identity fields merge; an empty `apiKey` clears the stored key. `imageGeneration: false` removes the image MCP tool on the next start. |
| `dsh_wait_running` | polls `GET /state` | Blocks until the Web UI answers, bounded by `timeoutMs`. |
| `dsh_generate_image` | `POST /generate` | Submits an SDXL-Turbo job, returns a job id. |
| `dsh_image_job` | `GET /generate/<id>` | Polls one job; `waitMs` waits for `ready` or `error`. |
| `dsh_qqbot` | `GET /qqbot` | QQ Bot binding phase, QR SVG while waiting, credential/gateway health. |

`dsh_start`, `dsh_stop`, `dsh_delete_session` and `dsh_generate_image` change
remote state. The stack is single-tenant: one MCP server talks to one Colab
session.
