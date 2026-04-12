---
name: unit-middleware-refactor
description: Planned refactor to add a data transformation middleware for unit conversion (temp, speed, distance) between server data and UI, replacing per-component useUnits() calls
type: project
---

Unit conversion middleware refactor — transform telemetry packets once at the data layer instead of each UI component individually calling `units.temp()`, `units.speed()`, etc.

**Why:** Currently every component that displays temperature, speed, or distance does its own conversion via `useUnits()` hook. This is repetitive and error-prone — easy to forget a conversion or use the wrong one. A middleware approach would convert the packet once, so all components get pre-converted values.

**How to apply:** When starting this task, audit all `useUnits()` usages across components (LiveTelemetry, LapAnalyse, CarWireframe, TelemetryChart, etc.), design a transformation layer (likely in the Zustand telemetry store or a wrapper around the WebSocket/API data), and migrate components to use pre-converted values.
