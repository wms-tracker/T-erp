import { create } from "zustand";

/**
 * Playback state for the Animation System (§6). Deliberately separate from the document store
 * (project.ts) — this ticks continuously every frame while playing and is never part of the
 * saved project or the undo/redo history.
 */
interface SimulationState {
  playing: boolean;
  speed: number; // 0.25 .. 2
  elapsed: number; // seconds, scaled by speed while playing
  tick: (deltaSeconds: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  playing: false,
  speed: 1,
  elapsed: 0,
  tick: (deltaSeconds) => {
    const { playing, speed } = get();
    if (!playing) return;
    set((s) => ({ elapsed: s.elapsed + deltaSeconds * speed }));
  },
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  stop: () => set({ playing: false, elapsed: 0 }),
  reset: () => set({ elapsed: 0 }),
  setSpeed: (speed) => set({ speed }),
}));
