# RaceIQ Architecture

Visual architecture diagrams for the RaceIQ racing telemetry platform.

## System Overview

```mermaid
graph TB
    subgraph Games["Racing Games"]
        FM[Forza Motorsport]
        F1[F1 2025]
        ACC[Assetto Corsa Competizione]
    end

    subgraph Server["Server (Bun + Hono)"]
        UDP[UDP Listener<br/>64MB buffer]
        SHM[Shared Memory Reader<br/>Windows only]
        Parser[Parser Dispatch<br/>Auto-detect game]
        Pipeline[Telemetry Pipeline<br/>Normalize → Detect → Track → Broadcast]
        LapDet[Lap Detector]
        SectorTrack[Sector Tracker]
        PitTrack[Pit Tracker]
        WS[WebSocket Manager<br/>60Hz throttled broadcast]
        API[Hono REST API]
        DB[(SQLite + Drizzle)]
        AI[Claude AI Analysis]
    end

    subgraph Client["Client (React 19 + Vite)"]
        Router[TanStack Router]
        TelStore[Telemetry Store<br/>Zustand]
        GameStore[Game Store<br/>Zustand]
        Query[TanStack Query]
        UI[Dashboard Components]
    end

    FM -- "UDP :5300" --> UDP
    F1 -- "UDP :5300" --> UDP
    ACC -- "Shared Memory" --> SHM

    UDP --> Parser
    SHM --> Parser
    Parser --> Pipeline
    Pipeline --> LapDet
    Pipeline --> SectorTrack
    Pipeline --> PitTrack
    Pipeline --> WS
    LapDet -- "Save laps" --> DB
    WS -- "WebSocket :3117/ws" --> TelStore
    API -- "HTTP :3117/api" --> Query
    API --> DB
    API --> AI
    TelStore --> UI
    GameStore --> UI
    Query --> UI
    Router --> UI
```

## Telemetry Data Flow

```mermaid
sequenceDiagram
    participant Game as Racing Game
    participant UDP as UDP Listener
    participant Parse as Parser Dispatch
    participant Pipe as Pipeline
    participant Lap as Lap Detector
    participant WS as WebSocket Manager
    participant Client as React Client

    Game->>+UDP: Binary UDP packet (60Hz)
    UDP->>UDP: Validate (≥29 bytes)
    UDP->>+Parse: parsePacket(buffer)
    Parse->>Parse: cachedGame.canHandle()?
    alt Cache hit
        Parse->>Parse: cachedGame.tryParse(buf, state)
    else Cache miss
        Parse->>Parse: Probe all adapters
    end
    Parse-->>-UDP: TelemetryPacket | null

    UDP->>+Pipe: processPacket(packet)
    Pipe->>Pipe: Normalize coordinates
    Pipe->>Pipe: Fill suspension values
    Pipe->>Lap: detectLap(packet)
    Lap-->>Pipe: Lap boundary?

    alt Lap completed
        Lap->>Lap: Save to SQLite
    end

    Pipe->>+WS: broadcast(packet, sectors, pit)
    WS->>WS: Sample history (10Hz)
    WS->>WS: Throttle (60Hz)
    WS-->>-Client: JSON via WebSocket
    Client->>Client: Zustand store update
    Client->>Client: React re-render
```

## Game Adapter Pattern

```mermaid
classDiagram
    class GameAdapter {
        <<interface>>
        +id: GameId
        +displayName: string
        +shortName: string
        +routePrefix: string
        +coordSystem: string
        +steeringCenter: number
        +steeringRange: number
        +getCarName(ordinal) string
        +getTrackName(ordinal) string
        +getSharedTrackName(ordinal) string?
    }

    class ServerGameAdapter {
        <<interface>>
        +canHandle(buf) boolean
        +tryParse(buf, state) TelemetryPacket?
        +createParserState() unknown
        +aiSystemPrompt: string
        +buildAiContext(packets) string
        +processNames: string[]
    }

    GameAdapter <|-- ServerGameAdapter

    class ForzaAdapter {
        id = "fm-2023"
        coordSystem = "forza-lhz"
        Stateless parser
        Size-based detection
    }

    class F1Adapter {
        id = "f1-2025"
        coordSystem = "standard-xyz"
        Stateful accumulator
        Magic-bytes detection
    }

    class ACCAdapter {
        id = "acc"
        coordSystem = "standard-xyz"
        Shared memory reader
        Windows process detection
    }

    ServerGameAdapter <|.. ForzaAdapter
    ServerGameAdapter <|.. F1Adapter
    ServerGameAdapter <|.. ACCAdapter

    class SharedRegistry {
        -games: Map~GameId, GameAdapter~
        +registerGame(adapter)
        +getGame(id) GameAdapter
        +tryGetGame(id) GameAdapter?
        +getAllGames() GameAdapter[]
    }

    class ServerRegistry {
        -games: Map~GameId, ServerGameAdapter~
        +registerServerGame(adapter)
        +getServerGame(id) ServerGameAdapter
        +getAllServerGames() ServerGameAdapter[]
        +tryGetServerGame(id) ServerGameAdapter?
        +isGameRunning() boolean
        +getRunningGame() ServerGameAdapter?
    }

    SharedRegistry --> GameAdapter
    ServerRegistry --> ServerGameAdapter
```

