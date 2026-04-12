---
name: known-test-failures
description: Pre-existing test failures in ACC shared memory tests due to @libsql/client module resolution
type: project
---

3 tests in `test/acc-shared-memory.test.ts` fail with `Cannot find module '@libsql/client/sqlite3'`. This is a pre-existing dependency/environment issue unrelated to application code changes.

**Why:** The ACC shared memory test imports code paths that pull in `server/db/index.ts`, which depends on `@libsql/client/sqlite3`. The module resolution fails in the test environment. Note: Mastra Memory also uses `@mastra/libsql` (added 2026-04-07) which may introduce additional LibSQL-related test issues.

**How to apply:** When running `bun test`, expect 3 failures from this file. Don't treat them as regressions from new code changes. The remaining ~55 tests should pass.
