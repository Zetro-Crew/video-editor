ARG NODE_IMAGE=node:22-slim

# ── Stage 1: prune workspace ─────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS pruner

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate && \
    pnpm add --global turbo@2.9.14

COPY . .

RUN turbo prune @video-editor/server --docker

# ── Stage 2: install + build ──────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

# Package manifests + lockfile only — maximises install cache hit
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

# Full pruned source
COPY --from=pruner /app/out/full/ .

# Build workspace packages (dist/ required by pnpm deploy)
RUN pnpm --filter @ztube/observability build
RUN pnpm --filter @video-editor/contract build

# Isolate production deps + source into a clean directory
RUN pnpm --filter @video-editor/server deploy --prod --legacy /prod/server

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM ${NODE_IMAGE}

WORKDIR /app

# OpenShift runs as arbitrary UID in group 0 — make app dir group-writable
COPY --from=deps --chown=1001:0 /prod/server ./

# Drop ffprobe-static sibling-platform binaries (darwin/win32/linux-ia32) — runtime is linux/amd64 only
RUN find /app/node_modules -path '*ffprobe-static/bin/*' -type f \
        ! -path '*/linux/x64/*' -delete \
 && find /app/node_modules -path '*ffprobe-static/bin/*' -type d -empty -delete

RUN chmod -R g+rwx /app

ENV NODE_ENV=production

USER 1001
EXPOSE 4001
CMD ["node", "src/index.ts"]
