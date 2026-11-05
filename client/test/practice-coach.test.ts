import { describe, expect, test } from "bun:test";
import type { LapMeta } from "@raceiq/shared/racing/sessions/types";
import type { LivePitData } from "@raceiq/shared/racing/live/types";
import { practiceAlerts, practiceSummary, selectPracticeFinding } from "../src/components/f1/practice-coach-data";

function lap(id: number, time: number, overrides: Partial<LapMeta> = {}): LapMeta {
  return { id, sessionId: 1, lapNumber: id, lapTime: time, isValid: true, classification: "pace", gameId: "f1-2025", carId: "car", trackId: "track", createdAt: "", processing: { state: "ready", stage: null, error: null }, sectorTimes: [30, 25, time - 55], ...overrides };
}

describe("practice coach", () => {
  test("compares eligible laps in the current session and reports recent spread", () => {
    const summary = practiceSummary([lap(1, 80), lap(2, 82, { isValid: false }), lap(3, 81), lap(4, 79, { classification: "in_lap" }), lap(5, 82), lap(6, 70, { sessionId: 2 }), lap(7, 70, { classification: null })], 1);
    expect(summary.latest?.id).toBe(5);
    expect(summary.reference?.id).toBe(1);
    expect(summary.largestSectorLoss).toEqual({ sector: 3, seconds: 2 });
    expect(summary.spread).toBe(2);
    expect(summary.sampleCount).toBe(3);
    expect(practiceSummary([lap(1, 80)], null).latest).toBeUndefined();
  });

  test("does not invent sector comparisons or spread from incomplete data", () => {
    const summary = practiceSummary([lap(1, 80), lap(2, 81, { sectorTimes: [0, 25, 26] })], 1);
    expect(summary.largestSectorLoss).toBeUndefined();
    expect(summary.spread).toBeNull();
  });

  test("alerts only for available low estimates", () => {
    const pit = { fuelLapsRemaining: 2.5, tireLapsToBad: null, estimateSource: "session" } as LivePitData;
    expect(practiceAlerts(pit)).toEqual({ fuel: 2.5, tires: null, source: "session" });
    expect(practiceAlerts({ ...pit, fuelLapsRemaining: NaN, tireLapsToBad: -1 })).toEqual({ fuel: null, tires: null, source: "session" });
    expect(practiceAlerts(null).fuel).toBeNull();
  });

  test("counts repeated observations once per lap and only reports current findings", () => {
    const finding = { id: "lift", severity: "warning" as const, label: "Lift", detail: "Observed", progress: 0.5 };
    expect(selectPracticeFinding([finding], [[finding, finding], [finding], []])).toEqual({ finding, repeated: 2 });
    expect(selectPracticeFinding([], [[finding], [finding]])).toEqual({ finding: undefined, repeated: undefined });
  });
});
