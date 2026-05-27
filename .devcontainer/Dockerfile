FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Image ships Node 22.16; project requires >=22.18.
# Use `n` (not nvm) — installs binary directly to /usr/local/bin/node,
# no shell sourcing needed, works in all shell contexts.
RUN npm install -g n && n 22.18.0

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.15.0
