import { describe, expect, test } from "bun:test";
import { selectPracticeReferences } from "@raceiq/shared/racing/practice/reference";
import type { LapMeta } from "@raceiq/shared/racing/sessions/types";

function lap(id: number, time: number, extra: Partial<LapMeta> = {}): LapMeta {
  return { id, sessionId: 1, lapNumber: id, lapTime: time, isValid: true, classification: "pace", gameId: "f1-2025", trackId: "mexico", carId: "mercedes", createdAt: "2026-01-01", ownership: "mine", telemetryAvailable: true, processing: { state: "ready", stage: null, error: null }, ...extra };
}

describe("practice reference selection", () => {
  test("selects personal best, closest real step and fastest local candidate", () => {
    const result = selectPracticeReferences([lap(1, 90), lap(2, 89.70, { ownership: "others" }), lap(3, 89.62, { ownership: "others" }), lap(4, 85, { ownership: "others" })], "f1-2025", "mexico", "mercedes");
    expect(result.personalBest?.id).toBe(1);
    expect(result.targetSeconds).toBe(89.64);
    expect(result.nextStep?.id).toBe(3);
    expect(result.fastest?.id).toBe(4);
  });

  test("never fabricates a close reference and respects tolerance", () => {
    const laps = [lap(1, 90), lap(2, 89, { ownership: "others" })];
    expect(selectPracticeReferences(laps, "f1-2025", "mexico", "mercedes").nextStep).toBeNull();
    expect(selectPracticeReferences(laps, "f1-2025", "mexico", "mercedes", 1).nextStep?.id).toBe(2);
  });

  test("excludes invalid, incomplete, unmatched, unavailable and foreign personal bests", () => {
    const laps = [lap(1, 90), lap(2, 80, { isValid: false }), lap(3, 81, { classification: null }), lap(4, 82, { trackId: "other" }), lap(5, 83, { carId: "other" }), lap(6, 84, { telemetryAvailable: false }), lap(7, 85, { processing: { state: "processing", stage: "capture", error: null } }), lap(8, 89.64, { ownership: "others" })];
    const result = selectPracticeReferences(laps, "f1-2025", "mexico", "mercedes");
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([8, 1]);
    expect(result.personalBest?.id).toBe(1);
    expect(selectPracticeReferences([laps[7]!], "f1-2025", "mexico", "mercedes").nextStep).toBeNull();
  });

  test("chooses newest equal-time lap and recomputes when personal best changes", () => {
    const result = selectPracticeReferences([lap(1, 90), lap(2, 90), lap(3, 89.9)], "f1-2025", "mexico", "mercedes");
    expect(result.personalBest?.id).toBe(3);
    expect(result.targetSeconds).toBeCloseTo(89.5404);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([3, 2, 1]);
  });

  test("accepts published standalone captures but rejects explicitly empty ones", () => {
    const result = selectPracticeReferences([lap(1, 90, { telemetryAvailable: false, standaloneCaptureReady: true, rawFrameCount: 300 }), lap(2, 89, { rawFrameCount: 0 })], "f1-2025", "mexico", "mercedes");
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([1]);
  });
});
