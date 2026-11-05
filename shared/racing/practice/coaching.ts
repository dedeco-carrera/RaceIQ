/** A measured comparison against one selected lap, never an optimal line. */
export interface PracticeCornerPlan {
  referenceLapId: number;
  comparisonLapIds: number[];
  trackLengthM: number;
  corner: {
    name: string;
    number?: number;
    startFrac: number;
    endFrac: number;
    referenceTimeS: number;
    recentMeanTimeS: number;
    meanLossS: number;
    referenceBrakeFrac: number | null;
    recentMeanBrakeDeltaM: number | null;
    referenceExitSpeedMps: number;
    recentMeanExitSpeedMps: number;
  };
}
