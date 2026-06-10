# Video Editor Wiki

Documentation hub for the React Video Editor — a browser-based video editing system deployed in closed, air-gapped networks.

## Pick your path

- **[Onboarding](onboarding/getting-started)** — new to the project. Install, run, learn the repo.
- **[Architecture](architecture/overview)** — system design, ADRs, per-app deep dives.
- **[Integrators](integrators/iframe-integration)** — embedding the editor iframe and consuming AMQP events from your own service.
- **[Ops](ops/deployment)** — deploying, monitoring, and operating the editor in production.
- **[Product](product/feature-overview)** — what the editor does, in plain language.

## About this wiki

This wiki is generated from the repo's `wiki/` folder. Generated pages mirror the source-of-truth Markdown in the repo (`README.md`, `CONTEXT.md`, `docs/adr/`, per-app READMEs). Hand-written pages live alongside them. The generator (`scripts/build-wiki.ts`) is idempotent — it never overwrites hand-written pages.
