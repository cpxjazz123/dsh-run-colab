# The bridge needs a real Linux process: Colab CLI, SSH, and the Node 24 runtime
# it installs on the Colab VM. Cloudflare Containers provides that process.
# Trixie ships Python 3.12+, which google-colab-cli 0.8.0 requires.
FROM node:24-trixie-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHON_KEYRING_BACKEND=keyrings.alt.file.PlaintextKeyring \
    COLAB_BIN=/usr/local/bin/colab \
    COLAB_PYTHON=/opt/colab-cli/bin/python \
    DSH_BRIDGE_HOST=0.0.0.0 \
    DSH_TUNNEL_BIND=0.0.0.0 \
    PATH=/opt/colab-cli/bin:/usr/local/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        openssh-client \
        python3 \
        python3-pip \
        python3-venv \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/colab-cli \
    && /opt/colab-cli/bin/pip install --no-cache-dir \
        google-colab-cli==0.8.0 \
        keyrings.alt \
    && ln -sf /opt/colab-cli/bin/colab /usr/local/bin/colab

WORKDIR /app
COPY scripts/colab-bridge.mjs scripts/image-mcp.mjs scripts/image-worker.py scripts/entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

EXPOSE 7791 18080
ENTRYPOINT ["/app/entrypoint.sh"]
