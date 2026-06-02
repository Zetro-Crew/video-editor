ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# ── Stage 1: prune workspace ─────────────────────────────────────────────────
FROM --platform=linux/amd64 ${NODE_IMAGE} AS pruner

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate && \
    pnpm add --global turbo@2.9.14

COPY . .

RUN turbo prune @video-editor/frontend --docker

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 ${NODE_IMAGE} AS builder

ARG BUILD_MODE=production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

# Package manifests + lockfile only — maximises install cache hit
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

# Full pruned source
COPY --from=pruner /app/out/full/ .

# Vite mode-specific env files (turbo prune excludes dotfiles by default)
COPY apps/frontend/.env* apps/frontend/

RUN pnpm --filter @video-editor/contract build
RUN pnpm --filter @video-editor/frontend exec tsc \
 && pnpm --filter @video-editor/frontend exec vite build --mode ${BUILD_MODE}

# ── Stage 3: serve ────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 ${NGINX_IMAGE}

# OpenShift runs as arbitrary UID in group 0.
# Nginx must use port 8080 (non-privileged) and write to group-writable dirs.
RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx \
    && chown -R 1001:0 /var/cache/nginx /var/run /var/log/nginx \
    && chmod -R g+rwx /var/cache/nginx /var/run /var/log/nginx

COPY --from=builder --chown=1001:0 /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/nginx.conf

USER 1001
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
