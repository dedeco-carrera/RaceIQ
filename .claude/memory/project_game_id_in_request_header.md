---
name: gameId belongs in the HTTP request header
description: Architectural direction — propagate current gameId via request header (e.g. X-Game-Id), not per-call query params or zustand state
type: project
originSessionId: 04e88f6c-642f-4223-b94b-da0aea251bde
---
The long-term direction is to include the current gameId in every outgoing API request as a header (e.g. `X-Game-Id: acc`), resolved once in a Hono RPC client middleware. Server routes then read the header, and client components don't need to stuff `gameId` into every query param or rely on the zustand store being hydrated before children mount.

**Why:** Today the client sets `gameId` in a zustand store from a tanstack route layout's `useEffect`, which runs *after* child components mount — leading to race conditions like `useRequiredGameId` throwing on first render of the analyse page. API calls also duplicate the `?gameId=acc` suffix in many hooks. Centralising on a request header removes both problems and makes the server the single reader.

**How to apply:**
- New hooks that call server routes should assume the header is attached automatically, not add `?gameId=` query params.
- When refactoring call sites, remove `gameId` query params and `useCarName`-style `{ query: { gameId } }` RPC arg patterns.
- The header should be injected by a single RPC client middleware (see `client/src/lib/rpc.ts`) reading from the zustand store or URL.
- Route-layout effect-based setGameId stays as the source for UI-only reads until the refactor.
- Interim: when a component needs `gameId` synchronously on first render, derive it from the URL (tanstack router pathname), not the effect-populated store.
