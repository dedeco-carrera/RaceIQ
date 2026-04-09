/**
 * Standalone raw telemetry recorder.
 *
 * Usage: bun run server/record.ts <gameId>
 *   e.g. bun run server/record.ts f1-2025
 *        bun run server/record.ts fm-2023
 *        bun run server/record.ts acc
 *
 * Records raw packets/frames to data/recordings/<timestamp>/ (UDP)
 * or data/acc-recordings/ (ACC, using existing AccRecorder format).
 * Does NOT start HTTP, WebSocket, lap detector, or pipeline.
 */
import { initGameAdapters } from "../shared/games/init";
import { initServerGameAdapters } from "./games/init";
import { getAllServerGames, tryGetServerGame } from "./games/registry";
import { tryGetGame } from "../shared/games/registry";
import { loadSettings } from "./settings";
import { UdpRecorder } from "./udp-recorder";
import { writeRecordingMeta, type RecordingMeta } from "./record-meta";
import { resolve } from "path";

// Register all game adapters (needed for canHandle + parsing)
initGameAdapters();
initServerGameAdapters();

const gameId = process.argv[2];
if (!gameId) {
  console.error("Usage: bun run server/record.ts <gameId>");
  console.error("  Known games:", getAllServerGames().map((g) => g.id).join(", "));
  process.exit(1);
}

const serverAdapter = tryGetServerGame(gameId);
const sharedAdapter = tryGetGame(gameId);
if (!serverAdapter || !sharedAdapter) {
  console.error(`Unknown game: ${gameId}`);
  console.error("  Known games:", getAllServerGames().map((g) => g.id).join(", "));
  process.exit(1);
}

// --- Session directory ---
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const sessionDir = resolve(process.cwd(), "data", "recordings", timestamp);

const meta: RecordingMeta = {
  gameId: gameId as import("../shared/types").GameId,
  trackOrdinal: null,
  trackName: null,
  carOrdinal: null,
  carName: null,
  startedAt: new Date().toISOString(),
};

// Write initial meta immediately
writeRecordingMeta(sessionDir, meta);

if (gameId === "acc") {
  await recordAcc(sessionDir, meta);
} else {
  await recordUdp(serverAdapter, sharedAdapter, sessionDir, meta);
}

// ─── UDP recording ────────────────────────────────────────────────────────────

async function recordUdp(
  serverAdapter: NonNullable<ReturnType<typeof tryGetServerGame>>,
  sharedAdapter: NonNullable<ReturnType<typeof tryGetGame>>,
  sessionDir: string,
  meta: RecordingMeta
): Promise<void> {
  const settings = loadSettings();
  const udpPort = settings.udpPort ?? (Number(process.env.UDP_PORT) || 5301);

  const recorder = new UdpRecorder();
  recorder.start(sessionDir);

  // Parser state for metadata extraction (first ~100 packets only)
  const parserState = serverAdapter.createParserState();
  let metaResolved = false;
  let parsedCount = 0;
  const META_RESOLVE_LIMIT = 100;

  const dgram = require("dgram");
  const sock = dgram.createSocket("udp4");

  sock.on("message", (buf: Buffer) => {
    recorder.writePacket(buf);

    // Resolve track/car from first few packets
    if (!metaResolved && parsedCount < META_RESOLVE_LIMIT) {
      parsedCount++;
      try {
        const packet = serverAdapter.tryParse(buf, parserState);
        if (packet && packet.TrackOrdinal && packet.CarOrdinal) {
          meta.trackOrdinal = packet.TrackOrdinal;
          meta.carOrdinal = packet.CarOrdinal;
          meta.trackName = sharedAdapter.getTrackName(packet.TrackOrdinal) ?? null;
          meta.carName = sharedAdapter.getCarName(packet.CarOrdinal) ?? null;
          metaResolved = true;
          writeRecordingMeta(sessionDir, meta);
          console.log(`[Record] Resolved: track=${meta.trackName} car=${meta.carName}`);
        }
      } catch {
        // Ignore parse errors during metadata resolution
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    sock.bind(udpPort, "0.0.0.0", () => {
      try {
        sock.setRecvBufferSize(64 * 1024 * 1024);
      } catch {}
      resolve();
    });
    sock.on("error", reject);
  });

  console.log(`[Record] Listening on UDP :${udpPort} — game=${gameId}`);
  console.log(`[Record] Writing to ${sessionDir}`);
  console.log(`[Record] Press Ctrl+C to stop`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[Record] Stopping...");
    sock.close();
    await recorder.stop();
    // Write final meta (in case meta was never resolved, null fields stay null)
    writeRecordingMeta(sessionDir, meta);
    console.log(`[Record] Done. ${recorder.packetCount} packets recorded.`);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─── ACC recording (stub — implemented in Task 5) ────────────────────────────

async function recordAcc(_sessionDir: string, _meta: RecordingMeta): Promise<never> {
  console.error("[Record] ACC recording not yet implemented");
  process.exit(1);
}
