# ACC Telemetry Specification

How RaceIQ reads telemetry from Assetto Corsa Competizione via Windows shared memory.

## Data Source: Shared Memory (not UDP)

Unlike Forza and F1 which send UDP packets, ACC exposes telemetry through three Windows shared memory mapped files. RaceIQ must run on the same machine as ACC — shared memory is local only, no network streaming.

### Shared Memory Pages

| Page | Memory Name | Size | Update Rate | Purpose |
|------|------------|------|-------------|---------|
| Physics | `Local\acpmf_physics` | 800 bytes | ~300 Hz | Vehicle dynamics, inputs, tire/brake data |
| Graphics | `Local\acpmf_graphics` | 1320 bytes | ~60 Hz | Session state, lap timing, position, electronics |
| Static | `Local\acpmf_static` | 688 bytes | Once per session | Car/track identity, physical constants |

Source: ACC v1.8.12 `SharedFileOut.h` with `#pragma pack(4)`. Extended fields (waterTemp through absVibrations) are present in newer ACC versions.

## Reading Architecture

```
kernel32.dll (Bun FFI)
  → OpenFileMappingW / MapViewOfFile (read-only)
    → BufferedAccMemoryReader (polls at native rates: 300Hz physics, 60Hz graphics)
      → TripletAssembler (combines latest buffers at 100Hz)
        → TripletPipeline
          → StatusCheckProcessor (only passes AC_LIVE = 2)
          → ParsingProcessor → parseAccBuffers() → TelemetryPacket
```

### Connection Lifecycle

1. `AccProcessChecker` watches for ACC process (`acc.exe`, `acs2.exe`, `AC2-Win64-Shipping.exe`)
2. On detection: opens shared memory via kernel32 FFI, starts buffer polling
3. `StatusCheckProcessor` gates on `status == AC_LIVE (2)` — ignores replay, pause, off
4. On ACC exit: unmaps views, closes handles, waits for re-detection

### Buffer Reading

- Physics buffer read every ~3.3ms (300 Hz) via `RtlCopyMemory`
- Graphics buffer read every ~16.7ms (60 Hz)
- Static buffer read once, then re-read only when `session` field changes
- Normal reads take 1-2ms; >5ms logged as contention warning

## Physics Buffer (SPageFilePhysics) — 800 bytes

All offsets are little-endian. Types: `f32` = 32-bit float, `i32` = 32-bit signed int.

### Driver Inputs

| Offset | Field | Type | Units | Notes |
|--------|-------|------|-------|-------|
| 4 | gas | f32 | 0..1 | Mapped to 0..255 |
| 8 | brake | f32 | 0..1 | Mapped to 0..255 |
| 12 | fuel | f32 | Litres | Remaining fuel |
| 16 | gear | i32 | Enum | 0=R, 1=N, 2=1st... (normalized: subtract 1 for display) |
| 20 | rpms | i32 | RPM | Current engine RPM |
| 24 | steerAngle | f32 | -1..1 | Mapped to int8 range (-127..127) |
| 28 | speedKmh | f32 | km/h | Converted to m/s for TelemetryPacket |

### Motion & Orientation

| Offset | Field | Type | Units |
|--------|-------|------|-------|
| 32 | velocityX | f32 | m/s |
| 36 | velocityY | f32 | m/s |
| 40 | velocityZ | f32 | m/s |
| 44 | accGX | f32 | G | Multiplied by 9.81 for m/s² |
| 48 | accGY | f32 | G | Multiplied by 9.81 for m/s² |
| 52 | accGZ | f32 | G | Multiplied by 9.81 for m/s² |
| 208 | heading | f32 | Radians | Yaw |
| 212 | pitch | f32 | Radians | |
| 216 | roll | f32 | Radians | |
| 296 | localAngularVelX | f32 | rad/s | Pitch rate (car-local) |
| 300 | localAngularVelY | f32 | rad/s | Yaw rate (car-local) |
| 304 | localAngularVelZ | f32 | rad/s | Roll rate (car-local) |
| 568 | localVelocityX | f32 | m/s | Lateral (car-local) |
| 572 | localVelocityY | f32 | m/s | Vertical (car-local) |
| 576 | localVelocityZ | f32 | m/s | Longitudinal (car-local) |

### Tires

