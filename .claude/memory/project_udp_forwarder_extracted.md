---
name: udp-forwarder-extracted
description: Rust UDP forwarder was built here then moved to SpeedHQ/udp-forwarder as a standalone repo (2026-03-22)
type: project
---

The UDP forwarder (Rust, ini-config based, multi-target forwarding) was originally built in this repo (~2026-03-22), then extracted to its own repository at SpeedHQ/udp-forwarder. The removal commit is 76e1a69. CI was set up with Blacksmith runners for cross-platform builds (Windows/Linux).

**Why:** Standalone tool that other Forza telemetry users might want independently. Keeps this repo focused on the telemetry app itself.

**How to apply:** Don't recreate udp-forwarder code here. If user references it, it lives at SpeedHQ/udp-forwarder.
