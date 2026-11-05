import { describe, expect, test } from "bun:test";
import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";
import type { NamedSegment } from "@raceiq/shared/racing/tracks/named-segments";
import { buildPracticeCornerPlan } from "@raceiq/backend-core/practice-coach/corner-analysis";

const segments: NamedSegment[] = [{ type: "corner", name: "Turn 4", number: 4, startFrac: 0.4, endFrac: 0.55 }];

function lap(id: number, lossSeconds: number, options: { gap?: boolean; partial?: boolean; braking?: boolean; format?: 2025 | 2026; unreportedFormat?: boolean } = {}) {
  const packets = Array.from({ length: 201 }, (_, index) => {
    const distance = index * 5;
    const loss = lossSeconds * Math.max(0, Math.min(1, (distance - 400) / 150));
    return { gameId: "f1-2025", TimestampMS: (index * 0.1 + loss + (options.gap && index >= 100 ? 1 : 0)) * 1000, DistanceTraveled: distance, Speed: 50, Brake: options.braking !== false && distance >= 350 && distance < 450 ? 128 : 0, f1: { trackLength: 1000, ...(options.unreportedFormat ? {} : { packetFormat: options.format ?? 2025 }) } } as TelemetryPacket;
  });
  return { id, packets: options.partial ? packets.slice(10) : packets };
}

describe("practice corner evidence", () => {
  test("ranks a repeatable measured loss and locates the reference braking transition", () => {
    const plan = buildPracticeCornerPlan(lap(1, 0), [lap(2, 0.3), lap(3, 0.5)], segments);
    expect(plan?.corner.name).toBe("Turn 4");
    expect(plan?.corner.meanLossS).toBeCloseTo(0.4, 5);
    expect(plan?.corner.referenceBrakeFrac).toBeCloseTo(0.35, 5);
    expect(plan?.comparisonLapIds).toEqual([2, 3]);
  });

  test("does not recommend from one lap, partial capture or timing gaps", () => {
    expect(buildPracticeCornerPlan(lap(1, 0), [lap(2, 0.3)], segments)).toBeNull();
    expect(buildPracticeCornerPlan(lap(1, 0, { partial: true }), [lap(2, 0.3), lap(3, 0.3)], segments)).toBeNull();
    expect(buildPracticeCornerPlan(lap(1, 0), [lap(2, 0.3), lap(3, 0.3, { gap: true })], segments)).toBeNull();
    expect(buildPracticeCornerPlan(lap(1, 0), [lap(2, 0.3), lap(3, 0.3, { format: 2026 })], segments)).toBeNull();
  });

  test("does not invent a braking point or promote non-repeated losses", () => {
    const plan = buildPracticeCornerPlan(lap(1, 0, { braking: false }), [lap(2, 0.3), lap(3, 0.4)], segments);
    expect(plan?.corner.referenceBrakeFrac).toBeNull();
    expect(buildPracticeCornerPlan(lap(1, 0), [lap(2, 0.3), lap(3, 0)], segments)).toBeNull();
  });

  test("unknown wire versions compare only laps from the same session", () => {
    const reference = { ...lap(1, 0, { unreportedFormat: true }), sessionId: 7 };
    const recent = [{ ...lap(2, 0.3, { unreportedFormat: true }), sessionId: 7 }, { ...lap(3, 0.4, { unreportedFormat: true }), sessionId: 7 }];
    expect(buildPracticeCornerPlan(reference, recent, segments)).not.toBeNull();
    expect(buildPracticeCornerPlan(reference, recent.map((entry) => ({ ...entry, sessionId: 8 })), segments)).toBeNull();
  });
});
