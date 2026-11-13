import type { AlertKind } from './points';

export interface ScheduledAlert {
  id: AlertKind;
  /** Wall-clock epoch ms when it should fire. */
  at: number;
  text: string;
}

export interface AlertPrefs {
  beep: boolean;
  voice: boolean;
  voiceURI?: string;
}

export interface AlertService {
  /** Must be called inside a user gesture (iOS) to allow audio and speech later. */
  unlock(): void;
  /** Replaces any previously scheduled alerts. */
  schedule(points: ScheduledAlert[]): void;
  cancel(): void;
  /** Play immediately (also used by the Settings "Test" button). */
  announce(kind: AlertKind, text: string): void;
  /** One short lead-in beep (3‑2‑1). Respects the beep setting. */
  tick(): void;
  setPrefs(prefs: AlertPrefs): void;
}
