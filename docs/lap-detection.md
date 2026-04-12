# Lap Detection: v1 vs v2

RaceIQ has two lap detector implementations that share the `ILapDetector` interface (`server/lap-detector-interface.ts`). Each game adapter's `createLapDetector` factory selects the appropriate version.

## Which games use which

| Game | Version | File |
|------|---------|------|
| Forza Motorsport 2023 | v1 (`LapDetector`) | `server/lap-detector.ts` |
| F1 2025 | v1 (`LapDetector`) | `server/lap-detector.ts` |
| Assetto Corsa Competizione | v2 (`LapDetectorV2`) | `server/lap-detector-v2.ts` |

**v2 is designed specifically for ACC behavior and does not work with Forza or F1.**

## v1 — `LapDetector`

The original, general-purpose detector built around the `LapNumber` field that Forza and F1 expose in their UDP telemetry.

### Lap boundary detection

Uses the `LapNumber` field incrementing. Extracted into pure functions in `server/lap-detection.ts`:

- **`detectSessionBoundary()`** — car/track ordinal change, session UID change (F1), lap number reset to 1, distance reset, or 5-minute silence timeout
- **`detectLapBoundary()`** — `LapNumber` incremented by 1 (normal), jumped by >1 (skip, marked invalid), or went backward (rewind reset)
- **`detectLapReset()`** — handles final-lap completion vs race restart by checking if `LastLap` changed

### Rewind detection

Monitors `TimestampMS` — if it decreases within the same lap, the lap is marked invalid with reason `"rewind"`.

### Packet rate filter

Filters out post-race/menu trickle packets (< 30 packets/second). Prevents ghost sessions from sporadic telemetry that games emit when not actively racing. Can be bypassed in tests via `bypassPacketRateFilter`.

### Stale lap flush

`flushStaleLap()` detects 10+ seconds of silence and saves the in-progress lap. Handles scenarios where the game stops sending packets mid-lap (disconnect, quit to menu, etc.).

### Fuel & tire wear tracking

Maintains rolling 50-lap history windows for fuel consumption (`fuelHistory`) and tire wear (`tireWearHistory`). Records start/end values per lap for strategy overlays.

### ACC sector capture (in v1)

When v1 is used for ACC data, it tracks native ACC sector index transitions live (`accS1`, `accS2`) and passes them to `computeLapSectors`. This is the only ACC-specific behavior in v1.

### Debug state

Exposes `getDebugState()` for the dev panel, returning internal counters and state.

## v2 — `LapDetectorV2`

A simpler detector built specifically around ACC's shared memory behavior. **Not compatible with Forza or F1** because it relies on `CurrentLap` (elapsed lap time) rather than `LapNumber` for lap boundaries.

### Why a separate version

The core problem: **ACC's `completedLaps` field lags behind the actual lap boundary by several seconds.** When a driver crosses the start/finish line:

1. `iCurrentTime` (elapsed lap time) resets to 0 immediately — the game knows the lap is done
2. The new lap starts being timed
3. **Seconds later**, `completedLaps` finally increments

V1 uses `LapNumber` (mapped from `completedLaps`) to detect lap boundaries. With ACC's lag, this means the first few seconds of the new lap get incorrectly attached to the end of the previous lap — corrupting both laps' data, sector splits, and lap times.

V2 was built to use `iCurrentTime` resets as the lap boundary signal instead, which fires at the correct moment.

Additional ACC differences that v2 handles:

1. **`completedLaps` can also reset on session changes** — not a reliable incrementing counter
2. **Pit lane status** is exposed (`isCarInPitlane`, `isCarInPit`) and must be used for lap validity
3. **Recording can start mid-lap** — shared memory is always running, unlike UDP games where you connect at session start

### Lap boundary detection

Tracks `peakCurrentLap` (running maximum of `CurrentLap` within the current lap). A lap boundary is detected when `CurrentLap` resets — specifically when the previous `CurrentLap` was >= 30 and the new value is <= 2.

The peak value (not the last value) is used because ACC can reset `iCurrentTime` to 0 and start counting the new lap *before* `completedLaps` increments. The peak captures the true lap time.

### Session restart detection

Simple distance check: if `DistanceTraveled` drops by more than 100m from the previous packet, the in-progress lap is abandoned. No timeout-based detection.

### Mid-lap recording start

`accFirstPacketIsMidLap()` checks if the first packet has `CurrentLap > 5` (more than 5 seconds into a lap). If so, the first "lap" is flagged as partial and discarded on reset. Short fragments (< 100m) from timer glitches are also silently dropped.

### Pit lane classification

`classifyAccPitLap()` (`server/acc-lap-rules.ts`) checks first/last packet `pitStatus`:

| First packet | Last packet | Classification |
|-------------|------------|----------------|
| In pit | On track | `outlap` (invalid) |
| On track | In pit | `inlap` (invalid) |
| In pit | In pit | `pit lap` (invalid) |
| On track | On track | Valid (pit-wise) |

### What v2 does NOT have

- No packet rate filter (ACC shared memory is always reliable when running)
- No fuel/tire wear tracking
- No rewind detection (ACC has no rewind feature)
- No `flushStaleLap()` (uses `flushIncompleteLap()` for end-of-stream only)
- No `getDebugState()`
- No `LastLap`-based final lap detection

## Shared infrastructure

Both versions use:

- **`assessLapRecording()`** (`server/lap-quality.ts`) — validates packet count, distance traveled, lap time consistency, start/end position gap (with ACC-specific exemptions)
- **`computeLapSectors()`** (`server/compute-lap-sectors.ts`) — computes sector splits from track definitions (v2 falls back to distance-fraction sectors since it doesn't track ACC live sector transitions)
- **`ILapDetector` interface** — unified contract so the pipeline doesn't care which version it's using

## Interface

```typescript
interface ILapDetector {
  readonly session: SessionState | null;
  feed(packet: TelemetryPacket): Promise<void>;

  // v1 only (optional on interface)
  readonly fuelHistory?: LapFuelData[];
  readonly tireWearHistory?: LapTireWearData[];
  flushStaleLap?(): Promise<void>;
  getDebugState?(): Record<string, unknown>;

  // Both (v2 added later)
  flushIncompleteLap?(): Promise<void>;
}
```

## Test coverage

- **v1**: `test/lap-detection.test.ts` — tests pure detection functions (session boundaries, lap boundaries, lap resets)
- **v2**: `test/lap-detector-v2.test.ts` — tests ACC recording scenarios (mid-lap start, pit classification, session restarts)
