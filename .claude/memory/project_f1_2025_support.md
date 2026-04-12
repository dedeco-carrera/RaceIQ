---
name: F1 2025 and multi-game support
description: Multi-game adapter system supporting FM2023, F1 2025, and ACC with registry pattern
type: project
---

Multi-game support added incrementally: F1 2025 (2026-03-26), ACC (by 2026-04-05). Architecture uses a registry-based adapter pattern.

**Architecture:** Auto-detect game from UDP packets via `canHandle()`. Each game has a shared adapter (`shared/games/<id>/`) and server adapter (`server/games/<id>/`). Registries in `shared/games/registry.ts` and `server/games/registry.ts`.

**Game separation:** `gameId` column in sessions, trackOutlines, trackCorners tables. Auto-migration adds game_id columns on startup (2026-03-30).

**Routing:** Game-specific routes under `/fm23`, `/f125`, `/acc`. Separate live dashboards per game. Analyse/compare pages shared but extended with game-specific stats.

**Current games:**
- `fm-2023` — Forza Motorsport 2023 (stateless parser, size-based detection)
- `f1-2025` — F1 2025 (stateful multi-packet accumulator, magic bytes detection)
- `acc` — Assetto Corsa Competizione (shared memory reader on Windows)

**Why:** User wants to support multiple sim racing games simultaneously.
**How to apply:** New games follow the adapter pattern documented in CLAUDE.md "Adding a New Game" section.
