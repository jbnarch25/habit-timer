// Plain records, exactly as stored. Logic lives in services/pure modules, never on these objects.

export interface Task {
  id: string;
  /** Required, unique (case- and whitespace-insensitive; see normalizeName). */
  name: string;
  /** Divisible task: smallest worthwhile chunk. */
  minChunkMin?: number;
  /** Target time; stands in for the median where noted. */
  goalMin?: number;
  /** Timer counts down from this; the session auto-ends at zero. */
  maxMin?: number;
  taskAlert: boolean;
  archived: boolean;
  createdAt: number;
}

export interface Pause {
  startedAt: number;
  endedAt: number;
}

export interface Session {
  id: string;
  /** Every saved session has a task. */
  taskId: string;
  startedAt: number;
  endedAt: number;
  /** Excludes paused time; source of truth for stats. */
  durationSec: number;
  /** Absent = infinite window. */
  windowMin?: number;
  pauses: Pause[];
}

/** At most one; persisted so a force-quit loses nothing. Stored under ACTIVE_KEY. */
export interface ActiveSession {
  startedAt: number;
  /** null = "Start Anything". */
  taskId: string | null;
  windowMin?: number;
  pausedAt: number | null;
  pauses: Pause[];
  alertsFired: string[];
}

export interface Settings {
  beep: boolean;
  voice: boolean;
  voiceURI?: string;
  wakeLock: boolean;
  persistRequested: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  beep: true,
  voice: false,
  wakeLock: true,
  persistRequested: false,
};

export interface ExportFile {
  schemaVersion: 2;
  exportedAt: number;
  tasks: Task[];
  sessions: Session[];
}
