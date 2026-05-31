# Testing Principles (goldbergyoni/nodejs-testing-best-practices)

## Core Philosophy: Black-Box, Behavior-First

Test the system as users and callers experience it — through **public interfaces only**. Never test internal functions, private methods, or implementation details. If a refactor doesn't change observable behavior, zero tests should break.

## The 5 Exit Doors (Required Coverage for HTTP Routes & Use-Cases)

Every significant entry point has up to 5 observable "exits" that can be tested:

1. **Response** — correct HTTP status code, response body shape, return value
2. **New State** — data was actually persisted (verify via the public API, not raw DB queries)
3. **External Calls** — outgoing requests to Redis, S3, FFmpeg, RabbitMQ are correct in shape and target
4. **Message Queue Events** — messages published with correct routing key and payload
5. **Observability** — at least one error path is tested; failure mode produces the right response

Not every exit door applies to every interface. A pure utility only has exit door 1.

## Priority Rules

**Test features, not functions.** A changed private helper that feeds into a public route → test the route, not the helper.

**Component/integration tests are primary.** They catch 99% of bugs. E2E tests (3–10 max) catch infrastructure issues. Unit tests only for non-trivial isolated algorithms.

**Never mock internal collaborators.** Real code paths only. Mocking at the infrastructure boundary (HTTP interceptors, test containers for external services) is fine.

## Test Structure

- **Naming**: `When [condition], Then [outcome]`
- **Pattern**: AAA — Arrange, Act, Assert
- **Size**: ~7 statements max per test
- **Data isolation**: each test creates its own records; no shared global state between tests
- **Assert via public API**: verify new state through the endpoint, not by reading the DB directly

## What NOT to Test

- Config files, env files, type-only changes
- Internal private functions (test through the public interface instead)
- Implementation details that change without changing behavior
- Lock files, markdown, build artifacts

## File Classification → Applicable Exit Doors

| File Type | Exit Doors | Notes |
|-----------|-----------|-------|
| HTTP route/controller | All 5 | Highest priority |
| Domain use-case | 1, 2, 3, 4 | Response = return value |
| React component (stateful) | 1 (render), 5 (error) | Test rendered output |
| Zustand store | 1 (state shape), 2 | State changes are "new state" |
| Pure utility/helper | 1 only | Input → output |
| Infrastructure adapter | 3, 4 | Verify calls to external systems |
| Config / bootstrap / env | None | Skip |
| Type-only / .d.ts | None | Skip |
