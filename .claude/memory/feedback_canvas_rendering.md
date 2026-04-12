---
name: canvas-rendering-lessons
description: AnalyseTrackMap canvas pitfalls — offscreen caching, memoization, useLayoutEffect, follow view zoom
type: feedback
---

AnalyseTrackMap uses a 3-canvas stack (track, car overlay, pulse) with an offscreen canvas cache. Several hard-won lessons from 2026-04-07:

1. **Setting `canvas.width` clears the visible canvas.** If `drawStaticTrack` sets dimensions then draws to offscreen only, the visible canvas stays blank until a separate blit. Always blit to visible canvas in the same function that sets dimensions, or use `useLayoutEffect` to prevent the browser from painting the cleared state.

2. **useLayoutEffect for canvas ops, not useEffect.** `useEffect` runs after browser paint → user sees a frame of cleared canvas before the redraw. `useLayoutEffect` runs before paint.

3. **Follow view zoom must happen at composite time, not draw time.** Drawing the track at 3x scale onto a 1x-sized offscreen clips most of the track. Instead: draw at 1x on the offscreen (full track fits), apply the 3x `followZoom` via `ctx.scale()` during `compositeTrack`. The zoom transform chain: `translate(center) → rotate(yaw) → scale(3) → translate(-carPos)`.

4. **Memoize values used as useEffect deps.** An un-memoized `const allSegs = cond ? a : b` creates a new reference every render → effect re-runs → setState → infinite loop. Always `useMemo` values that appear in effect dependency arrays.

5. **Only draw car overlay in the active view mode.** Fixed view uses the overlay canvas for the car. Follow view draws the car on the main canvas inside `compositeTrack`. Drawing both = duplicate arrows.

**Why:** These bugs caused tracks to flash/disappear, partial rendering, infinite loops, and duplicate car arrows.

**How to apply:** When modifying AnalyseTrackMap, respect the offscreen→composite pipeline. Test both fixed and follow view after changes.