| Offset | Field | Type | Units | Notes |
|--------|-------|------|-------|-------|
| 56-68 | wheelSlip[4] | f32×4 | Magnitude | Combined slip (FL/FR/RL/RR) |
| 88-100 | tyrePressure[4] | f32×4 | PSI | |
| 104-116 | wheelRotation[4] | f32×4 | rad/s | Angular speed |
| 120-132 | tyreWear[4] | f32×4 | 0..1 | 0=new, 1=gone |
| 152-164 | tyreCoreTemp[4] | f32×4 | °C | |
| 168-180 | camber[4] | f32×4 | Radians | Negative = top leaning in |
| 184-196 | suspensionTravel[4] | f32×4 | Metres | |
| 368-380 | tyreTempInner[4] | f32×4 | °C | Inner surface |
| 384-396 | tyreTempMiddle[4] | f32×4 | °C | Not captured (skipped) |
| 400-412 | tyreTempOuter[4] | f32×4 | °C | Outer surface |
| 516-564 | tireContactHeading[4][3] | f32×12 | Unit vec | World-space forward-rolling direction, 12 bytes/tire |
| 640-652 | slipRatio[4] | f32×4 | Ratio | Longitudinal slip |
| 656-668 | slipAngle[4] | f32×4 | Angle | Lateral slip |
| 696-708 | tyreTemp[4] | f32×4 | °C | Display temp (averaged) |

### Brakes

| Offset | Field | Type | Units |
|--------|-------|------|-------|
| 348-360 | brakeTemp[4] | f32×4 | °C |
| 564 | brakeBias | f32 | 0..1 (fraction front) |
| 740-752 | padLife[4] | f32×4 | mm remaining (extended) |
| 756-768 | discLife[4] | f32×4 | mm remaining (extended, not captured) |

### Damage

| Offset | Field | Type | Units |
|--------|-------|------|-------|
| 224 | damFront | f32 | 0..1 |
| 228 | damRear | f32 | 0..1 |
| 232 | damLeft | f32 | 0..1 |
| 236 | damRight | f32 | 0..1 |
| 240 | damCentre | f32 | 0..1 |

### Runtime Intervention

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 204 | tc | f32 | TC intervention signal (>0.01 = active) |
| 252 | abs | f32 | ABS intervention signal (>0.01 = active) |
| 784 | kerbVibration | f32 | Extended |
| 788 | slipVibrations | f32 | TC intervention alt signal (extended) |
| 792 | gVibrations | f32 | Extended |
| 796 | absVibrations | f32 | ABS intervention alt signal (extended) |

TC/ABS active detection uses `OR` of base + vibration signals: `tcFloat > 0.01 || slipVib > 0.01`.

### Other

| Offset | Field | Type | Units |
|--------|-------|------|-------|
| 288 | airTemp | f32 | °C |
| 292 | roadTemp | f32 | °C |
| 364 | clutch | f32 | 0..1 |
| 588 | currentMaxRpm | i32 | RPM (extended) |
| 712 | waterTemp | f32 | °C (extended, not captured) |

## Graphics Buffer (SPageFileGraphic) — 1320 bytes

`wchar_t` = 2 bytes on Windows. `wchar_t[33]` = 66 bytes + 2 bytes padding before next 4-byte-aligned field.

### Session & Timing

