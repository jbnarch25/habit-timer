import { LATE_GRACE_MS, type AlertKind } from './points';
import type { AlertPrefs, AlertService, ScheduledAlert } from './AlertService';

export type FiredHandler = (alert: ScheduledAlert, played: boolean) => void;

/** [offset s, length s] tones. Window: three short and one long. Task: two short. */
const PATTERNS: Record<AlertKind | 'tick', [number, number][]> = {
  window: [
    [0, 0.15],
    [0.25, 0.15],
    [0.5, 0.15],
    [0.75, 0.6],
  ],
  task: [
    [0, 0.18],
    [0.25, 0.18],
  ],
  tick: [[0, 0.12]],
};

/**
 * Web Audio beep + speechSynthesis. Foreground only: iOS suspends JS when the PWA is backgrounded,
 * so a timer that fires late (or while hidden) reports played=false and the UI shows a banner instead.
 */
export class WebAlertService implements AlertService {
  private ctx: AudioContext | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private prefs: AlertPrefs = { beep: true, voice: false };

  /** Set by the active timer screen. */
  onFired: FiredHandler = () => {};

  setPrefs(prefs: AlertPrefs) {
    this.prefs = prefs;
  }

  unlock() {
    // Safari Audio Session API (iOS 16.4+): 'playback' makes Web Audio ignore the ring/silent switch.
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
    } catch {
      /* unsupported */
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.ctx ??= new AC();
        void this.ctx.resume();
        // A silent buffer played inside the gesture fully unlocks output on iOS.
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
      }
    } catch {
      /* audio unavailable: degrade quietly */
    }
    try {
      if (this.prefs.voice && 'speechSynthesis' in window && !speechSynthesis.speaking) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
      }
    } catch {
      /* speech unavailable */
    }
  }

  schedule(points: ScheduledAlert[]) {
    this.cancel();
    for (const p of points) {
      const delay = Math.max(0, p.at - Date.now());
      this.timers.push(
        setTimeout(() => {
          const late = Date.now() - p.at > LATE_GRACE_MS;
          const played = !late && document.visibilityState === 'visible';
          if (played) this.announce(p.id, p.text);
          this.onFired(p, played);
        }, delay),
      );
    }
  }

  cancel() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  announce(kind: AlertKind, text: string) {
    if (this.prefs.beep) this.play(PATTERNS[kind]);
    if (this.prefs.voice) setTimeout(() => this.speak(text), this.prefs.beep ? 1500 : 0);
  }

  tick() {
    if (this.prefs.beep) this.play(PATTERNS.tick);
  }

  private play(tones: [number, number][]) {
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume();
    const t = ctx.currentTime;
    for (const [offset, len] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, t + offset + 0.02);
      gain.gain.setValueAtTime(0.5, t + offset + Math.max(0.02, len - 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + len + 0.02);
    }
  }

  private speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === this.prefs.voiceURI);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
}

/** App-wide instance: unlocked in the Start tap, scheduled by the timer screen. */
export const alerts = new WebAlertService();

/** Voices load asynchronously on iOS; resolve once available (or after a short wait). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}
