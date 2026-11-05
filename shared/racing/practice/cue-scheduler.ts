import type { PracticeCornerPlan } from "@raceiq/shared/racing/practice/coaching";

export interface PracticeCueFrame {
  streamId: string;
  sessionId: number;
  sequence: number;
  lapNumber: number;
  fraction: number;
  speedMps: number;
  brake: number;
  observedAtMs: number;
  receivedAtMs: number;
}

export type PracticeCue =
  | { type: "prepare"; plan: PracticeCornerPlan }
  | { type: "beep"; index: 1 | 2 | 3 }
  | { type: "feedback"; plan: PracticeCornerPlan; seconds: number; differenceS: number };

/** One focus corner per lap. A plan is pinned at the lap boundary and never swapped mid-corner. */
export class PracticeCueScheduler {
  private previous: PracticeCueFrame | null = null;
  private plan: PracticeCornerPlan | null = null;
  private blocked = true;
  private prepared = false;
  private braked = false;
  private entryMs: number | null = null;
  private completed = false;
  private readonly emitted = new Set<number>();

  get isBlocked(): boolean { return this.blocked; }

  reset(): void {
    this.previous = null;
    this.plan = null;
    this.blocked = true;
    this.prepared = false;
    this.braked = false;
    this.entryMs = null;
    this.completed = false;
    this.emitted.clear();
  }

  step(frame: PracticeCueFrame, candidate: PracticeCornerPlan | null, nowMs: number, outputLatencyMs: number): PracticeCue[] {
    const valid = [frame.sequence, frame.sessionId, frame.lapNumber, frame.fraction, frame.speedMps, frame.brake, frame.observedAtMs, frame.receivedAtMs, nowMs, outputLatencyMs].every(Number.isFinite)
      && frame.sessionId > 0 && frame.lapNumber > 0 && frame.fraction >= 0 && frame.fraction <= 1 && frame.speedMps >= 0 && frame.brake >= 0 && frame.brake <= 255
      && nowMs >= frame.receivedAtMs && nowMs - frame.receivedAtMs <= 250;
    if (!valid) { this.blocked = true; this.previous = null; return []; }
    const previous = this.previous;
    if (!previous || previous.streamId !== frame.streamId || previous.sessionId !== frame.sessionId) {
      this.reset();
      this.previous = frame;
      return [];
    }
    if (frame.sequence === previous.sequence) return [];
    if (frame.lapNumber !== previous.lapNumber) {
      const corner = candidate?.corner;
      const usable = candidate && corner && Number.isFinite(candidate.trackLengthM) && candidate.trackLengthM > 100 && Number.isFinite(corner.startFrac) && Number.isFinite(corner.endFrac) && corner.startFrac >= 0 && corner.startFrac < corner.endFrac && corner.endFrac <= 1 && Number.isFinite(corner.recentMeanTimeS) && corner.recentMeanTimeS > 0 && (corner.referenceBrakeFrac === null || Number.isFinite(corner.referenceBrakeFrac) && corner.referenceBrakeFrac >= 0 && corner.referenceBrakeFrac <= corner.endFrac);
      const boundaryGap = frame.observedAtMs - previous.observedAtMs;
      const continuousBoundary = frame.lapNumber === previous.lapNumber + 1 && previous.fraction >= 0.9 && frame.fraction < 0.1 && frame.sequence > previous.sequence && boundaryGap > 0 && boundaryGap <= 250;
      this.plan = continuousBoundary && usable ? candidate : null;
      this.blocked = !this.plan;
      this.prepared = false;
      this.braked = false;
      this.entryMs = null;
      this.completed = false;
      this.emitted.clear();
      this.previous = frame;
      return [];
    }
    const dt = frame.observedAtMs - previous.observedAtMs;
    const progress = frame.fraction - previous.fraction;
    // Multiple F1 packet types can report the same simulator timestamp.
    // Keep the last timed sample so interpolation still uses a positive span.
    if (dt === 0 && frame.sequence > previous.sequence && frame.receivedAtMs - previous.receivedAtMs <= 250 && progress >= -0.001 && progress <= 0.03) return [];
    if (frame.sequence < previous.sequence || dt <= 0 || dt > 250 || progress < -0.001 || progress > 0.03) {
      this.blocked = true;
      this.previous = frame;
      return [];
    }
    this.previous = frame;
    const plan = this.plan;
    if (this.blocked || !plan || frame.speedMps < 3) return [];
    const events: PracticeCue[] = [];
    const point = plan.corner.referenceBrakeFrac ?? plan.corner.startFrac;
    const timeTo = (sample: PracticeCueFrame) => (point - sample.fraction) * plan.trackLengthM / sample.speedMps - Math.max(0, Math.min(300, outputLatencyMs)) / 1000;
    const before = previous.speedMps >= 3 ? timeTo(previous) : Infinity;
    const current = timeTo(frame);
    if (!this.prepared && before > 6 && current <= 6 && current > 3) {
      this.prepared = true;
      events.push({ type: "prepare", plan });
    }
    if (this.prepared && frame.brake > 255 * 0.05) this.braked = true;
    if (this.prepared && !this.braked && plan.corner.referenceBrakeFrac !== null) {
      const thresholds = [1, 0.5, 0] as const;
      for (let index = 0; index < thresholds.length; index++) {
        const threshold = thresholds[index]!;
        if (!this.emitted.has(index) && before > threshold && current <= threshold && current >= threshold - 0.15) {
          this.emitted.add(index);
          events.push({ type: "beep", index: (index + 1) as 1 | 2 | 3 });
        }
      }
    }
    const crossTime = (boundary: number) => previous.observedAtMs + (frame.observedAtMs - previous.observedAtMs) * (boundary - previous.fraction) / progress;
    if (progress > 0 && previous.fraction < plan.corner.startFrac && frame.fraction >= plan.corner.startFrac) this.entryMs = crossTime(plan.corner.startFrac);
    if (!this.completed && this.entryMs !== null && progress > 0 && previous.fraction < plan.corner.endFrac && frame.fraction >= plan.corner.endFrac) {
      const seconds = (crossTime(plan.corner.endFrac) - this.entryMs) / 1000;
      if (seconds > 0 && Number.isFinite(seconds)) events.push({ type: "feedback", plan, seconds, differenceS: seconds - plan.corner.recentMeanTimeS });
      this.completed = true;
    }
    return events;
  }
}
