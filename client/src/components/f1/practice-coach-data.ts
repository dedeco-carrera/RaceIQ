import type { LapMeta } from "@raceiq/shared/racing/sessions/types";
import type { LivePitData } from "@raceiq/shared/racing/live/types";

export type PracticeFinding = { id: string; severity: "info" | "warning" | "critical"; label: string; detail: string; progress: number | null };

export function selectPracticeFinding(latest: readonly PracticeFinding[], recent: readonly (readonly PracticeFinding[])[]) {
  const counts = new Map<string, number>();
  for (const findings of recent) for (const id of new Set(findings.map((item) => item.id))) counts.set(id, (counts.get(id) ?? 0) + 1);
  const rank = { critical: 2, warning: 1, info: 0 };
  const finding = [...latest].sort((a, b) => rank[b.severity] - rank[a.severity] || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
  const count = finding ? counts.get(finding.id) ?? 0 : 0;
  return { finding, repeated: count >= 2 ? count : undefined };
}

export function practiceSummary(laps: readonly LapMeta[], sessionId: number | null) {
  const eligible = laps.filter((lap) => lap.sessionId === sessionId && lap.gameId === "f1-2025" && lap.isValid && lap.classification === "pace" && !lap.experimentExcluded && Number.isFinite(lap.lapTime) && lap.lapTime > 0).sort((a, b) => a.id - b.id);
  const latest = eligible.at(-1);
  const reference = latest ? eligible.filter((lap) => lap.id !== latest.id).sort((a, b) => a.lapTime - b.lapTime)[0] : undefined;
  const currentSectors = latest?.sectorTimes;
  const referenceSectors = reference?.sectorTimes;
  const comparable = currentSectors && referenceSectors && currentSectors.length > 0 && currentSectors.length === referenceSectors.length && [...currentSectors, ...referenceSectors].every((value) => Number.isFinite(value) && value > 0);
  const differences = comparable ? currentSectors.map((value, index) => ({ sector: index + 1, seconds: value - referenceSectors[index]! })).filter((item) => item.seconds > 0).sort((a, b) => b.seconds - a.seconds) : [];
  const recent = eligible.slice(-5);
  const times = recent.map((lap) => lap.lapTime);
  return { eligible, latest, reference, largestSectorLoss: differences[0], spread: times.length >= 3 ? Math.max(...times) - Math.min(...times) : null, sampleCount: times.length };
}

export function practiceAlerts(pit: LivePitData | null) {
  const low = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value >= 0 && value < 3;
  return { fuel: low(pit?.fuelLapsRemaining) ? pit.fuelLapsRemaining : null, tires: low(pit?.tireLapsToBad) ? pit.tireLapsToBad : null, source: pit?.estimateSource ?? null };
}
