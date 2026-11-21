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

# The Colab CLI keeps the per-session SSH key map on disk. Cloudflare replaces
# the container on every rollout, which used to orphan the running Colab VM;
# keep it in the mount so a new container can still reach the same session.
if [ -n "${DSH_DATA_DIR:-}" ]; then
  mkdir -p "$DSH_DATA_DIR/colab" "$DSH_DATA_DIR/ssh"
  mkdir -p /root/.config/colab-cli
  if [ -d /root/.config/colab-cli ] && [ ! -L /root/.config/colab-cli/sessions ]; then
    rm -rf "$DSH_DATA_DIR/colab/sessions"
    cp -a /root/.config/colab-cli/. "$DSH_DATA_DIR/colab/" 2>/dev/null || true
  fi
  rm -rf /root/.config/colab-cli
  mkdir -p /root/.config
  ln -s "$DSH_DATA_DIR/colab" /root/.config/colab-cli
  for key in id_ed25519 id_ed25519.pub; do
    if [ -f "/root/.ssh/$key" ] && [ ! -f "$DSH_DATA_DIR/ssh/$key" ]; then
      cp "/root/.ssh/$key" "$DSH_DATA_DIR/ssh/$key"
    fi
    if [ -f "$DSH_DATA_DIR/ssh/$key" ]; then
      cp "$DSH_DATA_DIR/ssh/$key" "/root/.ssh/$key"
      chmod 600 "/root/.ssh/$key"
    fi
  done
fi

exec node /app/colab-bridge.mjs
