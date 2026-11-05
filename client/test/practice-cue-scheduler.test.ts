import { describe, expect, test } from "bun:test";
import type { PracticeCornerPlan } from "@raceiq/shared/racing/practice/coaching";
import { PracticeCueScheduler, type PracticeCue, type PracticeCueFrame } from "@raceiq/shared/racing/practice/cue-scheduler";

const plan: PracticeCornerPlan = { referenceLapId: 1, comparisonLapIds: [2, 3], trackLengthM: 1000, corner: { name: "Turn 4", number: 4, startFrac: 0.4, endFrac: 0.55, referenceTimeS: 2.9, recentMeanTimeS: 3.2, meanLossS: 0.3, referenceBrakeFrac: 0.35, recentMeanBrakeDeltaM: -10, referenceExitSpeedMps: 50, recentMeanExitSpeedMps: 48 } };
function frame(sequence: number, lapNumber: number, fraction: number, extra: Partial<PracticeCueFrame> = {}): PracticeCueFrame {
  return { streamId: "stream", sessionId: 1, sequence, lapNumber, fraction, speedMps: 50, brake: 0, observedAtMs: sequence * 100, receivedAtMs: sequence * 100, ...extra };
}

describe("practice cue scheduling", () => {
  test("pins one corner at the lap boundary and emits preparation, three beeps and measured feedback", () => {
    const scheduler = new PracticeCueScheduler();
    scheduler.step(frame(1, 1, 0.99), plan, 100, 0);
    scheduler.step(frame(2, 2, 0), plan, 200, 0);
    const events: PracticeCue[] = [];
    for (let index = 1; index <= 120; index++) {
      const next = frame(index + 2, 2, index * 0.005);
      events.push(...scheduler.step(next, null, next.receivedAtMs, 0));
    }
    expect(events.filter((event) => event.type === "prepare")).toHaveLength(1);
    expect(events.filter((event) => event.type === "beep").map((event) => event.index)).toEqual([1, 2, 3]);
    const feedback = events.find((event) => event.type === "feedback");
    expect(feedback?.type).toBe("feedback");
    if (feedback?.type === "feedback") expect(feedback.differenceS).toBeCloseTo(-0.2, 3);
  });

  test("suppresses cues after a gap or stale telemetry until next lap", () => {
    const scheduler = new PracticeCueScheduler();
    scheduler.step(frame(1, 1, 0.99), plan, 100, 0);
    scheduler.step(frame(2, 2, 0), plan, 200, 0);
    const late = frame(3, 2, 0.01);
    expect(scheduler.step(late, plan, late.receivedAtMs + 500, 0)).toEqual([]);
    const after = frame(4, 2, 0.015);
    expect(scheduler.step(after, plan, after.receivedAtMs, 0)).toEqual([]);
    expect(scheduler.step(frame(5, 2, 0.02), plan, 500, 0)).toEqual([]);
  });

  test("never counts down without a recorded brake point", () => {
    const scheduler = new PracticeCueScheduler();
    const noBrake = { ...plan, corner: { ...plan.corner, referenceBrakeFrac: null } };
    scheduler.step(frame(1, 1, 0.99), noBrake, 100, 0);
    scheduler.step(frame(2, 2, 0), noBrake, 200, 0);
    const events: PracticeCue[] = [];
    for (let index = 1; index <= 120; index++) {
      const next = frame(index + 2, 2, index * 0.005);
      events.push(...scheduler.step(next, noBrake, next.receivedAtMs, 0));
    }
    expect(events.some((event) => event.type === "beep")).toBe(false);
  });

  test("duplicate renders do not cancel cues, but a telemetry jump blocks them", () => {
    const scheduler = new PracticeCueScheduler();
    scheduler.step(frame(1, 1, 0.99), plan, 100, 0);
    const start = frame(2, 2, 0);
    scheduler.step(start, plan, 200, 0);
    expect(scheduler.step(start, plan, 200, 0)).toEqual([]);
    const events: PracticeCue[] = [];
    for (let index = 1; index <= 30; index++) {
      const next = frame(index + 2, 2, index * 0.005);
      events.push(...scheduler.step(next, plan, next.receivedAtMs, 0));
    }
    expect(events.some((event) => event.type === "prepare")).toBe(true);
    const jump = frame(33, 2, 0.8);
    expect(scheduler.step(jump, plan, jump.receivedAtMs, 0)).toEqual([]);
    expect(scheduler.step(frame(34, 2, 0.805), plan, 3400, 0)).toEqual([]);
  });

  test("accepts a fresh F1 frame sharing the prior simulator timestamp", () => {
    const scheduler = new PracticeCueScheduler();
    scheduler.step(frame(1, 1, 0.99), plan, 100, 0);
    scheduler.step(frame(2, 2, 0), plan, 200, 0);
    const repeatedTime = frame(3, 2, 0.001, { observedAtMs: 200 });
    expect(scheduler.step(repeatedTime, plan, 300, 0)).toEqual([]);
    expect(scheduler.isBlocked).toBe(false);
    const events: PracticeCue[] = [];
    for (let index = 1; index <= 30; index++) {
      const next = frame(index + 3, 2, index * 0.005);
      events.push(...scheduler.step(next, plan, next.receivedAtMs, 0));
    }
    expect(events.some((event) => event.type === "prepare")).toBe(true);
  });

  test("does not arm on a teleport or a discontinuous lap transition", () => {
    const scheduler = new PracticeCueScheduler();
    scheduler.step(frame(1, 1, 0.4), plan, 100, 0);
    scheduler.step(frame(2, 2, 0), plan, 200, 0);
    const events: PracticeCue[] = [];
    for (let index = 1; index <= 120; index++) {
      const next = frame(index + 2, 2, index * 0.005);
      events.push(...scheduler.step(next, plan, next.receivedAtMs, 0));
    }
    expect(events).toEqual([]);
  });
});
