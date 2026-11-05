# Practice coach reference laps: discovery and implementation plan

Status: initial local and shared-archive implementation. Automatic online discovery is future work.

This document records discovery and the staged plan alongside the implemented [practice coach contract](practice-coach-contract.md).

## Reference choices

For each compatible track layout, game version and car context, offer three independently labeled references:

1. **Personal best:** fastest valid, complete, comparable lap owned by the driver. Use the existing local lap library; no download is required. Exclude imported laps owned by others and non-pace laps.
2. **Next step:** a real, comparable lap closest to `personalBestSeconds * 0.996` among available laps that are faster than the personal best. Show its actual gap, not a rounded claim that it is exactly 0.4% faster. If no suitable candidate exists, show unavailable; never time-scale or fabricate telemetry. Select from user-owned or consented shared telemetry where possible.
3. **Fastest available:** fastest eligible, verified candidate from the chosen source and explicitly defined scope. Display source, date, actual time, availability and restrictions. It is not necessarily the global fastest lap.

For example, a 90.000 s personal best yields a next-step target of 89.640 s. The closest real candidate may be 89.700 s; label its actual 0.333% advantage. If candidates are far away, say the requested target is unavailable instead of implying a small improvement step. The acceptable tolerance and source selection are product decisions, not hard-coded assumptions.

## Evidence and compatibility

- Match simulator and telemetry format/version, track layout, car class/model or explicitly comparable performance context, session mode, assists, weather, tire and setup context when available. Unknown compatibility stays unknown; never silently equate incompatible configurations.
- Preserve ownership, provenance, acquisition time, permissions, validity, completeness, and available channel capabilities. An unverified leaderboard time is not a complete telemetry lap.
- A reference with timing and distance only may support pace and time-delta comparisons. Braking, throttle, steering, racing line and curb recommendations require independently valid channels. A leaderboard time alone cannot drive per-corner coaching.
- Validate imported/downloaded data and units before matching. Keep source data unchanged; preserve missingness and reject corrupted or truncated files. Reference removal must not delete the owner's recordings.
- Detect when the personal best changes and recalculate the target. Offer an explicit source and candidate override; do not replace a selected reference mid-corner.

## Acquisition options investigated

- RaceIQ already imports and exports its own lap archives, including laps from others. This is the first full-telemetry path for user-owned or voluntarily shared recordings.
- F1Laps supports comparisons against its public leaderboard laps and offers a read-only MCP for account-accessible lap analysis, subject to account and plan access. F1Laps states it does not offer lap file export. Whether its MCP exposes sufficient raw sample data, allows an external app to cache it, or permits programmatic candidate search near a target remains unverified. Do not implement scraping or promise file download until access, terms, capabilities and user authorization are verified. Sources: [F1Laps MCP](https://www.f1laps.com/faqs/f1laps-mcp/), [F1Laps comparison and export](https://www.f1laps.com/faqs/f1laps-vs-sim-racing-telemetry/).
- EA's F1 25/2026 UDP format provides a Time Trial packet. Another recorder reports that a loaded ghost can provide lap/sector timing and progress, but its brake, throttle and steering data are unreliable. Treat this as a candidate pace-only path until independently verified against real recordings; do not label it a full input trace. Sources: [EA UDP structures](https://forums.ea.com/blog/f1-games-game-info-hub-en/ea-sports%E2%84%A2-f1%C2%AE25-2026-season-pack-udp-specification/12187347), [TRACE ghost documentation](https://github.com/LMC4S/F1-25-Trace#ghost-laps-pace-references-times-only).
- TRACE documents user-shared `.trace` files with lap telemetry. RaceIQ does not currently import that format; validate its schema, license, channel semantics, compatibility and sample files before offering a converter. [TRACE sharing](https://github.com/LMC4S/F1-25-Trace#sharing-laps).

## Backend plan

Depends on an agreed extension to the shared practice-coach contract before implementation. Define a typed reference catalog with capability and provenance metadata, a personal-best selector, and deterministic target/fastest candidate selection. Add adapters only for sources whose access and redistribution rules are established. Keep timing-only ghosts distinct from full telemetry, validate uploads, and persist reference identity separately from the user's own laps. Test exact and missing matches, ties, incompatible versions, unavailable channels, duplicates, malformed data, and changing personal bests.

Acceptance: selectors return real eligible references and their actual gaps; unsupported or unavailable sources return an explicit reason. No source is presented as globally fastest without evidence.

## UI plan

Depends on the same agreed contract and backend catalog. Show personal best, next step and fastest available, each with actual lap time, gap, source, compatibility and channel coverage. Allow selection and an explicit import of permitted shared data. When an appropriate reference is unavailable, explain what data is needed; disable unsupported coaching cues. Distinguish observed values from inferred guidance.

Acceptance: users can understand which reference is active and whether it supports pace only or full driving-input coaching. No interaction claims a source is downloadable until its acquisition path is validated.
