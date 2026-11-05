import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { LapMeta } from "@raceiq/shared/racing/sessions/types";
import type { PracticeCornerPlan } from "@raceiq/shared/racing/practice/coaching";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LiveTelemetryView } from "@/lib/live-telemetry-view";
import { client } from "@/lib/rpc";
import { getSoundVolume } from "@/lib/settings-storage";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import { PracticeCueScheduler, type PracticeCue } from "@raceiq/shared/racing/practice/cue-scheduler";

function cueMessage(cue: Exclude<PracticeCue, { type: "beep" }>): string {
  const corner = cue.plan.corner.name;
  if (cue.type === "feedback") {
    const seconds = Math.abs(cue.differenceS).toFixed(2);
    return cue.differenceS < -0.05 ? m.practice_cue_faster({ corner, seconds }) : cue.differenceS > 0.05 ? m.practice_cue_slower({ corner, seconds }) : m.practice_cue_same({ corner });
  }
  const braking = cue.plan.corner.recentMeanBrakeDeltaM;
  if (braking !== null && braking < -5) return m.practice_cue_brake_later({ corner, meters: Math.round(-braking) });
  if (braking !== null && braking > 5) return m.practice_cue_brake_earlier({ corner, meters: Math.round(braking) });
  return m.practice_cue_prepare({ corner });
}

function beep(context: AudioContext, index: 1 | 2 | 3) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.frequency.value = index === 3 ? 1200 : 850;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, getSoundVolume()), now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.085);
}

export function PracticeLiveCoaching({ reference, laps, view }: { reference: LapMeta | null; laps: LapMeta[]; view: LiveTelemetryView }) {
  const scheduler = useRef(new PracticeCueScheduler());
  const audio = useRef<AudioContext | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [latency, setLatency] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const delay = Number(latency);
  const validLatency = latency.trim() !== "" && Number.isFinite(delay) && delay >= 0 && delay <= 300;
  const recent = laps.filter((lap) => lap.sessionId === view.sessionId && lap.id !== reference?.id && lap.processing.state === "ready" && lap.ownership !== "others").slice(-3);
  const lapIds = recent.map((lap) => lap.id).join(",");
  const trackId = view.identity.trackId ?? "";
  const carId = view.identity.carId ?? "";
  const planQuery = useQuery({
    queryKey: ["practice-corner-plan", view.sessionId, trackId, carId, reference?.id, lapIds],
    enabled: !!reference && view.sessionId !== null && recent.length >= 2 && !!trackId && !!carId,
    staleTime: Infinity,
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      const response = await client.api.practice["corner-plan"].$get({ query: { trackId, carId, sessionId: String(view.sessionId), referenceId: String(reference!.id), lapIds } }, { headers: { "X-Game-Id": "f1-2025" } });
      if (!response.ok) throw new Error("Corner coaching unavailable");
      return response.json() as Promise<{ plan: PracticeCornerPlan | null }>;
    },
  });
  const plan = planQuery.data?.plan ?? null;

  useEffect(() => { scheduler.current.reset(); window.speechSynthesis?.cancel(); setMessage(null); }, [view.streamId, view.sessionId, trackId, carId]);
  useEffect(() => () => { scheduler.current.reset(); window.speechSynthesis?.cancel(); void audio.current?.close(); }, []);
  useEffect(() => {
    const ready = (id: string) => view.statusBySemanticId[id]?.resolution === "ok" && view.statusBySemanticId[id]?.freshness === "fresh";
    if (view.sessionId === null || view.timing.lapNumber === undefined || view.timing.lapFraction === undefined || view.motion.speedMps === undefined || view.inputs.brake === undefined || Date.now() - view.receivedAtMs > 250 || !ready("timing.lap-fraction") || !ready("motion.speed") || !ready("inputs.brake")) {
      scheduler.current.reset();
      window.speechSynthesis?.cancel();
      return;
    }
    const events = scheduler.current.step({ streamId: view.streamId, sessionId: view.sessionId, sequence: view.sequence, lapNumber: view.timing.lapNumber, fraction: view.timing.lapFraction, speedMps: view.motion.speedMps, brake: view.inputs.brake, observedAtMs: view.observedAtMs, receivedAtMs: view.receivedAtMs }, plan, Date.now(), validLatency ? delay : 0);
    if (scheduler.current.isBlocked) window.speechSynthesis?.cancel();
    for (const event of events) {
      if (event.type === "beep") {
        if (audioEnabled && validLatency && audio.current?.state === "running") {
          if (event.index === 1) window.speechSynthesis?.cancel();
          beep(audio.current, event.index);
        }
      } else {
        const next = cueMessage(event);
        setMessage(next);
        if (audioEnabled && window.speechSynthesis && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          const utterance = new SpeechSynthesisUtterance(next);
          utterance.lang = getLocale();
          window.speechSynthesis.speak(utterance);
        }
      }
    }
    const staleTimer = window.setTimeout(() => { scheduler.current.reset(); window.speechSynthesis?.cancel(); }, 300);
    return () => window.clearTimeout(staleTimer);
  }, [view, plan, audioEnabled, delay, validLatency]);

  const toggleAudio = async () => {
    scheduler.current.reset();
    setMessage(null);
    if (audioEnabled) {
      window.speechSynthesis?.cancel();
      await audio.current?.close();
      audio.current = null;
      setAudioEnabled(false);
      return;
    }
    try {
      const context = new AudioContext();
      await context.resume();
      if (context.state !== "running") throw new Error("Audio unavailable");
      audio.current = context;
      setAudioError(false);
      setAudioEnabled(true);
    } catch { setAudioError(true); }
  };
  return <div className="mt-3 flex flex-col gap-2 border-t border-app-border pt-3">
    <h3 className="text-xs font-semibold text-app-text-muted">{m.practice_cue_title()}</h3>
    {plan ? <p className="text-xs text-app-text-muted">{m.practice_cue_opportunity({ corner: plan.corner.name, seconds: plan.corner.meanLossS.toFixed(2), count: plan.comparisonLapIds.length })}</p> : <p className="text-xs text-app-text-muted">{planQuery.isFetching ? m.common_loading() : planQuery.isError || planQuery.data ? m.practice_coach_unavailable() : m.practice_cue_waiting()}</p>}
    {message && <p role="status">{message}</p>}
    <p className="text-xs text-app-text-muted">{m.practice_cue_caution()}</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void toggleAudio()} aria-pressed={audioEnabled}>{audioEnabled ? m.practice_cue_audio_off() : m.practice_cue_audio_on()}</Button>
      {audioEnabled && <label className="flex items-center gap-2 text-xs text-app-text-muted">{m.practice_cue_latency()} <Input type="number" min="0" max="300" step="10" value={latency} aria-invalid={!validLatency} onChange={(event) => setLatency(event.target.value)} className="w-20" /> ms</label>}
    </div>
    {audioError && <p role="alert" className="text-xs text-status-danger">{m.practice_cue_audio_unavailable()}</p>}
  </div>;
}
