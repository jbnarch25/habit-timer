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

/** The instant the clocks are frozen at: pausedAt while paused, otherwise now. */
export const effectiveNow = (state: ClockState, now: number) => state.pausedAt ?? now;

/** Running (unpaused) ms since `from`. */
export function activeMsSince(state: ClockState, from: number, now: number): number {
  const until = effectiveNow(state, now);
  return Math.max(0, until - from - pausedMsBetween(state, from, until));
}

export const sessionElapsedMs = (state: ClockState, now: number) => activeMsSince(state, state.startedAt, now);

export const lapElapsedMs = (state: ClockState, lapStartedAt: number, now: number) =>
  activeMsSince(state, lapStartedAt, now);

/** Session active ms at wall time `t` (t must not be inside the open pause). */
export const sessionMsAt = (state: ClockState, t: number) =>
  Math.max(0, t - state.startedAt - pausedMsBetween({ ...state, pausedAt: null }, state.startedAt, t));

export const msToSec = (ms: number) => Math.round(ms / 1000);

/**
 * Lap duration in whole seconds, as the difference of rounded session-clock readings, so that
 * consecutive laps always sum exactly to the rounded session total (no stray 1s remainders).
 */
export function lapDurationSec(state: ClockState, lapStartedAt: number, now: number): number {
  return msToSec(sessionElapsedMs(state, now)) - msToSec(sessionMsAt(state, lapStartedAt));
}
