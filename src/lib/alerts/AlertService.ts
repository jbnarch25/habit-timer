export interface ScheduledAlert {
  ids: string[];
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
  announce(text: string): void;
  setPrefs(prefs: AlertPrefs): void;
}
