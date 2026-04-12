---
name: track-segment-meta-architecture
description: shared/tracks/meta/*.json is the authoritative source for named track segments (cross-game); how segments flow from meta to UI
type: project
---

Named track segments live in `shared/tracks/meta/<sharedName>.json` (e.g. `spa.json`). This is the authoritative source — takes priority over auto-detected or game-extracted segments.

**Segment pipeline (server-side):**
1. `GET /api/track-sectors/:ordinal?gameId=X` — checks `sharedMeta?.segments` first
2. Falls back to auto-detection from telemetry outline (corner/straight classification)
3. `PUT /api/tracks/:trackOrdinal/segments?gameId=X` — saves edited segments back to the meta JSON file (dev only)

**Critical gotcha:** The PUT endpoint requires `?gameId=X` in the query to resolve `getSharedTrackName()`. The TrackDetail client call was missing this — fixed 2026-04-08 by adding `query: { gameId: gid }` to the `$put` call.

**Shared adapter note:** `shared/games/f1-2025/index.ts` has `getSharedTrackName()` returning `undefined` (stub). The server adapter (`server/games/f1-2025/index.ts`) has the real implementation using `getF1TrackInfo()`. The route uses `tryGetGame()` (shared registry), so segment save only works for games whose shared adapter properly implements `getSharedTrackName`. FM2023's shared adapter does implement it correctly.

**Spa-Francorchamps historical segments** (restored 2026-04-08 from git commit `613b8bf`):
- 21 segments, fracs derived from actual telemetry
- "No Name" corner at 0.438–0.473 (fast right-hander between Rivage and Pouhon)
- "Malmedy" is a **corner** (right), not a straight
- Sectors: `s1End: 0.32, s2End: 0.65`
- Named corners: La Source, Eau Rouge, Les Combes, Malmedy, Rivage, No Name, Pouhon, Les Fagnes, Piff Paff, Campus, Stavelot, Blanchimont, Bus Stop

**Why:** Historical 530.json segment names were carefully derived from real telemetry; auto-generation loses corner names and misclassifies some segments.
**How to apply:** When editing or restoring track segments, check `shared/tracks/meta/` first, then `git log -S "segmentName"` to find historical versions.
