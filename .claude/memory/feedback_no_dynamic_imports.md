---
name: prefer static imports
description: acoop prefers static top-of-file imports over `await import()` in TS/JS files
type: feedback
originSessionId: 1214772e-a1fb-4f98-b143-af171f1754c4
---
Prefer static `import` statements at the top of the file. Avoid `await import(...)` inline.

**Why:** acoop finds dynamic imports in this codebase noisy and surprising. They scatter `await` boilerplate through route handlers and break the "all imports visible at the top" convention.

**How to apply:** When adding a new dependency to a server or client module, add it to the import block at the top of the file. Do NOT use `await import("...")` unless there's a concrete reason (true circular dep, intentionally lazy code path that the user has approved). This applies even when copying from existing dynamic-import patterns in the same file — break the pattern and add static imports for new code.
