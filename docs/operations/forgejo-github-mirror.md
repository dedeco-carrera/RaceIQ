# Forgejo canonical repository and GitHub mirror

Status recorded: 2026-11-25

## Direction

Forgejo `dedeco/speedhq-raceiq` is the canonical repository. Developers push to Forgejo. GitHub `SpeedHQ/RaceIQ` is a downstream mirror of Forgejo and must not be treated as the source of truth.

The intended mirror is Forgejo push mirror → GitHub. GitHub's current branch history must be replaced by Forgejo's canonical history when the mirror is first synchronized.

## Divergence snapshot

The comparison was made against these branch tips:

| Repository | Branch | Commit | Date | Subject |
| --- | --- | --- | --- | --- |
| Forgejo | `main` | `15e0a4798ce7f08338ca238332c3ce6ffa07f45a` | 2026-08-31 | Improve MoTeC import for ACC and AC Evo (#349) |
| GitHub | `main` | `8fb2fcdb607846c15a99d0187b9f59d31f47003c` | 2026-11-24 | Fix AC EVO session labels and duplicate out-laps (#518) |

Both histories share `42ef7ceaa91b3e2657cb347cf5f3a3b57f72d73c` (`chore: bump version to 0.2.0`, 2026-04-04). After that point, Forgejo has 396 commits and GitHub has 600 commits. Neither tip is an ancestor of the other. Their trees differ in 5,677 paths; this is a file-difference count, not a count of Git's eventual line-level merge conflicts.

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
| Later application changes | GitHub includes many post-April product changes, including recording lifecycle, package extractions, and UI/domain updates. | The commit and path lists are large. Reapply only selected features as Forgejo-based commits; do not merge the histories wholesale. |

## Local CI intent

The proposed `.forgejo/workflows/ci.yml` uses `ubuntu-latest` and covers workspace quality checks, unit/tooling/integration tests, build, recording replay, and browser E2E. It is designed for the normal Linux worker. Keep this runner policy when bringing CI onto Forgejo's canonical branch.

Forgejo Actions reads workflow definitions from `.forgejo/workflows`. GitHub Actions reads `.github/workflows`; those GitHub workflows are not automatically a Forgejo CI configuration.

## Initial mirror setup

1. In Forgejo, open the repository's **Settings → Repository → Mirror Settings** and add a push mirror to `https://github.com/SpeedHQ/RaceIQ.git`.
2. Authenticate with a GitHub credential that can write repository contents and workflow files. Do not store the credential in this repository.
3. Select the desired sync-on-push and periodic sync options.
4. For the initial takeover, synchronize Forgejo `main` to GitHub. The first sync is expected to force-update GitHub's `main` to Forgejo's `main`.
5. Decide whether the mirror should publish only `main` initially or all refs. An unfiltered Forgejo push mirror uses mirror semantics and can overwrite or remove GitHub refs that are absent from Forgejo. Preserve any GitHub-only work outside the mirrored refs before enabling an all-ref mirror if it may be needed later.
6. Verify the GitHub `main` SHA matches Forgejo `main`, then treat Forgejo as the only place where canonical changes are made.

At the time of this snapshot, Forgejo repository settings showed no push mirrors configured.

## Reference details

The GitHub-only first-parent history includes, among other work, native macOS support, AI assistant extraction, DeepSeek support, v0.21–v0.23 releases, production adapter changes, and a set of MARS-based GitHub Actions jobs. Inspect the exact commits and paths against the saved snapshot before selectively porting anything.
