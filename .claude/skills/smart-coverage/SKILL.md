---
name: smart-coverage
description: Analyze test coverage gaps after code changes. Use when asked about missing tests, coverage check, "what should I test", or after implementing/fixing something. Git diff → affected public interfaces → critical/high/medium/low gap report + remediation plan. Black-box only.
---

# Smart Coverage Check

You analyze test coverage gaps intelligently. Your goal: find **behavioral gaps** in tests for the code that actually changed — not chase arbitrary coverage percentages or test every line.

Read `references/testing-principles.md` now. It defines the 5 exit doors, priority rules, and file classification table you'll use throughout this analysis.

---

## Phase 1: Discover Changed Files

Run both commands:
```bash
git diff --name-only HEAD
git status --short
```

Collect: all modified tracked files + untracked new source files (`??` prefix).

**Filter OUT immediately** (no analysis needed):
- `.env`, `.env.*`
- `*.md`, `CLAUDE.md`, `README.md`
- `*-lock.yaml`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`
- `docker-compose*.yml`, `*.config.ts` (vitest, vite — unless the test config change is the subject)
- `knip.json`, `.gitignore`, `.eslintrc*`, `biome.json`
- `*.test.ts`, `*.test.tsx`, `*.spec.ts` — test files are inputs, not subjects
- `dist/`, `build/`, `.cache/`

---

## Phase 2: Classify Each Remaining File

For each file that passed the filter, determine its **interface type** using the table in `references/testing-principles.md`. The type determines which exit doors apply and the baseline priority.

If you're unsure of a file's type, read it briefly to check what it exports.

---

## Phase 3: Check Existing Test Coverage

For each non-skipped file:

1. **Find co-located test**: look for `<filename>.test.ts` / `<filename>.test.tsx` next to the source file. Also check if there's a `__tests__/` folder nearby.
2. **If test file exists**: read it. Identify which exit doors are already covered.
3. **If no test file**: the file has zero coverage → note all applicable exit doors as missing.
4. **Check for integration tests**: sometimes a route is tested from a higher-level test (e.g., a use-case test that exercises the controller). Scan `*.test.ts` files in parent directories if relevant.

---

## Phase 4: Classify Gaps by Priority

Using the gaps you found:

### 🔴 Critical
- HTTP route/controller with **no test file at all**
- Domain use-case with **no test file at all**

### 🟠 High
- HTTP route missing: error path test (exit door 5), OR new state verification (exit door 2), OR external call assertion (exit door 3)
- Use-case missing: any of exits 2, 3, 4
- Brand new file (any type) with no test at all, when the file has non-trivial logic

### 🟡 Medium
- React component: no render/output test
- Zustand store: state shape/transition not tested
- New utility with zero test coverage
- Existing partial test missing one behavior variant (happy path exists, but no error case)

### 🟢 Low
- Additional edge cases for utilities already partially tested
- Observability/logging paths
- Internal helpers with minor logic not covered by higher-level tests
- Type-safe wrappers with trivial logic

---

## Phase 5: Output the Report

Use this exact structure:

```
## Test Coverage Report

### Summary
- Files changed: X (after filtering)
- Public interfaces analyzed: Y
- Gaps found: Z (Critical: N, High: N, Medium: N, Low: N)

---

### 🔴 Critical

**`path/to/file.ts`**
- Missing: No test file exists
- Exit doors uncovered: [list which apply]
- Suggested tests:
  - `describe('POST /route')` → `it('returns 200 with correct shape when input valid')`
  - `describe('POST /route')` → `it('returns 4xx when input invalid')`

---

### 🟠 High

**One block per file.** If a file has multiple gaps, list all of them under the same `**\`file.ts\`**` heading — do not split into separate blocks per gap. Each gap is a numbered sub-item:

**`path/to/file.ts`**

Gap 1 — [short name] (Exit Door N)
- `describe(...)` → `it('When X, Then Y')`

Gap 2 — [short name] (Exit Door N)
- `describe(...)` → `it('When X, Then Y')`
...

### 🟡 Medium
...

### 🟢 Low
...

---

### ✅ Already Covered
- `path/to/file.ts` — co-located test covers exits 1, 5 ✓

### ⏭️ Skipped
- `apps/server/.env` — config file, no tests needed
- `pnpm-lock.yaml` — lock file

---

### Remediation Plan

Ordered by priority. Write these tests to close all gaps:

1. **[Critical]** `path/to/file.test.ts` — create file, add happy-path + error-path for `POST /route`
2. **[High]** `path/to/other.test.ts` — add test: `it('persists record to Redis after success')`
3. ...
```

---

## Key Rules (must follow)

- **Test through public interfaces only.** HTTP: assert via the endpoint response, not by calling the service/use-case directly. Store: assert via the store's public state.
- **Never suggest mocking internal collaborators.** If an HTTP handler calls a use-case, test the handler — the use-case runs for real.
- **One test = one behavior.** Name: `When [condition], Then [outcome]`.
- **Don't suggest tests for**: config files, type-only changes, env files, lock files, test files themselves.
- **Be specific.** "Add a test" is useless. Always name the describe block and the `it()` description.
- **Focus on behavior that changed.** If a file was modified but the public interface didn't change (e.g., internal refactor), note it as "internal refactor — existing tests sufficient" and skip.
