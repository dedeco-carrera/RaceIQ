---
name: No fm-2023 fallback for gameId
description: Never fall back to "fm-2023" when gameId is missing — make gameId required instead
type: feedback
originSessionId: 04e88f6c-642f-4223-b94b-da0aea251bde
---
Never use the pattern `gameId ?? "fm-2023"` or `gameId || "fm-2023"` to silently default when gameId is unknown. `gameId` should be a required value on anything downstream of the game adapter registry.

**Why:** Silent fallbacks mask routing/state bugs and produce wrong results for non-Forza games (e.g. pulling the wrong tireHealthThresholds, wrong pressureOptimal, wrong coord system). The registry lookup returning undefined is the signal that the call site is missing context — that should be a type error, not a fallback.

**How to apply:**
- When adding new code that needs `gameId`, type the prop as `GameId` (required), not `GameId | undefined`.
- If a component currently accepts `GameId | undefined`, that's a pre-existing smell — fix it by requiring it, not by adding another fallback.
- `useGameId()` should be asserted non-null at the component boundary where the game context is established (game route layout), not re-asserted at every deep consumer.
- Existing `gameId ?? "fm-2023"` patterns in the codebase are tech debt to remove when touched.
