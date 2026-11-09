// Plain records, exactly as stored. Logic lives in services/pure modules, never on these objects.

export type DurationMode = 'fixed' | 'flexible';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export const TIMES_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

export interface Task {
  id: string;
  name: string;
  category?: string;
  durationMode: DurationMode;
  estimateMin?: number;
  minMin?: number;
  maxMin?: number | null;
  targetFrequencyDays?: number;
  preferredTimes?: TimeOfDay[];
  medianAlert: boolean;
  archived: boolean;
  createdAt: number;
}

export interface Pause {
  startedAt: number;
  endedAt: number;
}

export type StartSource = 'quick' | 'picked' | 'suggested';

export interface Session {
  id: string;
  startedAt: number;
  endedAt: number;
  windowMin?: number;
  /** Set when the window was chosen as a clock time (chunk 2). */
  targetEndAt?: number;
  /** The queue as it stood at start (chunk 2). Raw data: plan vs. actual. */
  plannedTaskIds?: string[];
  startSource: StartSource;
  pauses: Pause[];
  /** true = user quit. Kept for querying; hidden from History and excluded from stats. */
  discarded: boolean;
}

export interface Segment {
  id: string;
  sessionId: string;
  order: number;
  taskId: string | null;
  durationSec: number;
  startedAt?: number;
  completed: boolean;
  source: 'live' | 'edited';
  /** Epoch ms of the last manual edit (chunk 2). Captured only; nothing reads it yet. */
  editedAt?: number;
  excluded: boolean;
}

export interface ActiveSession {
  sessionId: string;
  startedAt: number;
  windowMin?: number;
  targetEndAt?: number;
  /** Carried on the active row so finish() can write them to the Session. */
  startSource: StartSource;
  plannedTaskIds?: string[];
  currentLapStartedAt: number;
  currentTaskId: string | null;
  /** Remaining queued task ids; head becomes the next lap. Chunk-1 rows lack it: read via queueOf(). */
  queue?: string[];
  pausedAt: number | null;
  pauses: Pause[];
  alertsFired: string[];
}

export const queueOf = (a: Pick<ActiveSession, 'queue'>): string[] => a.queue ?? [];

export interface PickerEvent {
  id: string;
  at: number;
  windowMin: number;
  suggestedTaskIds: string[];
  action: 'accepted' | 'rerolled' | 'dismissed';
  chosenTaskId?: string;
}

export interface Settings {
  beep: boolean;
  voice: boolean;
  voiceURI?: string;
  coalesceMinMin: number;
  coalescePct: number;
  wakeLock: boolean;
  persistRequested: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  beep: true,
  voice: true,
  coalesceMinMin: 2,
  coalescePct: 15,
  wakeLock: true,
  persistRequested: false,
};

export interface ExportFile {
  schemaVersion: 1;
  exportedAt: number;
  tasks: Task[];
  sessions: Session[];
  segments: Segment[];
  pickerEvents: PickerEvent[];
}
