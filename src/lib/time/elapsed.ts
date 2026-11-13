import type { Pause } from '../model';

// All elapsed time is derived from stored timestamps. Never accumulate ticks.

export interface ClockState {
  startedAt: number;
  pausedAt: number | null;
  pauses: Pause[];
}

/** Paused ms overlapping [from, until]. An open pause (pausedAt) counts up to `until`. */
export function pausedMsBetween(state: ClockState, from: number, until: number): number {
  const all = state.pausedAt != null ? [...state.pauses, { startedAt: state.pausedAt, endedAt: until }] : state.pauses;
  let total = 0;
  for (const p of all) {
    const s = Math.max(p.startedAt, from);
    const e = Math.min(p.endedAt, until);
    if (e > s) total += e - s;
  }
  return total;
}

/** The instant the clock is frozen at: pausedAt while paused, otherwise now. */
export const effectiveNow = (state: ClockState, now: number) => state.pausedAt ?? now;

/** (now or pausedAt) − startedAt − total paused time. */
export function sessionElapsedMs(state: ClockState, now: number): number {
  const until = effectiveNow(state, now);
  return Math.max(0, until - state.startedAt - pausedMsBetween(state, state.startedAt, until));
}

export const msToSec = (ms: number) => Math.round(ms / 1000);
