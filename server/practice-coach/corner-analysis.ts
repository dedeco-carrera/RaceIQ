import type { PracticeCornerPlan } from "@raceiq/shared/racing/practice/coaching";
import type { NamedSegment } from "@raceiq/shared/racing/tracks/named-segments";
import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";
import { processLap } from "@raceiq/analysis-core/racing/analysis/laps/insights/process";

type Sample = { distance: number; seconds: number; speed: number; brake: number };
type PreparedLap = { id: number; length: number; format: 2025 | 2026 | null; samples: Sample[] };
type Reading = { seconds: number; speed: number };

/** Reject partial laps and discontinuities rather than inventing missing reference data. */
export function preparePracticeLap(id: number, raw: readonly TelemetryPacket[]): PreparedLap | null {
  const packets = processLap([...raw], "f1-2025").packets;
  const length = packets.find((p) => Number.isFinite(p.f1?.trackLength) && p.f1!.trackLength! > 100)?.f1?.trackLength;
  const format = packets.find((packet) => packet.f1?.packetFormat === 2025 || packet.f1?.packetFormat === 2026)?.f1?.packetFormat;
  if (!length || !Number.isFinite(length) || packets.length < 2) return null;
  const samples: Sample[] = [];
  for (const packet of packets) {
    const distance = packet.DistanceTraveled;
    const seconds = packet.TimestampMS / 1000;
    const speed = packet.Speed;
    const brake = packet.Brake / 255;
    if (packet.f1?.packetFormat !== undefined && packet.f1.packetFormat !== format) return null;
    if (packet.f1?.trackLength !== undefined && (!Number.isFinite(packet.f1.trackLength) || Math.abs(packet.f1.trackLength - length) > length * 0.01)) return null;
    if (![distance, seconds, speed, brake].every(Number.isFinite) || speed < 0 || brake < 0 || brake > 1) return null;
    if (distance < 0 || distance > length) continue;
    const previous = samples.at(-1);
    if (previous) {
      const dt = seconds - previous.seconds;
      const dd = distance - previous.distance;
      if (dt <= 0 || dt > 0.5 || dd < -1 || dd > Math.max(40, Math.max(speed, previous.speed) * dt * 3)) return null;
      if (dd <= 0) continue;
    }
    samples.push({ distance, seconds, speed, brake });
  }
  if (samples.length < 2 || samples[0]!.distance > length * 0.03 || samples.at(-1)!.distance < length * 0.97) return null;
  return { id, length, format: format ?? null, samples };
}

function atDistance(lap: PreparedLap, distance: number): Reading | null {
  const points = lap.samples;
  let lo = 0;
  let hi = points.length - 1;
  if (distance < points[0]!.distance || distance > points[hi]!.distance) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (points[mid]!.distance < distance) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const fraction = (distance - a.distance) / (b.distance - a.distance);
  return { seconds: a.seconds + (b.seconds - a.seconds) * fraction, speed: a.speed + (b.speed - a.speed) * fraction };
}

function measure(lap: PreparedLap, corner: NamedSegment, previousCornerEnd: number) {
  const start = lap.length * corner.startFrac;
  const end = lap.length * corner.endFrac;
  const entry = atDistance(lap, start);
  const exit = atDistance(lap, end);
  if (!entry || !exit || exit.seconds <= entry.seconds) return null;
  const approach = Math.max(0, start - 180, previousCornerEnd * lap.length);
  let brakeDistance: number | null = null;
  for (let index = 1; index < lap.samples.length; index++) {
    const previous = lap.samples[index - 1]!;
    const current = lap.samples[index]!;
    if (current.distance < approach) continue;
    if (current.distance > end) break;
    if (previous.brake <= 0.05 && current.brake >= 0.1) { brakeDistance = current.distance; break; }
  }
  return { seconds: exit.seconds - entry.seconds, exitSpeed: exit.speed, brakeDistance };
}

/** Pick a repeated measured loss. No claim that the reference inputs caused it. */
export function buildPracticeCornerPlan(reference: { id: number; sessionId?: number; packets: readonly TelemetryPacket[]; decodedFormat?: 2025 | 2026 }, recent: readonly { id: number; sessionId?: number; packets: readonly TelemetryPacket[]; decodedFormat?: 2025 | 2026 }[], segments: readonly NamedSegment[]): PracticeCornerPlan | null {
  const baseline = preparePracticeLap(reference.id, reference.packets);
  if (!baseline) return null;
  const seen = new Set([reference.id]);
  const comparisons = recent.filter((lap) => {
    if (seen.has(lap.id)) return false;
    seen.add(lap.id);
    return true;
  }).map((lap) => ({ sessionId: lap.sessionId, decodedFormat: lap.decodedFormat, prepared: preparePracticeLap(lap.id, lap.packets) }))
    .filter(({ sessionId, decodedFormat, prepared }) => prepared !== null && Math.abs(prepared.length - baseline.length) <= baseline.length * 0.01 && ((decodedFormat ?? prepared.format) !== null && (reference.decodedFormat ?? baseline.format) !== null ? (decodedFormat ?? prepared.format) === (reference.decodedFormat ?? baseline.format) : reference.sessionId !== undefined && sessionId === reference.sessionId))
    .map(({ prepared }) => prepared!);
  if (comparisons.length < 2) return null;
  const plans: PracticeCornerPlan[] = [];
  for (const segment of segments) {
    if (segment.type !== "corner" || !Number.isFinite(segment.startFrac) || !Number.isFinite(segment.endFrac) || segment.startFrac < 0 || segment.endFrac > 1 || segment.startFrac >= segment.endFrac) continue;
    const previousCornerEnd = segments.reduce((end, previous) => previous.type === "corner" && previous.endFrac <= segment.startFrac ? Math.max(end, previous.endFrac) : end, 0);
    const referenceReading = measure(baseline, segment, previousCornerEnd);
    const readings = comparisons.map((lap) => measure(lap, segment, previousCornerEnd));
    if (!referenceReading || readings.some((reading) => !reading)) continue;
    const valid = readings.filter((reading): reading is NonNullable<typeof reading> => reading !== null);
    const losses = valid.map((reading) => reading.seconds - referenceReading.seconds);
    if (losses.filter((loss) => loss >= 0.1).length < 2) continue;
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const braking = valid.map((reading) => reading.brakeDistance).filter((value): value is number => value !== null);
    plans.push({
      referenceLapId: baseline.id,
      comparisonLapIds: comparisons.map((lap) => lap.id),
      trackLengthM: baseline.length,
      corner: {
        name: segment.name,
        ...(segment.number === undefined ? {} : { number: segment.number }),
        startFrac: segment.startFrac,
        endFrac: segment.endFrac,
        referenceTimeS: referenceReading.seconds,
        recentMeanTimeS: mean(valid.map((reading) => reading.seconds)),
        meanLossS: mean(losses),
        referenceBrakeFrac: referenceReading.brakeDistance === null ? null : referenceReading.brakeDistance / baseline.length,
        recentMeanBrakeDeltaM: referenceReading.brakeDistance === null || braking.length < 2 ? null : mean(braking) - referenceReading.brakeDistance,
        referenceExitSpeedMps: referenceReading.exitSpeed,
        recentMeanExitSpeedMps: mean(valid.map((reading) => reading.exitSpeed)),
      },
    });
  }
  return plans.sort((a, b) => b.corner.meanLossS - a.corner.meanLossS || a.corner.startFrac - b.corner.startFrac)[0] ?? null;
}
