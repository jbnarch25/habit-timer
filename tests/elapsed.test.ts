import { describe, expect, it } from 'vitest';
import { lapDurationSec, lapElapsedMs, sessionElapsedMs, type ClockState } from '../src/lib/time/elapsed';

const T0 = 1_000_000;
const s = (sec: number) => sec * 1000;

describe('elapsed', () => {
  it('counts wall time when never paused', () => {
    const st: ClockState = { startedAt: T0, pausedAt: null, pauses: [] };
    expect(sessionElapsedMs(st, T0 + s(90))).toBe(s(90));
  });

  it('excludes completed pauses and freezes while paused', () => {
    const st: ClockState = { startedAt: T0, pausedAt: T0 + s(100), pauses: [{ startedAt: T0 + s(10), endedAt: T0 + s(40) }] };
    // running: 0-10, 40-100 => 70s; frozen while paused
    expect(sessionElapsedMs(st, T0 + s(100))).toBe(s(70));
    expect(sessionElapsedMs(st, T0 + s(500))).toBe(s(70));
  });

  it('lap time only counts pauses after the lap start', () => {
    const st: ClockState = {
      startedAt: T0,
      pausedAt: null,
      pauses: [
        { startedAt: T0 + s(10), endedAt: T0 + s(20) }, // before lap
        { startedAt: T0 + s(50), endedAt: T0 + s(60) }, // inside lap
      ],
    };
    const lapStart = T0 + s(30);
    expect(lapElapsedMs(st, lapStart, T0 + s(100))).toBe(s(60));
    expect(sessionElapsedMs(st, T0 + s(100))).toBe(s(80));
  });

  it('lap durations sum exactly to the rounded session total', () => {
    const st: ClockState = { startedAt: T0, pausedAt: null, pauses: [] };
    const laps = [T0, T0 + 1400, T0 + 2900, T0 + 4600];
    const end = T0 + 6100;
    let sum = 0;
    for (let i = 0; i < laps.length; i++) sum += lapDurationSec(st, laps[i], laps[i + 1] ?? end);
    expect(sum).toBe(Math.round(sessionElapsedMs(st, end) / 1000));
  });
});
