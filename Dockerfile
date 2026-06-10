ARG NODE_IMAGE=TODO

# ── Stage 1: prune workspace ─────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS pruner

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

COPY . .

RUN turbo prune @video-editor/server --docker

# ── Stage 2: install + build ──────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

# Package manifests + lockfile only — maximises install cache hit
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

# Full pruned source
COPY --from=pruner /app/out/full/ .

# Isolate production deps + source into a clean directory
RUN pnpm --filter @video-editor/server deploy --prod --legacy /prod/server

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime

WORKDIR /prod/server

# OpenShift runs as arbitrary UID in group 0 — make app dir group-writable
COPY --from=deps --chown=1001:0 /prod/server /prod/server

ENV NODE_ENV=production

CMD ["node", "src/index.ts"]
