---
name: git-lfs-push-blocker
description: Git LFS hooks block push on macOS since git-lfs is not installed — need to bypass or install
type: feedback
---

The repo has Git LFS hooks (pre-push, post-checkout, post-commit) but `git-lfs` is not installed on acoop's macOS machine. This causes `git push` to fail with "git-lfs was not found on your path".

**Why:** The repo was configured for LFS at some point (likely for binary assets in the Windows release workflow), but the dev machine doesn't have it installed.

**How to apply:** When pushing fails with this error, ask acoop whether to install git-lfs or bypass the hook. Don't retry the same push without addressing it.
