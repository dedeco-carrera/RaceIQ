import { useQueries } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { LapMeta } from "@raceiq/shared/racing/sessions/types";
import type { LivePitData } from "@raceiq/shared/racing/live/types";
import { client } from "@/lib/rpc";
import { m } from "@/paraglide/messages";
import { practiceAlerts, practiceSummary, selectPracticeFinding, type PracticeFinding } from "./practice-coach-data";
import { PracticeReferences } from "./PracticeReferences";
import { PracticeLiveCoaching } from "./PracticeLiveCoaching";
import type { LiveTelemetryView } from "@/lib/live-telemetry-view";

export function PracticeCoach({ laps, sessionId, pit, trackId, carId, view }: { laps: LapMeta[]; sessionId: number | null; pit: LivePitData | null; trackId?: string; carId?: string; view: LiveTelemetryView }) {
  const [reference, setReference] = useState<LapMeta | null>(null);
  const onReference = useCallback((lap: LapMeta | null) => setReference(lap), []);
  const summary = practiceSummary(laps, sessionId);
  const candidates = summary.eligible.slice(-3);
  const results = useQueries({ queries: candidates.map((lap) => ({
    queryKey: ["practice-insights", sessionId, lap.id],
    enabled: lap.processing?.state === "ready",
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const response = await client.api.laps[":id"]["practice-insights"].$get({ param: { id: String(lap.id) } }, { headers: { "X-Game-Id": "f1-2025" } });
      if (!response.ok) throw new Error("Practice insights unavailable");
      return response.json() as Promise<{ insights: PracticeFinding[] }>;
    },
  })) });
  const latest = results.at(-1);
  const { finding: observation, repeated } = selectPracticeFinding(latest?.data?.insights ?? [], results.map((result) => result.data?.insights ?? []));
  const alerts = practiceAlerts(pit);
  return (
    <section aria-label={m.practice_coach_title()} data-reference-lap-id={reference?.id} className="border-b border-app-border p-3 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-app-text-muted">{m.practice_coach_title()}</h2>
      {alerts.fuel !== null && <p className="mt-2 text-status-warning">{m.practice_coach_fuel({ laps: alerts.fuel.toFixed(1) })}</p>}
      {alerts.tires !== null && <p className="mt-2 text-status-warning">{m.practice_coach_tires({ laps: alerts.tires.toFixed(1) })}</p>}
      {(alerts.fuel !== null || alerts.tires !== null) && <p className="text-xs text-app-text-muted">{alerts.source === "history" ? m.practice_coach_history() : alerts.source === "session" ? m.practice_coach_session() : m.practice_coach_estimate()}</p>}
      {!summary.latest ? <p className="mt-2 text-app-text-muted">{m.practice_coach_waiting()}</p> : <div className="mt-2 flex flex-col gap-1">
        <p>{m.practice_coach_lap({ lap: summary.latest.lapNumber })}</p>
        {summary.largestSectorLoss && <p>{m.practice_coach_sector({ sector: summary.largestSectorLoss.sector, seconds: summary.largestSectorLoss.seconds.toFixed(3) })}</p>}
        {summary.spread !== null && <p>{m.practice_coach_spread({ count: summary.sampleCount, seconds: summary.spread.toFixed(3) })}</p>}
        {observation ? <p><span className="text-app-text-muted">{m.leaderboard_unverified()} · </span><span className="font-semibold">{observation.label}:</span> {observation.detail}{observation.progress !== null && ` · ${m.practice_coach_position({ percent: Math.round(observation.progress * 100) })}`}{repeated && ` · ${m.practice_coach_repeated({ count: repeated })}`}</p> : latest?.isError || summary.latest.processing?.state === "failed" ? <p className="text-app-text-muted">{m.practice_coach_unavailable()}</p> : latest?.isFetching || summary.latest.processing?.state !== "ready" ? <p className="text-app-text-muted">{m.practice_coach_processing()}</p> : <p className="text-app-text-muted">{m.practice_coach_no_findings()}</p>}
      </div>}
      {trackId && carId && <PracticeReferences key={`${trackId}:${carId}`} trackId={trackId} carId={carId} onReference={onReference} />}
      <PracticeLiveCoaching reference={reference} laps={summary.eligible} view={view} />
    </section>
  );
}
