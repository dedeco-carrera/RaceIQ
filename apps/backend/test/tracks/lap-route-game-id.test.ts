import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@raceiq/backend-core/db/index";
import { laps, lapMetrics, sessions, sessionCaptureSplitJobs } from "@raceiq/backend-core/db/schema";
import { alignedTelemetryCacheGet, alignedTelemetryCacheSet, cacheDelete, cacheSet } from "@raceiq/backend-core/db/telemetry-replay-storage";
import { STATIC_LAP_ANALYSIS_VERSION } from "@raceiq/backend-core/lap-analysis/insights";
import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";
import { lapRoutes } from "../../src/routes/laps/index";
import { initGameAdapters } from "@raceiq/game-catalogs/games/init";
import { initServerGameAdapters } from "../../src/games/init";
initServerGameAdapters();

describe("GET /api/laps/:id game context", () => {
  const sessionIds: number[] = [];

  afterEach(async () => {
    for (const sessionId of sessionIds) {
      const lapRows = await db.select({ id: laps.id }).from(laps).where(eq(laps.sessionId, sessionId)).all();
      for (const lap of lapRows) cacheDelete(lap.id);
      await db.delete(laps).where(eq(laps.sessionId, sessionId)).run();
      await db.delete(sessionCaptureSplitJobs).where(eq(sessionCaptureSplitJobs.sessionId, sessionId)).run();
      await db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    }
    sessionIds.length = 0;
  });

  test("blocks cached aligned telemetry after capture becomes queued", async () => {
    const lapId = await insertLap();
    alignedTelemetryCacheSet([lapId], "{\"cached\":true}");
    expect(alignedTelemetryCacheGet([lapId])).toBe("{\"cached\":true}");
    await db.insert(sessionCaptureSplitJobs).values({
      sessionId: sessionIds.at(-1)!,
      jobId: `lap-route-${lapId}`,
      pendingSourceRevision: "test-source-revision",
      sourcePath: "lap-route-capture.bin",
      status: "queued",
    });

    const response = await lapRoutes.request("/api/laps/aligned-telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [lapId], step: 1 }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "RECORDING_PROCESSING", error: "Recording is queued or processing" });
  });

  async function insertLap(): Promise<number> {
    const session = await db
      .insert(sessions)
      .values({
        carId: "1",
        trackId: "1",
        gameId: "iracing",
        rawFile: null,
      })
      .returning({ id: sessions.id })
      .get();
    sessionIds.push(session!.id);
    const lap = await db
      .insert(laps)
      .values({
        sessionId: session!.id,
        lapNumber: 1,
        lapTime: 90,
        isValid: true,
      })
      .returning({ id: laps.id })
      .get();
    return lap!.id;
  }

  test("requires X-Game-Id", async () => {
    const lapId = await insertLap();

    const response = await lapRoutes.request(`/api/laps/${lapId}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Missing or invalid X-Game-Id header",
    });
  });

  test("practice insights respect game context and capture readiness", async () => {
    const lapId = await insertLap();
    expect((await lapRoutes.request(`/api/laps/${lapId}/practice-insights`)).status).toBe(400);
    expect((await lapRoutes.request(`/api/laps/${lapId}/practice-insights`, { headers: { "X-Game-Id": "acc" } })).status).toBe(404);
    await db.insert(sessionCaptureSplitJobs).values({ sessionId: sessionIds.at(-1)!, jobId: `practice-${lapId}`, pendingSourceRevision: "test", sourcePath: "capture.bin", status: "queued" });
    const response = await lapRoutes.request(`/api/laps/${lapId}/practice-insights`, { headers: { "X-Game-Id": "iracing" } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "RECORDING_PROCESSING" });
  });

  test("practice insights return evidence and lap position without full telemetry", async () => {
    const lapId = await insertLap();
    cacheSet(lapId, [{ DistanceTraveled: 100 }, { DistanceTraveled: 150 }, { DistanceTraveled: 200 }] as TelemetryPacket[]);
    await db.insert(lapMetrics).values({ lapId, insightVersion: STATIC_LAP_ANALYSIS_VERSION, segmentStats: "[]", insights: JSON.stringify([
      { id: "driving-example", category: "driving", severity: "info", label: "Observation", detail: "Evidence", frameIndices: [1] },
      { id: "tire-example", category: "tires", severity: "warning", label: "Tire", detail: "Evidence", frameIndices: [1] },
    ]) });
    const response = await lapRoutes.request(`/api/laps/${lapId}/practice-insights`, { headers: { "X-Game-Id": "iracing" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ insights: [{ id: "driving-example", severity: "info", label: "Observation", detail: "Evidence", progress: 0.5 }] });
  });

  test("practice references use game header and exact car and track scope", async () => {
    const own = await insertLap();
    await db.update(sessions).set({ rawFile: "capture.bin" }).where(eq(sessions.id, sessionIds.at(-1)!));
    await db.update(laps).set({ classification: "pace", rawByteOffset: 0, rawFrameCount: 60 }).where(eq(laps.id, own));
    const missingHeader = await lapRoutes.request("/api/practice/references?trackId=1&carId=1");
    expect(missingHeader.status).toBe(400);
    const response = await lapRoutes.request("/api/practice/references?trackId=1&carId=1", { headers: { "X-Game-Id": "iracing" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scope: "local", personalBest: { id: own }, fastest: { id: own }, nextStep: null, targetSeconds: 89.64 });
    const unmatched = await lapRoutes.request("/api/practice/references?trackId=other&carId=1", { headers: { "X-Game-Id": "iracing" } });
    expect(await unmatched.json()).toMatchObject({ personalBest: null, candidates: [] });
  });

  test("corner plans reject wrong game, repeated and unowned comparison laps", async () => {
    const url = "/api/practice/corner-plan?trackId=1&carId=1&sessionId=1&referenceId=1&lapIds=2,3";
    expect((await lapRoutes.request(url)).status).toBe(400);
    expect((await lapRoutes.request(url, { headers: { "X-Game-Id": "iracing" } })).status).toBe(400);
    const duplicate = "/api/practice/corner-plan?trackId=1&carId=1&sessionId=1&referenceId=1&lapIds=2,2";
    expect((await lapRoutes.request(duplicate, { headers: { "X-Game-Id": "f1-2025" } })).status).toBe(400);
    expect((await lapRoutes.request(url, { headers: { "X-Game-Id": "f1-2025" } })).status).toBe(404);
  });

  test("corner plan reports missing capture rather than trusting cached lap metadata", async () => {
    const session = await db.insert(sessions).values({ carId: "41", trackId: "19", gameId: "f1-2025", rawFile: "capture.bin" }).returning({ id: sessions.id }).get();
    sessionIds.push(session!.id);
    const ids: number[] = [];
    for (let index = 0; index < 3; index++) {
      const [row] = await db.insert(laps).values({ sessionId: session!.id, lapNumber: index + 1, lapTime: 80 + index, isValid: true, classification: "pace", rawByteOffset: index, rawFrameCount: 201 }).returning({ id: laps.id });
      ids.push(row!.id);
    }
    const response = await lapRoutes.request(`/api/practice/corner-plan?trackId=19&carId=41&sessionId=${session!.id}&referenceId=${ids[0]}&lapIds=${ids[1]},${ids[2]}`, { headers: { "X-Game-Id": "f1-2025" } });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Lap telemetry unavailable" });
  });

  test("rejects game context that does not own the lap", async () => {
    const lapId = await insertLap();

    const response = await lapRoutes.request(`/api/laps/${lapId}`, {
      headers: { "X-Game-Id": "acc" },
    });

    expect(response.status).toBe(404);
  });

  test("loads the lap in its requested game context", async () => {
    const lapId = await insertLap();

    const response = await lapRoutes.request(`/api/laps/${lapId}`, {
      headers: { "X-Game-Id": "iracing" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: lapId,
      gameId: "iracing",
    });
  });
});
