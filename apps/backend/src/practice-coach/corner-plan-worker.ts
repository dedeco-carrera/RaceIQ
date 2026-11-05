import { parentPort, workerData } from "node:worker_threads";
import { f1ServerAdapter } from "@raceiq/game-f1-2025";
import { registerServerGame } from "@raceiq/backend-core/games/registry";
import { registerGame } from "@raceiq/shared/games/registry";
import { getLaps, getLapsByIds } from "@raceiq/backend-core/db/lap-read-queries";
import { closeDb } from "@raceiq/backend-core/db/index";
import { resolveLapSegments } from "@raceiq/backend-core/lap-analysis/insights";
import { buildPracticeCornerPlan } from "@raceiq/backend-core/practice-coach/corner-analysis";
import { selectPracticeReferences } from "@raceiq/shared/racing/practice/reference";
import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";

const input = workerData as { referenceId: number; lapIds: number[]; trackId: string; carId: string; sessionId: number };
registerGame(f1ServerAdapter);
registerServerGame(f1ServerAdapter);

// F1 decoder accepts only 2025/2026 and emits packetFormat for 2026 only.
// These packets were decoded from the capture by that decoder in this worker.
function decodedFormat(packets: readonly TelemetryPacket[]): 2025 | 2026 | undefined {
  let format: 2025 | 2026 | undefined;
  for (const packet of packets) {
    if (!packet.f1) return undefined;
    const current = packet.f1.packetFormat ?? 2025;
    if ((current !== 2025 && current !== 2026) || (format !== undefined && format !== current)) return undefined;
    format = current;
  }
  return format;
}

async function run() {
  try {
    const loaded = await getLapsByIds([input.referenceId, ...input.lapIds]);
    const metadata = await getLaps("f1-2025", 1_000_000, undefined, { trackId: input.trackId, carId: input.carId });
    const { candidates } = selectPracticeReferences(metadata, "f1-2025", input.trackId, input.carId);
    if (!candidates.some((lap) => lap.id === input.referenceId) || input.lapIds.some((id) => !candidates.some((lap) => lap.id === id && lap.sessionId === input.sessionId && lap.ownership === "mine"))) return { error: "Comparable laps unavailable" } as const;
    const reference = loaded.find((lap) => lap.id === input.referenceId);
    const recent = input.lapIds.map((id) => loaded.find((lap) => lap.id === id));
    if (!reference || reference.parseError || recent.some((lap) => !lap || lap.parseError)) return { error: "Lap telemetry unavailable" } as const;
    return { plan: buildPracticeCornerPlan({ id: reference.id, sessionId: reference.sessionId, packets: reference.telemetry, decodedFormat: decodedFormat(reference.telemetry) }, recent.map((lap) => ({ id: lap!.id, sessionId: lap!.sessionId, packets: lap!.telemetry, decodedFormat: decodedFormat(lap!.telemetry) })), resolveLapSegments("f1-2025", input.trackId)) } as const;
  } finally {
    closeDb();
  }
}

run().then((result) => parentPort!.postMessage(result), () => parentPort!.postMessage({ error: "Lap telemetry unavailable" }));
