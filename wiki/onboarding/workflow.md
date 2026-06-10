# Workflow

How the team works on this repo.

## Development philosophy

Prefer **TDD**: red → green → refactor. One test at a time, vertical slices only — never write all tests then all code.

- Write one failing test for one behaviour, implement the minimum to pass, repeat.
- Tests verify behaviour through public interfaces, not implementation details. Tests must survive internal refactors.
- No mocking internal collaborators. Use real code paths.

## Required checks before pushing

```bash
pnpm lint
turbo run type-check
pnpm test
pnpm knip
```

All four must pass.

## Per-app commands

```bash
cd apps/frontend    && pnpm dev   # Vite dev server (3000)
cd apps/server      && pnpm dev   # Node --watch on src/index.ts (4001)
cd apps/iframe-demo && pnpm dev   # Angular dev server (8080)
```

## Closed-network reminders

- No public CDN links.
- No runtime fetches to public URLs.
- All third-party dependencies must be self-hostable or bundled.
