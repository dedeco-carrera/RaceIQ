import { useTelemetryStore } from "../../stores/telemetry";
import type { DisplayPacket } from "../../lib/convert-packet";
import { tryGetGame } from "@shared/games/registry";
import { LapTimeChart } from "../LapTimeChart";
import { PitEstimate } from "../telemetry/PitEstimate";
import { RecordedLaps } from "../RecordedLaps";
import { NoDataView } from "../NoDataView";
import { useUnits } from "../../hooks/useUnits";
import { useTrackName, useCarName } from "../../hooks/queries";
import { RaceInfo } from "../LivePage";

// ── ACC Tire Section ──────────────────────────────────────────────────────────

function AccTireSection({ packet }: { packet: DisplayPacket }) {
  const units = useUnits();
  const compound = packet.acc?.tireCompound || "";
  const thresh = tryGetGame("acc")?.tireHealthThresholds ?? { green: 0.85, yellow: 0.70 };
  const greenPct = thresh.green * 100;
  const yellowPct = thresh.yellow * 100;

  // ACC tire temps are already in °C; convert for display
  const toDisplay = (c: number) => units.tempUnit === "F" ? c * 9 / 5 + 32 : c;

  const tires = [
    { label: "FL", temp: toDisplay(packet.TireTempFL), wear: packet.TireWearFL, brakeTemp: packet.BrakeTempFrontLeft ?? 0, pressure: packet.TirePressureFrontLeft ?? 0 },
    { label: "FR", temp: toDisplay(packet.TireTempFR), wear: packet.TireWearFR, brakeTemp: packet.BrakeTempFrontRight ?? 0, pressure: packet.TirePressureFrontRight ?? 0 },
    { label: "RL", temp: toDisplay(packet.TireTempRL), wear: packet.TireWearRL, brakeTemp: packet.BrakeTempRearLeft ?? 0, pressure: packet.TirePressureRearLeft ?? 0 },
    { label: "RR", temp: toDisplay(packet.TireTempRR), wear: packet.TireWearRR, brakeTemp: packet.BrakeTempRearRight ?? 0, pressure: packet.TirePressureRearRight ?? 0 },
  ];

  const tempColor = (t: number) => {
    const c = units.tempUnit === "F" ? (t - 32) * 5 / 9 : t;
    if (c > 100) return "text-red-400";
    if (c > 85) return "text-orange-400";
    if (c < 60) return "text-blue-400";
    return "text-emerald-400";
  };
  const tempBg = (t: number) => {
    const c = units.tempUnit === "F" ? (t - 32) * 5 / 9 : t;
    if (c > 100) return "bg-red-500";
    if (c > 85) return "bg-orange-400";
    if (c < 60) return "bg-blue-500";
    return "bg-emerald-500";
  };
  const brakeColor = (t: number) => {
    if (t > 600) return "text-red-400";
    if (t > 400) return "text-orange-400";
    if (t < 150) return "text-blue-400";
    return "text-app-text-secondary";
  };
  const health = (wear: number) => Math.max(0, (1 - wear) * 100);

  return (
    <div>
      <div className="p-2 border-b border-app-border flex items-center justify-between">
        <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">Tires</h2>
        {compound && <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-200">{compound}</span>}
      </div>
      <div className="p-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {tires.map((t) => {
            const h = health(t.wear);
            const hColor = h > greenPct ? "bg-emerald-400" : h > yellowPct ? "bg-yellow-400" : "bg-red-500";
            return (
              <div key={t.label} className="flex items-center gap-3">
                <div className={`w-4 h-12 rounded-sm ${tempBg(t.temp)}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xl font-mono font-bold tabular-nums leading-none ${tempColor(t.temp)}`}>
                    {Math.round(t.temp)}{units.tempLabel}
                  </div>
                  <div className="flex gap-3 mt-1 text-xl font-mono font-bold tabular-nums leading-none">
                    <span className={brakeColor(t.brakeTemp)}>B:{Math.round(t.brakeTemp)}&deg;C</span>
                    <span className="text-app-text-muted">{t.pressure.toFixed(1)}psi</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mt-1">
                    <div className={`h-full rounded-full ${hColor}`} style={{ width: `${h}%` }} />
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function AccLiveDashboard() {
  const packet = useTelemetryStore((s) => s.packet);
  const { data: trackName } = useTrackName(packet?.TrackOrdinal);
  const { data: carName } = useCarName(packet?.CarOrdinal);

  if (!packet || packet.gameId !== "acc") {
    return (
      <div className="flex-1 flex flex-col">
        <NoDataView />
      </div>
    );
  }

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
      {/* Left column: Tires + Pit Window */}
      <div className="border-r border-app-border overflow-auto">
        {/* Tires */}
        <div className="border-b border-app-border">
          <AccTireSection packet={packet} />
        </div>

        {/* Pit Window */}
        <div className="border-b border-app-border">
          <div className="p-2 border-b border-app-border">
            <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">Pit Window</h2>
          </div>
          <div className="p-3">
            <PitEstimate packet={packet} />
          </div>
        </div>
      </div>

      {/* Right column: Race (with sectors) + Charts + Recorded Laps */}
      <div className="overflow-auto flex flex-col">
        <RaceInfo packet={packet} trackName={trackName} carName={carName} showTrackMap={true} showSectors={true} />

        <LapTimeChart packet={packet} />

        <div className="flex-1">
          <RecordedLaps />
        </div>
      </div>
    </div>
  );
}
