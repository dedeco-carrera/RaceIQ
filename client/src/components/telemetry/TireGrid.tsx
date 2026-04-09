import { useUnits } from "@/hooks/useUnits";

const PAD_NEW_MM = 29; // ACC: pads start at 29mm when new
const PAD_TOTAL_H = 35; // px height of friction material area in SVG

function BrakePad({ tempC, padMm }: { tempC: number; padMm?: number }) {
  const fill = tempC > 700 ? "#ef4444" : tempC > 450 ? "#f97316" : tempC < 175 ? "#60a5fa" : "#64748b";
  // If padMm provided, height shows remaining material; otherwise full height
  const frictionH = padMm !== undefined
    ? Math.max(2, (Math.min(padMm, PAD_NEW_MM) / PAD_NEW_MM) * PAD_TOTAL_H)
    : PAD_TOTAL_H;
  const frictionY = 9 + (PAD_TOTAL_H - frictionH); // anchor to bottom of friction zone
  return (
    <svg width="7" height="44" viewBox="0 0 7 44" className="shrink-0">
      {/* Steel backing plate */}
      <rect x="0" y="0" width="7" height="9" rx="1" fill="#334155" />
      {/* Worn-away zone (empty) */}
      <rect x="0.5" y="9" width="6" height={PAD_TOTAL_H} rx="0.5" fill="#1e293b" />
      {/* Remaining friction material — height = wear remaining */}
      <rect x="0.5" y={frictionY} width="6" height={frictionH} rx="0.5" fill={fill} />
      {/* Subtle sheen */}
      <rect x="1.5" y={frictionY + 1} width="2" height={Math.max(0, frictionH - 2)} rx="0.5" fill="white" opacity="0.07" />
    </svg>
  );
}

export interface WheelData {
  tempC: number;       // always °C — caller normalises
  wear: number;        // 0 (new) → 1 (gone)
  brakeTemp?: number;  // °C, optional
  brakePadMm?: number; // mm remaining (ACC: new = 29mm), drives pad height
  pressure?: number;   // psi, optional
}

interface TireGridProps {
  fl: WheelData;
  fr: WheelData;
  rl: WheelData;
  rr: WheelData;
  healthThresholds: { green: number; yellow: number }; // fractions 0–1
  tempThresholds: { blue: number; orange: number; red: number }; // °C
  compound?: string;
  compoundStyle?: { bg: string; text: string };
}

export function TireGrid({ fl, fr, rl, rr, healthThresholds, tempThresholds, compound, compoundStyle }: TireGridProps) {
  const units = useUnits();
  const greenPct = healthThresholds.green * 100;
  const yellowPct = healthThresholds.yellow * 100;

  const wheels = [
    { label: "FL", ...fl },
    { label: "FR", ...fr },
    { label: "RL", ...rl },
    { label: "RR", ...rr },
  ];

  const hasBrake = wheels.some((w) => w.brakeTemp !== undefined);
  const hasPressure = wheels.some((w) => w.pressure !== undefined);

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
          {wheels.map((w) => {
            const h = Math.max(0, (1 - w.wear) * 100);
            const hBarColor = h > greenPct ? "bg-emerald-400" : h > yellowPct ? "bg-yellow-400" : "bg-red-500";
            const hTextColor = h > greenPct ? "text-emerald-400" : h > yellowPct ? "text-yellow-400" : "text-red-400";
            const tempDisplay = units.tempUnit === "F"
              ? Math.round(w.tempC * 9 / 5 + 32)
              : Math.round(w.tempC);

            return (
              <div key={w.label} className="flex items-center gap-2">
                <div className={`w-4 h-12 rounded-sm ${tempBg(w.tempC)}`} />
                {hasBrake && <BrakePad tempC={w.brakeTemp ?? 0} padMm={w.brakePadMm} />}
                <div className="flex-1 min-w-0">
                  <div className={`text-xl font-mono font-bold tabular-nums leading-none ${tempColor(w.tempC)}`}>
                    {tempDisplay}{units.tempLabel}
                  </div>
                  {(hasBrake || hasPressure) && (
                    <div className="flex gap-3 mt-1 text-sm font-mono font-bold tabular-nums leading-none">
                      {hasBrake && w.brakeTemp !== undefined && (
                        <span className={brakeColor(w.brakeTemp)}>B:{Math.round(w.brakeTemp)}&deg;C</span>
                      )}
                      {w.brakePadMm !== undefined && (() => {
                        const pct = Math.max(0, Math.min(100, (w.brakePadMm / PAD_NEW_MM) * 100));
                        const cls = pct > 60 ? "text-emerald-400" : pct > 30 ? "text-yellow-400" : "text-red-400";
                        return <span className={cls}>{pct.toFixed(0)}%</span>;
                      })()}
                      {hasPressure && w.pressure !== undefined && (
                        <span className="text-app-text-muted">{w.pressure.toFixed(1)}psi</span>
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
