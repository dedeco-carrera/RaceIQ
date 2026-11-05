# Practice coach contract

Practice feedback is observational. It uses only the current session, excludes invalid, unclassified and non-pace laps, and never presents missing telemetry as zero or an inferred observation as a confirmed cause. No AI provider is required.

## Shared data and behavior

- Existing `session-laps` notifications identify completed laps, their validity, classification, processing state and sector times. Existing live telemetry carries sector and pit estimates. The client must not request analysis until a lap's capture is ready.
- `GET /api/laps/:id/practice-insights` requires the `X-Game-Id` header and returns `{ insights: [{ id, severity, label, detail, progress }] }`. `progress` is the optional 0–1 lap-distance position of the first evidence frame; missing or invalid distance yields `null`. It returns 404 for an unknown or mismatched lap, 409 while capture processing is pending, and 422 on processing failure. The debrief selects at most one driving observation, preserving its label and detail. Empty findings are valid, not an error.
- Compare a completed eligible lap with the fastest other eligible session lap. Show the largest positive matched-sector difference only when both sector arrays are complete and comparable. Do not compare a lap with itself.
- Recent pace trend uses at most five eligible completed laps, requires at least three, and reports their time spread and sample size. Invalid, incomplete, in/out and other non-pace laps do not contribute.
- Live alerts use available, finite, non-negative session fuel-range and tire-life estimates. Present an alert below three laps, include the estimated range and source, and do not invent alerts when estimates are absent. No audio, push notification, or transient lockup diagnosis.
- Session changes, disconnects and lap removal clear stale results. Limits, confidence and unsupported channels remain visible through missing/empty states.

## Reference catalog and corner-coaching extension

The following agreed contract extends the existing panel. Backend and UI plans in [reference-lap plan](practice-coach-reference-laps.md) both depend on it.

- `GET /api/practice/references?trackId=...&carId=...` uses the required `X-Game-Id` header. It returns all eligible locally available RaceIQ laps for that exact game, track and car, `personalBest`, `nextStep`, `fastest`, target time and candidate eligibility. Results identify ownership, creation time, lap identity and telemetry availability; local catalog scope is explicit. Unknown weather, assists, car setup, tire and version compatibility is not asserted compatible. No claim of a global fastest lap.
- Candidates require valid, classified pace laps, positive finite time, ready capture and retained telemetry. Personal best requires owned data. Next-step target is `personalBest * 0.996`; default tolerance is 0.2 percentage points of personal-best time on either side, user-adjustable. Only a genuinely faster, eligible candidate may match. Report actual delta; absence is explicit. Fastest is fastest eligible local candidate and may equal personal best.
- Existing authenticated RaceIQ archive import and export remain the acquisition path for consensually shared full-telemetry laps. Shared imports are marked `others`. Source-specific integrations and timing-only ghosts must retain their own provenance and channel capabilities; unsupported sources cannot be advertised as downloadable or treated as having control channels.
- Reference mode and explicit candidate override are stored separately from laps and scoped by game, track and car. Invalidate selection when reference is deleted or becomes ineligible; do not alter or delete source recordings.
- Corner coaching consumes curated game-specific corner geometry and measured comparable inputs. Prioritize repeatable losses and schedule at most one actionable cue per safe lead-in; do not overlap braking zones or spam successive linked corners. Compare a completed corner with matching prior/reference segments. Phrase measured changes as observations, not causal claims. Unknown evidence suppresses a claim, particularly curb advice.
- Audio is off until explicitly enabled. Beeps need a valid measured braking reference, fresh position/speed, a safe countdown and user-adjustable output latency. Cancel on disconnect, session change, teleport, invalid data or a missed timing window. Do not extrapolate during a telemetry gap. No speech or beeps should fire from replayed/stale React state.
- A context mismatch, missing or unusable reference, missing geometry, unavailable source fields, stale telemetry, insufficient laps or uncertain timing produces an unavailable state and no speculative cue. All user-facing copy is localized.
- F1 2025 normalized packets omit wire-format identity, while the current F1 capture decoder emits an explicit identity for 2026 and accepts only those two formats. The worker uses that decoder contract for captures decoded in-process; otherwise unknown formats compare only within one recorded session. Conditions and assists are not verified.
- `GET /api/practice/corner-plan` validates the selected reference and two or three distinct owned session laps, and decodes and compares captures in a bounded worker. It returns a measured repeated-loss plan or `null` when evidence is insufficient.

## Backend plan

1. Reuse existing capture-ready events and deterministic lap-insights service; expose a compact endpoint and do not run analysis in the packet path. Verify its contract with focused tests and recorded F1 UDP replay.
2. Confirm sector/pit estimates and lap classifications exclude unavailable values and unsuitable laps. Any contract change must retain backward compatibility.

Acceptance: completed lap can be analyzed only after capture readiness; replayed packets preserve session/lap boundaries and no fabricated telemetry reaches the coach.

## UI plan

1. Add a practice panel to the F1 live dashboard using `session-laps`, live sector/pit data and typed Hono RPC.
2. Display latest eligible lap debrief, matched-sector comparison, recent pace spread and conservative fuel/tire alerts. Keep the panel stable while data loads or is unavailable; clear on session changes.
3. Add all user-facing messages in every supported locale. Test eligibility, comparison, unavailable values and session changes; add a browser flow when fixture infrastructure permits.

Acceptance: panel follows the shared rules above and never blocks live telemetry when analysis fails or a provider is unconfigured.
