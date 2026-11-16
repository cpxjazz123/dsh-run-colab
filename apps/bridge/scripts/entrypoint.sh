#!/bin/sh
set -eu

# Secrets arrive as container environment variables. The bridge and the Colab
# CLI both read token files, so materialize them with owner-only permissions.
if [ -n "${COLAB_OAUTH_TOKEN:-}" ]; then
  mkdir -p /root/.config/dsh-agent /root/.config/colab-cli
  printf '%s' "$COLAB_OAUTH_TOKEN" > /root/.config/dsh-agent/oauth-token.json
  printf '%s' "$COLAB_OAUTH_TOKEN" > /root/.config/colab-cli/token.json
  chmod 600 /root/.config/dsh-agent/oauth-token.json /root/.config/colab-cli/token.json
fi

export HOME=/root
export PYTHON_KEYRING_BACKEND=keyrings.alt.file.PlaintextKeyring

# `colab ssh` registers this key with the session on first use. Keep it inside
# the container; a fresh container gets a fresh key.
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f /root/.ssh/id_ed25519 ]; then
  ssh-keygen -q -t ed25519 -N '' -f /root/.ssh/id_ed25519
fi

exec node /app/colab-bridge.mjs
