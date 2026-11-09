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
  excluded: boolean;
}

export interface ActiveSession {
  sessionId: string;
  startedAt: number;
  windowMin?: number;
  /** Not in the SPEC interface, but needed to write Session.startSource at the end. */
  startSource: StartSource;
  currentLapStartedAt: number;
  currentTaskId: string | null;
  pausedAt: number | null;
  pauses: Pause[];
  alertsFired: string[];
}

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