| Offset | Field | Type | Units | Notes |
|--------|-------|------|-------|-------|
| 4 | status | i32 | Enum | 0=OFF, 1=REPLAY, 2=LIVE, 3=PAUSE |
| 8 | session | i32 | Enum | 0=Practice...8=Hotstint Qualify |
| 132 | completedLaps | i32 | Count | **Lags behind actual lap completion** — see [Lap Detection](#the-completedlaps-lag-problem) |
| 136 | position | i32 | Position | Race position |
| 140 | iCurrentTime | i32 | ms | Elapsed time in current lap |
| 144 | iLastTime | i32 | ms | Last completed lap time |
| 148 | iBestTime | i32 | ms | Best lap time in session |
| 152 | sessionTimeLeft | f32 | ms | |
| 156 | distanceTraveled | f32 | Metres | |
| 160 | isInPit | i32 | Bool | In pit box |
| 164 | currentSectorIndex | i32 | 0-2 | Current sector |
| 168 | lastSectorTime | i32 | ms | |
| 172 | numberOfLaps | i32 | Count | Total laps in session |
| 248 | normalizedCarPosition | f32 | 0..1 | Spline position (not captured) |

### Electronics Settings (integer levels)

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 1268 | tcGraphics | i32 | TC setting level (1-12) |
| 1272 | tcCut | i32 | TC cut level |
| 1276 | engineMap | i32 | Engine map mode |
| 1280 | absGraphics | i32 | ABS setting level (1-12) |
| 1284 | fuelXLap | f32 | Average fuel per lap (litres) |

### Car Position (multi-car array)

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 256 | carCoordinates[60][3] | f32 | 12 bytes/car (X,Y,Z), 720 bytes total |
| 976 | carID[60] | i32 | 4 bytes/car, 240 bytes total |
| 1216 | playerCarID | i32 | Match against carID[] to find player slot |

Player position is extracted by finding `playerCarID` in the `carID` array, then reading `carCoordinates[slot]`.

### Weather & Tires

| Offset | Field | Type | Units |
|--------|-------|------|-------|
| 176 | currentTyreCompound | wstring[33] | String (e.g. "dry_compound") |
| 1224 | flag | i32 | Enum: 0=None, 1=Blue, 2=Yellow, 3=Black, 4=White, 5=Checkered, 6=Penalty |
| 1236 | isInPitLane | i32 | Bool |
| 1248 | windSpeed | f32 | m/s |
| 1252 | windDirection | f32 | Degrees |
| 1316 | rainTyres | i32 | Bool (wet compound equipped) |

## Static Buffer (SPageFileStatic) — 688 bytes

Read once per session, re-read when `session` field in Graphics changes.

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 60 | numberOfSessions | i32 | |
| 64 | numCars | i32 | |
| 68 | carModel | wstring[33] | String → resolved to car ordinal via CSV |
| 134 | track | wstring[33] | String → fuzzy-matched to track ordinal via CSV |
| 200 | playerName | wstring[33] | Not captured (privacy) |
| 266 | playerSurname | wstring[33] | Not captured |
| 332 | playerNick | wstring[33] | Not captured |
| 400 | sectorCount | i32 | |
| 412 | maxRpm | i32 | RPM |
| 416 | maxFuel | f32 | Litres (tank capacity) |
| 420-432 | suspensionMaxTravel[4] | f32×4 | Metres (used to normalize suspension) |
| 436-448 | tyreRadius[4] | f32×4 | Metres |
| 520 | trackSplineLength | f32 | Metres (not captured) |
| 676 | pitWindowStart | i32 | |
| 680 | pitWindowEnd | i32 | |

## The `completedLaps` Lag Problem

This is the core reason ACC uses LapDetectorV2 instead of v1.

**The problem**: ACC's `completedLaps` field (Graphics offset 132) increments *seconds after* the car actually crosses the start/finish line. In v1, which uses `LapNumber` (mapped from `completedLaps`) to detect lap boundaries, this delay means:

1. Driver crosses start/finish line
2. `iCurrentTime` resets to 0 and starts counting the new lap
3. **Several seconds pass** with the new lap already in progress
4. `completedLaps` finally increments

If we split laps on `completedLaps` changing (v1 behavior), the first few seconds of the new lap get attached to the end of the previous lap. This corrupts both laps:
- Previous lap is too long (includes start of next lap)
- Next lap is too short (missing its opening seconds)
- Sector splits are wrong
- Lap times don't match ACC's own timing

**The fix (v2)**: Instead of watching `completedLaps`, LapDetectorV2 watches `iCurrentTime` (exposed as `CurrentLap` on TelemetryPacket). When `iCurrentTime` resets — specifically when the peak value was >=30s and the new value drops to <=2s — that's the real lap boundary. The peak `iCurrentTime` before the reset is the true lap time.

See `docs/lap-detection.md` for full v1 vs v2 comparison.

## Enums

### AC_STATUS
| Value | Name | Notes |
|-------|------|-------|
| 0 | AC_OFF | Game not in session |
| 1 | AC_REPLAY | Replay mode |
| 2 | AC_LIVE | Active session — only state we process |
| 3 | AC_PAUSE | Paused |

### AC_SESSION_TYPE
| Value | Name |
|-------|------|
| 0 | Practice |
| 1 | Qualify |
| 2 | Race |
| 3 | Hotlap |
| 4 | Time Attack |
| 5 | Drift |
| 6 | Drag |
| 7 | Hotstint |
| 8 | Hotstint Qualify |

### GRIP_STATUS
| Value | Name |
|-------|------|
| 0 | Green |
| 1 | Fast |
| 2 | Optimum |
| 3 | Greasy |
| 4 | Damp |
| 5 | Wet |
| 6 | Flooded |

### FLAG_STATUS
| Value | Name |
|-------|------|
| 0 | None |
| 1 | Blue |
| 2 | Yellow |
| 3 | Black |
| 4 | White |
| 5 | Checkered |
| 6 | Penalty |

## Value Conversions

Transformations applied in `parseAccBuffers()` before building TelemetryPacket:

| Raw ACC Value | TelemetryPacket Field | Conversion |
|---------------|----------------------|------------|
| gas (0..1) | Accel | `round(gas * 255)` |
| brake (0..1) | Brake | `round(brake * 255)` |
| steerAngle (-1..1) | Steer | `round(steerAngle * 127)` |
| speedKmh | Speed | `speedKmh / 3.6` (→ m/s) |
| gear (0=R,1=N,2=1st) | Gear | `gear <= 1 ? 0 : gear - 1` |
| accG[XYZ] (G) | Acceleration[XYZ] | `accG * 9.81` (→ m/s²) |
| iCurrentTime (ms) | CurrentLap | `ms / 1000` (→ seconds), 0x7FFFFFFF = invalid |
| iLastTime (ms) | LastLap | `ms / 1000`, 0x7FFFFFFF = invalid |
| iBestTime (ms) | BestLap | `ms / 1000`, 0x7FFFFFFF = invalid |
| suspTravel / suspMax | NormSuspensionTravel | Division (0..1 normalized) |
| isInPit + isInPitLane | acc.pitStatus | `"in_pit"` / `"pit_lane"` / `"out"` |

## Skipped Fields

Fields present in shared memory but not read by RaceIQ:

| Buffer | Field | Offset | Reason |
|--------|-------|--------|--------|
| Physics | wheelLoad[4] | 72-84 | Not mapped to TelemetryPacket |
| Physics | tyreDirtyLevel[4] | 136-148 | Niche (grip reduction from dirt) |
| Physics | tyreTempMiddle[4] | 384-396 | Inner/outer captured; middle skipped |
| Physics | brakeDiscLife[4] | 756-768 | Only pad wear captured |
| Physics | brakePressure[4] | 716-728 | Not mapped |
| Physics | waterTemp | 712 | Not mapped |
| Graphics | normalizedCarPosition | 248 | Derivable from distance |
| Graphics | otherCarsPositions | 256+ | Only player extracted |
| Graphics | penaltyTime | 1220 | Niche |
| Graphics | exhaustTemperature | 1300 | Not mapped |
| Static | maxTorque/maxPower | 404-408 | Constant per car |
| Static | trackSplineLength | 520 | Track metadata |
| Static | playerName/Surname/Nick | 200-398 | Privacy |
| Static | dryTyresName/wetTyresName | 688+ | Derivable |

## Key Differences from Forza/F1

| Aspect | Forza / F1 | ACC |
|--------|-----------|-----|
| Transport | UDP packets over network | Windows shared memory (local only) |
| Packet detection | `canHandle(buf)` checks size/magic bytes | Process detection (`acc.exe`) |
| Update rate | 60 Hz (game sends) | 300Hz physics, 60Hz graphics (we poll) |
| Lap boundary signal | `LapNumber` increments reliably | `completedLaps` lags — use `iCurrentTime` reset |
| Lap detector | v1 (`LapDetector`) | v2 (`LapDetectorV2`) |
| Rewind | Possible (TimestampMS check) | Not possible |
| Pit detection | Not available | `isInPit` + `isInPitLane` |
| Tire data depth | Surface temp only | Surface (inner/outer/display) + core + camber + contact heading |
| Brake data | Temperature only | Temperature + pad wear (mm) + disc wear (mm) |
| Damage model | Not available | 5-zone (front/rear/left/right/centre) |
| Electronics | Not available | TC, TC cut, ABS, engine map, brake bias |
| Car/track identity | Numeric ordinals in packet | String names in Static buffer → fuzzy-matched to ordinals |
| Angular velocity | Available | Car-local axes (pitch/yaw/roll rates) |
| Coordinate system | Game-specific | Standard XYZ, world space |

## Implementation Files

| File | Purpose |
|------|---------|
| `server/games/acc/structs.ts` | Shared memory offset definitions |
| `server/games/acc/buffered-memory-reader.ts` | kernel32 FFI, buffer polling at native rates |
| `server/games/acc/triplet-assembler.ts` | Combines 3 buffers into synchronized triplets at 100Hz |
| `server/games/acc/triplet-pipeline.ts` | Status check + parsing/recording processors |
| `server/games/acc/parser.ts` | `parseAccBuffers()` → TelemetryPacket |
| `server/games/acc/process-checker.ts` | Detects ACC running/stopped |
| `server/games/acc/shared-memory.ts` | Top-level `AccSharedMemoryReader` orchestrator |
| `server/games/acc/recorder.ts` | Raw buffer recording to .bin files |
| `server/games/acc/utils.ts` | `readWString()`, `toWideString()` helpers |
| `server/games/acc/index.ts` | Server game adapter (AI prompts, lap detector factory) |
| `shared/games/acc/index.ts` | Shared game adapter (steering, coord system, thresholds) |
| `shared/acc-car-data.ts` | Car ID → name CSV lookup |
| `shared/acc-track-data.ts` | Track string → ordinal fuzzy matching |
| `server/acc-lap-rules.ts` | ACC-specific lap validity (mid-lap start, pit classification) |
| `server/lap-detector-v2.ts` | LapDetectorV2 (ACC-only, iCurrentTime-based) |
