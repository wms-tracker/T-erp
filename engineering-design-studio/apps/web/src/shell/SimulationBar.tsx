import React from "react";
import { useSimulationStore } from "../project/simulationStore";
import { TopBarButton } from "../ui/primitives";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export function SimulationBar() {
  const playing = useSimulationStore((s) => s.playing);
  const speed = useSimulationStore((s) => s.speed);
  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const stop = useSimulationStore((s) => s.stop);
  const reset = useSimulationStore((s) => s.reset);
  const setSpeed = useSimulationStore((s) => s.setSpeed);

  return (
    <div className="flex items-center gap-1 px-2 h-9 bg-panel2 border-b border-border shrink-0">
      <span className="text-[10.5px] uppercase tracking-wide text-slate-500 mr-2">Simulation</span>
      {!playing ? (
        <TopBarButton onClick={play}>▶ Play</TopBarButton>
      ) : (
        <TopBarButton onClick={pause} active>
          ⏸ Pause
        </TopBarButton>
      )}
      <TopBarButton onClick={stop}>⏹ Stop</TopBarButton>
      <TopBarButton onClick={reset}>⟲ Reset</TopBarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <span className="text-[11px] text-slate-500">Speed</span>
      <select
        value={speed}
        onChange={(e) => setSpeed(parseFloat(e.target.value))}
        className="bg-panel border border-border rounded px-1.5 py-1 text-[12px]"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
      <span className="ml-3 text-[10.5px] text-slate-500">
        Drives the Automatic Weighing Machine's cycle — more equipment animates the same way in later phases.
      </span>
    </div>
  );
}
