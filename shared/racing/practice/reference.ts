import type { LapMeta } from "../sessions/types";

export type PracticeReferenceMode = "personal-best" | "next-step" | "fastest";

export interface PracticeReferenceCatalog {
  scope: "local";
  targetSeconds: number | null;
  tolerancePercent: number;
  personalBest: LapMeta | null;
  nextStep: LapMeta | null;
  fastest: LapMeta | null;
  candidates: LapMeta[];
}

/** Select only real, independently replayable laps for a strictly matched car and layout. */
export function selectPracticeReferences(laps: readonly LapMeta[], gameId: string, trackId: string, carId: string, tolerancePercent = 0.2): PracticeReferenceCatalog {
  const tolerance = Number.isFinite(tolerancePercent) ? Math.min(10, Math.max(0, tolerancePercent)) : 0.2;
  const candidates = laps.filter((lap) => lap.gameId === gameId && lap.trackId === trackId && lap.carId === carId && lap.isValid && lap.classification === "pace" && !lap.experimentExcluded && lap.processing.state === "ready" && (lap.telemetryAvailable === true || lap.standaloneCaptureReady === true) && (lap.rawFrameCount == null || lap.rawFrameCount > 0) && Number.isFinite(lap.lapTime) && lap.lapTime > 0)
    .sort((a, b) => a.lapTime - b.lapTime || b.id - a.id);
  const personalBest = candidates.find((lap) => lap.ownership === "mine") ?? null;
  const fastest = candidates[0] ?? null;
  const targetSeconds = personalBest ? personalBest.lapTime * 0.996 : null;
  const nextStep = personalBest && targetSeconds !== null
    ? candidates.filter((lap) => lap.lapTime < personalBest.lapTime && Math.abs(lap.lapTime - targetSeconds) <= personalBest.lapTime * tolerance / 100 + 1e-9)
      .sort((a, b) => Math.abs(a.lapTime - targetSeconds) - Math.abs(b.lapTime - targetSeconds) || a.lapTime - b.lapTime || b.id - a.id)[0] ?? null
    : null;
  return { scope: "local", targetSeconds, tolerancePercent: tolerance, personalBest, nextStep, fastest, candidates };
}
