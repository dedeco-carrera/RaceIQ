# Forgejo canonical repository and GitHub mirror

Status recorded: 2026-11-25

## Direction

Forgejo `dedeco/speedhq-raceiq` is the canonical repository. Developers push to Forgejo. GitHub `SpeedHQ/RaceIQ` is a downstream mirror of Forgejo and must not be treated as the source of truth.

The intended mirror is Forgejo push mirror → GitHub. GitHub's current branch history must be replaced by Forgejo's canonical history when the mirror is first synchronized.

## Divergence snapshot

The initial comparison was made against these branch tips, before this report was committed:

| Repository | Branch | Commit | Date | Subject |
| --- | --- | --- | --- | --- |
| Forgejo | `main` | `15e0a4798ce7f08338ca238332c3ce6ffa07f45a` | 2026-08-31 | Improve MoTeC import for ACC and AC Evo (#349) |
| GitHub | `main` | `8fb2fcdb607846c15a99d0187b9f59d31f47003c` | 2026-11-24 | Fix AC EVO session labels and duplicate out-laps (#518) |

Both histories share `42ef7ceaa91b3e2657cb347cf5f3a3b57f72d73c` (`chore: bump version to 0.2.0`, 2026-04-04). After that point, Forgejo has 396 commits and GitHub has 600 commits. Neither tip is an ancestor of the other. Their trees differ in 5,677 paths; this is a file-difference count, not a count of Git's eventual line-level merge conflicts.

After this report was committed, Forgejo `main` moved to `1fc5be1eb8bd6110a745f8d2dfb5d9e922216374` (`docs: define Forgejo as canonical repository`). A fresh GitHub fetch moved the observed GitHub `main` to `e6820f57cd7a6432e2696cbc10315b65378cdfac` (`Repair lap links in older direct captures (#511)`). Against those refs, the shared base is unchanged; Forgejo has 397 commits and GitHub has 604 commits after it, and their trees differ in 5,690 paths. Neither branch contains the other.

The local checkout was on `codex/gt7-pr2-capture-integration`, two commits ahead of GitHub `main`:

- `981abad11` — GT7 parser and metadata foundation.
- `179812f0b` — GT7 live capture integration.

The local checkout also had uncommitted Forgejo CI workflow and release-note changes. Preserve or deliberately reapply those after the canonical Forgejo history is chosen; they are not in Forgejo `main` yet.

## GitHub-side work to review before replacing its main branch

These are representative changes on GitHub after the shared base. They are not present in Forgejo `main` at the snapshot above. The list describes GitHub-only work to retire or selectively reimplement on Forgejo; it does not assume each item conflicts line-for-line.

| Area | GitHub-side change | Why it needs a decision |
| --- | --- | --- |
| CI runner policy | GitHub Actions workflows use multiple `mars-*` runner labels for benchmarks, browser tests, native replay, screenshots, and macOS desktop jobs. | The intended Forgejo setup uses the normal Linux worker pool and must not depend on MARS. Forgejo `main` itself still has `mars-windows-x64` in `.github/workflows/build-test.yml`. |
| Native desktop | Commits `6faf8a4f3` and `82796fc11` add a native macOS shell and RaceIQ support for it. | Decide whether native macOS is part of the Forgejo product direction before discarding or porting that work. |
| AI packaging and providers | Commit `2a484f348` extracts the assistant into a workspace package; later commits add DeepSeek and ChatGPT subscription support. | Keep or reimplement the package boundary and provider behavior if wanted. |
| Release and platform work | GitHub adds v0.21–v0.23 release history, enables iRacing and AMS2 production adapters, adds release/build fixes, and contains GitHub-specific release workflows. | Confirm which release state and platform support should become canonical before mirroring. |
| Review and visual CI | GitHub adds screenshot, snapshot, visual-regression, and PR-comment workflows alongside its build/test workflows. | These rely on GitHub Actions features and MARS runners; they need Forgejo-compatible replacements or an explicit decision to drop them. |
| F1 telemetry | GitHub adds F1 2026 telemetry support, lap recording, and flashback fixes in November. | These features are newer than Forgejo `main`; the local checkout separately has two GT7 commits. Decide which telemetry work to port to Forgejo after the canonical history is established. |
| Later application changes | GitHub includes many post-April product changes, including recording lifecycle, package extractions, and UI/domain updates. | The commit and path lists are large. Reapply only selected features as Forgejo-based commits; do not merge the histories wholesale. |

## Local CI intent

The proposed `.forgejo/workflows/ci.yml` uses `ubuntu-latest` and covers workspace quality checks, unit/tooling/integration tests, build, recording replay, and browser E2E. It is designed for the normal Linux worker. Keep this runner policy when bringing CI onto Forgejo's canonical branch.

Forgejo Actions reads workflow definitions from `.forgejo/workflows`. GitHub Actions reads `.github/workflows`; those GitHub workflows are not automatically a Forgejo CI configuration.

## Current mirror configuration

Forgejo now has a push mirror configured with these settings:

- Destination: `ssh://github.com/SpeedHQ/RaceIQ.git`
- Branch filter: `main`
- Authentication: Forgejo-generated SSH key
- Sync after Forgejo commits: enabled
- Periodic sync: every 8 hours

The public deploy key Forgejo generated is:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOBLUGWBXZRcMEiqPqheU+E2PX4rOOVeBqxYNv1yY5o8
```

The private key remains on Forgejo. Add this public key to the GitHub repository as a deploy key with write access. The initial sync has not completed yet. After the deploy key is installed, use **Settings → Repository → Mirror Settings → Synchronize Now** in Forgejo and confirm that GitHub `main` points to the same commit as Forgejo `main`.

This mirror is scoped to `main`, so the initial takeover replaces GitHub `main` with Forgejo `main` while preserving GitHub's other branch refs. An unfiltered Forgejo push mirror uses mirror semantics and can overwrite or remove GitHub refs that are absent from Forgejo. Expand to all refs only if that broader overwrite is intended.

At the time of this snapshot, Forgejo repository settings showed no push mirrors configured.

## Reference details

The GitHub-only first-parent history includes, among other work, native macOS support, AI assistant extraction, DeepSeek support, v0.21–v0.23 releases, production adapter changes, and a set of MARS-based GitHub Actions jobs. Inspect the exact commits and paths against the saved snapshot before selectively porting anything.
