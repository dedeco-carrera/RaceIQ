/**
 * Replay a real F1 2025 session through the full pipeline and assert that
 * the emitted laps match the game's own lap timing and sector splits.
 *
 * Fixture: test/artifacts/sessions/f1-2025-2026-04-22T11-42-43-029Z.bin.gz
 *   Track 19 (Las Vegas), car 41, five laps. Recorded 2026-04-22 11:42:43.
 *
 * Expected values come straight from the F1 SessionHistory packet captured in
 * the recording — they are the game's authoritative per-lap sector splits,
 * not distance-fraction estimates. This test locks in that the replay path
 * reproduces those numbers.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { initGameAdapters } from "@raceiq/game-catalogs/games/init";
import { initServerGameAdapters } from "../../src/games/init";
import { getServerGame } from "@raceiq/backend-core/games/registry";
import {
  CapturingDbAdapter,
  CapturingWsAdapter,
  NullSessionRecorderAdapter,
} from "@raceiq/backend-core/telemetry/pipeline-ports";
import { LiveTelemetryPipeline, stopMaintenanceTasks } from "@raceiq/backend-core/telemetry/live-pipeline";
import { computeLapSectors } from "@raceiq/telemetry-core/processor/sectors";
import { META_FRAME_MAGIC } from "@raceiq/capture-formats/session/framing";
import { buildPracticeCornerPlan, preparePracticeLap } from "@raceiq/backend-core/practice-coach/corner-analysis";
import { resolveLapSegments } from "@raceiq/backend-core/lap-analysis/insights";
import { processLap } from "@raceiq/analysis-core/racing/analysis/laps/insights/process";
import { PracticeCueScheduler, type PracticeCue } from "@raceiq/shared/racing/practice/cue-scheduler";
import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";


initGameAdapters();
initServerGameAdapters();

afterAll(() => stopMaintenanceTasks());

const FIXTURE = "test/artifacts/sessions/f1-2025-2026-04-22T11-42-43-029Z.bin.gz";

interface ReplayedLap {
  lapNumber: number;
  lapTime: number;
  isValid: boolean;
  sectors: number[] | null;
  packets: TelemetryPacket[];
}

interface ReplayResult {
  laps: ReplayedLap[];
  broadcastedPackets: CapturingWsAdapter["broadcastedPackets"];
}

let cachedReplay: ReplayResult | null = null;

test("real F1 lap preserves enough continuous evidence for practice coaching", async () => {
  const valid = (await replay()).laps.filter((lap) => lap.isValid && lap.lapTime > 0);
  expect(valid.length).toBeGreaterThanOrEqual(2);
  const first = valid[0]!;
  expect(preparePracticeLap(1, first.packets)).not.toBeNull();
  // Identical observed laps cannot show a repeated loss, regardless of geometry.
  expect(buildPracticeCornerPlan({ id: 1, sessionId: 2, packets: first.packets }, [{ id: 2, sessionId: 2, packets: first.packets }, { id: 3, sessionId: 2, packets: first.packets }], [{ type: "corner", name: "Fixture corner", startFrac: 0.4, endFrac: 0.5 }])).toBeNull();
}, { timeout: 180_000 });

test("real F1 laps produce repeatable corner evidence with curated geometry", async () => {
  const valid = (await replay()).laps.filter((lap) => lap.isValid && lap.lapTime > 0).sort((a, b) => a.lapTime - b.lapTime);
  expect(valid.length).toBeGreaterThanOrEqual(3);
  const segments = resolveLapSegments("f1-2025", "19");
  expect(segments.filter((segment) => segment.type === "corner").length).toBeGreaterThan(0);
  const plan = buildPracticeCornerPlan({ id: valid[0]!.lapNumber, sessionId: 2, packets: valid[0]!.packets }, valid.slice(1, 4).map((lap) => ({ id: lap.lapNumber, sessionId: 2, packets: lap.packets })), segments);
  expect(plan).not.toBeNull();
  expect(plan!.corner.meanLossS).toBeGreaterThan(0.1);
  expect(plan!.comparisonLapIds.length).toBeGreaterThanOrEqual(2);
  expect(plan!.corner.referenceBrakeFrac).not.toBeNull();
}, { timeout: 180_000 });

test("real F1 corner opportunity schedules cues and feedback on a later lap", async () => {
  const valid = (await replay()).laps.filter((lap) => lap.isValid && lap.lapTime > 0);
  const reference = valid.find((lap) => lap.lapNumber === 2)!;
  const comparison = valid.filter((lap) => lap.lapNumber === 3 || lap.lapNumber === 4);
  const driven = valid.find((lap) => lap.lapNumber === 5)!;
  const plan = buildPracticeCornerPlan({ id: reference.lapNumber, sessionId: 2, packets: reference.packets }, comparison.map((lap) => ({ id: lap.lapNumber, sessionId: 2, packets: lap.packets })), resolveLapSegments("f1-2025", "19"));
  expect(plan).not.toBeNull();
  const scheduler = new PracticeCueScheduler();
  const output: PracticeCue[] = [];
  let sequence = 0;
  let lastTime = -Infinity;
  const input = [...processLap(comparison.at(-1)!.packets, "f1-2025").packets.slice(-2), ...processLap(driven.packets, "f1-2025").packets];
  for (const packet of input) {
    const length = packet.f1?.trackLength;
    if (!length || packet.DistanceTraveled < 0 || packet.DistanceTraveled > length || packet.TimestampMS - lastTime < 30) continue;
    lastTime = packet.TimestampMS;
    const frame = { streamId: "fixture", sessionId: 2, sequence: ++sequence, lapNumber: packet.LapNumber, fraction: packet.DistanceTraveled / length, speedMps: packet.Speed, brake: packet.Brake, observedAtMs: packet.TimestampMS, receivedAtMs: packet.TimestampMS };
    output.push(...scheduler.step(frame, plan, frame.receivedAtMs, 0));
  }
  expect(output.some((event) => event.type === "prepare")).toBe(true);
  expect(output.some((event) => event.type === "feedback")).toBe(true);
}, { timeout: 180_000 });

async function replay(): Promise<ReplayResult> {
  if (cachedReplay) return cachedReplay;

  const raw = readFileSync(FIXTURE);
  const buf = Buffer.from(gunzipSync(raw));

  let offset = 0;
  if (buf.length >= 8 && buf.readUInt32LE(0) === META_FRAME_MAGIC) {
    offset = 8 + buf.readUInt32LE(4);
  }

  const serverGame = getServerGame("f1-2025");
  const parserState = serverGame.createParserState?.() ?? null;
  const db = new CapturingDbAdapter();
  const ws = new CapturingWsAdapter();
  const pipeline = new LiveTelemetryPipeline(db, ws, { bypassPacketRateFilter: true, skipHistorySeeding: true, skipDevState: true, recorder: new NullSessionRecorderAdapter() });

  // Accumulate packets per (detected) lap number so we can rerun sector
  // computation against just the emitted-lap packets.
  const packetsByLap = new Map<number, TelemetryPacket[]>();
  let lastLapNum = -1;

  while (offset + 4 <= buf.length) {
    const len = buf.readUInt32LE(offset);
    if (offset + 4 + len > buf.length) break;
    const sourceFrame = buf.subarray(offset + 4, offset + 4 + len);
    offset += 4 + len;
    const packet = serverGame.tryParse(sourceFrame, parserState);
    if (!packet) continue;
    await pipeline.processPacket(packet);
    if (packet.LapNumber !== lastLapNum) lastLapNum = packet.LapNumber;
    const bucket = packetsByLap.get(packet.LapNumber) ?? [];
    bucket.push(packet);
    packetsByLap.set(packet.LapNumber, bucket);
  }

  await pipeline.flushIncompleteLap();
  await new Promise<void>((r) => setTimeout(r, 0));

  const laps: ReplayedLap[] = [];
  for (const saved of db.laps) {
    const packets = packetsByLap.get(saved.lapNumber) ?? [];
    laps.push({
      lapNumber: saved.lapNumber,
      lapTime: saved.lapTime,
      isValid: saved.isValid,
      sectors: saved.sectors ?? null,
      packets,
    });
  }
  const result = { laps, broadcastedPackets: ws.broadcastedPackets };
  cachedReplay = result;
  return result;
}

describe("F1 2025 session 2026-04-22 11:42 — lap times and sector splits", () => {
  test("replay produces five completed laps", async () => {
    const laps = (await replay()).laps;
    const completed = laps.filter((lap) => lap.lapTime > 0);
    expect(completed.length).toBeGreaterThanOrEqual(5);
  }, { timeout: 180_000 });

  test("published best lap equals fastest valid recorded lap", async () => {
    const result = await replay();
    const fastestValidLap = Math.min(...result.laps.filter((lap) => lap.isValid && lap.lapTime > 0).map((lap) => lap.lapTime));
    const finalPacket = result.broadcastedPackets.at(-1)?.packet;
    expect(finalPacket?.BestLap).toBeCloseTo(fastestValidLap, 3);
  }, { timeout: 180_000 });

  test("every emitted lap's sectors sum to its lap time", async () => {
    const laps = (await replay()).laps;
    for (const lap of laps) {
      if (!lap.isValid || !lap.sectors || lap.lapTime <= 0) continue;
      const sum = lap.sectors.reduce((total, time) => total + time, 0);
      expect(sum).toBeCloseTo(lap.lapTime, 2);
    }
  }, { timeout: 180_000 });

  test("sanity: no valid lap has a sector under 10 seconds", async () => {
    // A sub-10s sector on a 1:19+ lap can only come from parser drift /
    // residual fields from the next lap (the symptom of the SessionHistory
    // 14-byte layout bug and the lastS1/lastS2 aliasing issue).
    const laps = (await replay()).laps;
    for (const lap of laps) {
      if (!lap.isValid || !lap.sectors || lap.lapTime <= 0) continue;
      expect(lap.sectors.every((time) => time > 10)).toBe(true);
    }
  }, { timeout: 180_000 });

  test("sectors come from F1 SessionHistory / LapData (not distance-fraction)", async () => {
    const laps = (await replay()).laps;
    // computeLapSectors with gameId='f1-2025' must never fall back to the
    // distance-fraction branch. Running it against the emitted-lap packets
    // must produce the exact same sector values as the saved lap row.
    for (const lap of laps) {
      if (!lap.isValid || lap.packets.length < 50 || !lap.sectors) continue;
      const recomputed = await computeLapSectors("19", "f1-2025", lap.packets, lap.lapTime);
      expect(recomputed).not.toBeNull();
      expect(recomputed).toEqual(lap.sectors);
    }
  }, { timeout: 180_000 });

  test("per-lap sector times match F1 SessionHistory values from the fixture", async () => {
    const laps = (await replay()).laps;
    // Expected sector splits pulled from the F1 SessionHistory packets in
    // this recording (i.e. what the game itself reports). Update whenever
    // the fixture changes.
    const expected: Record<number, { lapTime: number; s1: number; s2: number; s3: number }> = {
      1: { lapTime: 81.535, s1: 32.099, s2: 29.003, s3: 20.433 },
      2: { lapTime: 79.328, s1: 29.751, s2: 29.382, s3: 20.195 },
      3: { lapTime: 79.997, s1: 29.836, s2: 29.784, s3: 20.377 },
      4: { lapTime: 80.914, s1: 30.438, s2: 29.601, s3: 20.875 },
      5: { lapTime: 81.000, s1: 30.166, s2: 29.944, s3: 20.890 },
    };
    for (const lap of laps) {
      const want = expected[lap.lapNumber];
      if (!want) continue;
      expect(lap.lapTime).toBeCloseTo(want.lapTime, 2);
      if (lap.sectors) {
        expect(lap.sectors[0]).toBeCloseTo(want.s1, 2);
        expect(lap.sectors[1]).toBeCloseTo(want.s2, 2);
        expect(lap.sectors[2]).toBeCloseTo(want.s3, 2);
      }
    }
  }, { timeout: 180_000 });
});
