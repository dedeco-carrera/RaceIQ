import { useUnits } from "@/hooks/useUnits";

export interface TireData {
  label: string;
  tempC: number;      // always °C — caller normalises
  wear: number;       // 0 (new) → 1 (gone)
  brakeTemp?: number; // °C, optional
  pressure?: number;  // psi, optional
}

interface TireGridProps {
  tires: TireData[];
  healthThresholds: { green: number; yellow: number }; // fractions 0–1
  tempThresholds: { blue: number; orange: number; red: number }; // °C
  compound?: string;
  compoundStyle?: { bg: string; text: string };
}

export function TireGrid({ tires, healthThresholds, tempThresholds, compound, compoundStyle }: TireGridProps) {
  const units = useUnits();
  const greenPct = healthThresholds.green * 100;
  const yellowPct = healthThresholds.yellow * 100;

  const hasBrake = tires.some((t) => t.brakeTemp !== undefined);
  const hasPressure = tires.some((t) => t.pressure !== undefined);

  const tempColor = (c: number) => {
    if (c > tempThresholds.red)    return "text-red-400";
    if (c > tempThresholds.orange) return "text-orange-400";
    if (c < tempThresholds.blue)   return "text-blue-400";
    return "text-emerald-400";
  };

  const tempBg = (c: number) => {
    if (c > tempThresholds.red)    return "bg-red-500";
    if (c > tempThresholds.orange) return "bg-orange-400";
    if (c < tempThresholds.blue)   return "bg-blue-500";
    return "bg-emerald-500";
  };

  const brakeColor = (t: number) => {
    if (t > 700) return "text-red-400";
    if (t > 450) return "text-orange-400";
    if (t < 175) return "text-blue-400";
    return "text-app-text-secondary";
  };

  return (
    <div>
      <div className="p-2 border-b border-app-border flex items-center justify-between">
        <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">Tires</h2>
        {compound && (
          <span
            className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
              compoundStyle ? `${compoundStyle.bg} ${compoundStyle.text}` : "bg-slate-700 text-slate-200"
            }`}
          >
            {compound}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {tires.map((t) => {
            const h = Math.max(0, (1 - t.wear) * 100);
            const hBarColor = h > greenPct ? "bg-emerald-400" : h > yellowPct ? "bg-yellow-400" : "bg-red-500";
            const hTextColor = h > greenPct ? "text-emerald-400" : h > yellowPct ? "text-yellow-400" : "text-red-400";
            const tempDisplay = units.tempUnit === "F"
              ? Math.round(t.tempC * 9 / 5 + 32)
              : Math.round(t.tempC);

            return (
              <div key={t.label} className="flex items-center gap-3">
                <div className={`w-4 h-12 rounded-sm ${tempBg(t.tempC)}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xl font-mono font-bold tabular-nums leading-none ${tempColor(t.tempC)}`}>
                    {tempDisplay}{units.tempLabel}
                  </div>
                  {(hasBrake || hasPressure) && (
                    <div className="flex gap-3 mt-1 text-sm font-mono font-bold tabular-nums leading-none">
                      {hasBrake && t.brakeTemp !== undefined && (
                        <span className={brakeColor(t.brakeTemp)}>B:{Math.round(t.brakeTemp)}&deg;C</span>
                      )}
                      {hasPressure && t.pressure !== undefined && (
                        <span className="text-app-text-muted">{t.pressure.toFixed(1)}psi</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${hBarColor}`} style={{ width: `${h}%` }} />
                    </div>
                    <span className={`text-xs font-mono font-bold tabular-nums ${hTextColor}`}>{h.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