## Database Schema

```mermaid
erDiagram
    profiles {
        integer id PK
        text name
        integer createdAt
    }

    sessions {
        integer id PK
        integer carOrdinal
        integer trackOrdinal
        text gameId
        text sessionType
        integer createdAt
    }

    laps {
        integer id PK
        integer sessionId FK
        integer lapNumber
        real lapTime
        integer isValid
        integer profileId FK
        integer tuneId FK
        blob telemetry
    }

    tunes {
        integer id PK
        text name
        text author
        integer carOrdinal
        integer trackOrdinal
        text settings
        text source
    }

    tuneAssignments {
        integer id PK
        integer carOrdinal
        integer trackOrdinal
        integer tuneId FK
    }

    trackOutlines {
        integer id PK
        integer trackOrdinal
        text gameId
        blob outline
        text sectors
    }

    trackCorners {
        integer id PK
        integer trackOrdinal
        text gameId
        integer cornerIndex
        text label
        real distanceStart
        real distanceEnd
        integer isAuto
    }

    lapAnalyses {
        integer id PK
        integer lapId FK
        text analysis
        integer tokens
        real cost
        real duration
        text model
    }

    sessions ||--o{ laps : "has"
    profiles ||--o{ laps : "driven by"
    tunes ||--o{ laps : "using"
    tunes ||--o{ tuneAssignments : "assigned"
    laps ||--o| lapAnalyses : "analysed"
```

## Client Architecture

```mermaid
graph TB
    subgraph Routing["TanStack Router (file-based)"]
        Root["/ — Root Layout"]
        Onboard["/onboarding — Setup Wizard"]
        FM23["/fm23 — Forza Motorsport"]
        F125["/f125 — F1 2025"]
        ACCRoute["/acc — ACC"]
    end

    subgraph GamePages["Per-Game Pages (shared structure)"]
        Live["/live — Live Telemetry"]
        Sessions["/sessions — Session History"]
        Compare["/compare — Lap Comparison"]
        Analyse["/analyse — Lap Analysis"]
        Tracks["/tracks — Track Maps"]
        Cars["/cars — Car Database"]
        Setup["/setup — Car Setup"]
        Tunes["/tunes — Tune Catalog"]
        Raw["/raw — Raw Telemetry"]
    end

    subgraph State["State Management"]
        TS["telemetry.ts (Zustand)<br/>Live packet, connection, units"]
        GS["game.ts (Zustand)<br/>Active gameId, route prefix"]
        TQ["TanStack Query<br/>Laps, sessions, tracks, tunes"]
    end

    subgraph Comms["Server Communication"]
        WSC["WebSocket /ws<br/>Live telemetry stream"]
        RPC["Hono RPC client<br/>Typed API calls"]
    end

    Root --> Onboard
    Root --> FM23
    Root --> F125
    Root --> ACCRoute

    FM23 --> GamePages
    F125 --> GamePages
    ACCRoute --> GamePages

    WSC --> TS
    RPC --> TQ
    TS --> Live
    GS --> Routing
    TQ --> Sessions
    TQ --> Compare
    TQ --> Analyse
```

## Server Startup Sequence

```mermaid
sequenceDiagram
    participant Main as index.ts
    participant GA as Game Adapters
    participant DB as Database
    participant UDP as UDP Listener
    participant SHM as Shared Memory
    participant Tray as System Tray
    participant HTTP as Bun.serve

    Main->>GA: initGameAdapters()
    Main->>GA: initServerGameAdapters()
    Main->>DB: Initialize SQLite + Drizzle
    Main->>HTTP: Bun.serve({ port: 3117 })
    Note over HTTP: HTTP + WebSocket upgrade at /ws
    Main->>UDP: udpListener.start(5300)
    Note over UDP: 64MB OS receive buffer

    opt Windows
        Main->>SHM: Start ACC shared memory reader
        Main->>Tray: Initialize system tray
    end

    opt First run
        Main->>Main: Open browser to localhost:3117
    end
```

## Parser Dispatch Strategy

```mermaid
flowchart TD
    A[Incoming UDP Buffer] --> B{Cached game\navailable?}
    B -- Yes --> C{cachedGame\n.canHandle buf?}
    C -- Yes --> D[tryParse with cached state]
    C -- No --> E{Last check\n> 5s ago?}
    E -- Yes --> F[getRunningGame\nprocess detection]
    E -- No --> G[Probe all adapters]
    B -- No --> G
    F --> H{Game found?}
    H -- Yes --> I[Update cache + tryParse]
    H -- No --> G
    G --> J{Any adapter\ncanHandle?}
    J -- Yes --> K[Cache adapter + tryParse]
    J -- No --> L[Drop packet]
    D --> M[TelemetryPacket]
    I --> M
    K --> M
    M --> N[processPacket pipeline]
```
