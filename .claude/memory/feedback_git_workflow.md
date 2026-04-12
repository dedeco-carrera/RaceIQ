---
name: git-workflow-feedback
description: Avoid unnecessary git stash/pop; commit all related changes together rather than surgically; don't run stash from subdirectories
type: feedback
---

Don't use `git stash` and `git stash pop` as a workaround during development sessions. It caused working changes to be overwritten when the pop failed or was run from the wrong directory.

**Why:** Running `git stash` from `client/` directory caused pop failure and overwrote session changes. User explicitly called this out: "why do you keep stashing and popping".

**How to apply:** Never stash mid-session to work around lint/build issues. Fix issues directly. If you need to check something in a clean state, read the file or use git show instead.

---

Commit all related session changes in one commit with a descriptive multi-line message rather than surgically committing individual files.

**Why:** Surgical commits broke things when dependencies between files weren't committed together. User asked for "one commit stating what all the changes are."

**How to apply:** When user says "commit everything," stage all modified files and write a comprehensive commit message summarizing all changes. Don't split unless explicitly asked.
