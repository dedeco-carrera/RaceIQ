import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { LapMeta } from "@raceiq/shared/racing/sessions/types";
import type { PracticeReferenceCatalog } from "@raceiq/shared/racing/practice/reference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { formatLapTime } from "@/lib/format";
import { exportLapsZip, importLapsZip } from "@/lib/lap-export";
import { client } from "@/lib/rpc";
import { m } from "@/paraglide/messages";

function preferenceKey(trackId: string, carId: string): string {
  return `practice-reference:f1-2025:${JSON.stringify([trackId, carId])}`;
}

export function PracticeReferences({ trackId, carId, onReference }: { trackId: string; carId: string; onReference: (lap: LapMeta | null) => void }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = preferenceKey(trackId, carId);
  const [selection, setSelection] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved && (/^(personal-best|next-step|fastest)$/.test(saved) || /^lap:[1-9]\d*$/.test(saved)) ? saved : "personal-best";
    } catch { return "personal-best"; }
  });
  const [tolerance, setTolerance] = useState("0.2");
  const value = Number(tolerance);
  const validTolerance = tolerance.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 10;
  const catalog = useQuery({
    queryKey: ["practice-references", "f1-2025", trackId, carId, value],
    enabled: !!trackId && trackId !== "-1" && !!carId && carId !== "-1" && validTolerance,
    staleTime: 15_000,
    queryFn: async () => {
      const response = await client.api.practice.references.$get({ query: { trackId, carId, tolerancePercent: String(value) } }, { headers: { "X-Game-Id": "f1-2025" } });
      if (!response.ok) throw new Error("Reference catalog unavailable");
      return response.json() as Promise<PracticeReferenceCatalog>;
    },
  });
  const data = catalog.data;
  const customId = selection.startsWith("lap:") ? Number(selection.slice(4)) : null;
  const selected = customId !== null ? data?.candidates.find((lap) => lap.id === customId) ?? null
    : selection === "next-step" ? data?.nextStep ?? null
      : selection === "fastest" ? data?.fastest ?? null : data?.personalBest ?? null;
  useEffect(() => { onReference(selected); return () => onReference(null); }, [onReference, selected]);
  useEffect(() => {
    if (data && customId !== null && !data.candidates.some((lap) => lap.id === customId)) {
      setSelection("personal-best");
      try { localStorage.setItem(key, "personal-best"); } catch { /* Storage may be unavailable. */ }
    }
  }, [customId, data, key]);
  const choose = (next: string) => {
    setSelection(next);
    try { localStorage.setItem(key, next); } catch { /* Storage may be unavailable. */ }
  };
  const imported = useMutation({
    mutationFn: (file: File) => importLapsZip(file, "others"),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["practice-references"] }); void queryClient.invalidateQueries({ queryKey: ["laps"] }); },
  });
  const downloaded = useMutation({ mutationFn: (id: number) => exportLapsZip({ lapIds: [id] }) });
  const gap = selected && data?.personalBest ? (selected.lapTime / data.personalBest.lapTime - 1) * 100 : null;
  const option = (label: string, lap: LapMeta | null | undefined) => `${label} · ${lap ? formatLapTime(lap.lapTime) : m.analyse_unavailable()}`;
  return <div className="mt-3 flex flex-col gap-2 border-t border-app-border pt-3">
    <h3 className="text-xs font-semibold text-app-text-muted">{m.practice_reference_title()}</h3>
    <SearchSelect value={selection} onChange={choose} ariaLabel={m.practice_reference_title()} options={[
      { value: "personal-best", label: option(m.practice_reference_personal(), data?.personalBest) },
      { value: "next-step", label: option(m.practice_reference_step(), data?.nextStep) },
      { value: "fastest", label: option(m.practice_reference_fastest(), data?.fastest) },
      ...(data?.candidates ?? []).map((lap) => ({ value: `lap:${lap.id}`, label: `${formatLapTime(lap.lapTime)} · ${lap.ownership === "others" ? m.import_ownership_others() : m.import_ownership_mine()} · #${lap.id}` })),
    ]} />
    <label className="flex items-center gap-2 text-xs text-app-text-muted">{m.practice_reference_tolerance()} <Input type="number" min="0" max="10" step="0.1" value={tolerance} onChange={(event) => setTolerance(event.target.value)} aria-invalid={!validTolerance} className="w-20" /> %</label>
    {catalog.isFetching ? <p>{m.common_loading()}</p> : catalog.isError ? <p>{m.practice_coach_unavailable()}</p> : selected ? <div className="text-xs text-app-text-muted">
      <p>{formatLapTime(selected.lapTime)} · {selected.ownership === "others" ? m.import_ownership_others() : m.import_ownership_mine()} · {selected.createdAt}{gap !== null && ` · ${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%`}</p>
      <p>{m.practice_reference_conditions()}</p>
    </div> : <p className="text-xs text-app-text-muted">{m.practice_reference_missing()}</p>}
    {data?.targetSeconds != null && <p className="text-xs text-app-text-muted">{m.practice_reference_target({ time: formatLapTime(data.targetSeconds) })}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={imported.isPending}>{m.practice_reference_import()}</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => selected && downloaded.mutate(selected.id)} disabled={!selected || downloaded.isPending}>{m.label_download()}</Button>
      <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) imported.mutate(file); }} />
    </div>
    {imported.isSuccess && <p role="status" className="text-xs text-app-text-muted">{m.session_imported({ count: imported.data.imported, skipped: imported.data.skipped ? m.session_skipped({ count: imported.data.skipped }) : "" })}</p>}
    {imported.data?.errors.map((error, index) => <p key={`${index}:${error}`} role="alert" className="text-xs text-status-danger">{error}</p>)}
    {(imported.isError || downloaded.isError) && <p role="alert" className="text-xs text-status-danger">{m.common_error()}</p>}
  </div>;
}
