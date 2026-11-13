import { describe, expect, it } from 'vitest';
import { sessionElapsedMs, type ClockState } from '../src/lib/time/elapsed';

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
});
