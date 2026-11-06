# syntax=docker/dockerfile:1
# DEVX-005: one image for the local `docker compose up` (compose.yaml): the built site, the
# import worker and the one-shot migrations + synthetic seed. This computer only: the server
# runs systemd units (deploy/README.md). No secret enters the image: .dockerignore admits
# only the listed paths, and the containers read .env at run time through `env_file`.
FROM node:26.7.0-trixie-slim

# socat: the loopback forwarder to the compose `db` service (docker/entrypoint.sh).
RUN apt-get update \
 && apt-get install -y --no-install-recommends socat \
 && rm -rf /var/lib/apt/lists/*

# onnxruntime-node (via @huggingface/transformers) downloads CUDA binaries on Linux x64 if
# its postinstall runs (this npm skips install scripts no allowScripts entry covers); no
# route or worker path loads the local embedder (DEPLOY-001), so skip them either way.
ENV NEXT_TELEMETRY_DISABLED=1 \
    ONNXRUNTIME_NODE_INSTALL=skip \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund && npm cache clean --force

COPY . .
# Root owns the code; the runtime user `node` may write only the build output's cache.
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && chown -R node:node .next

USER node
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/app/docker/entrypoint.sh"]
# `npm start` binds 127.0.0.1, which a published port cannot reach from outside the
# container; compose publishes this port on the host's 127.0.0.1 only.
CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
