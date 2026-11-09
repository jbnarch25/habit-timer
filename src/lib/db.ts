import Dexie, { type EntityTable, type Table } from 'dexie';
import type { ActiveSession, PickerEvent, Segment, Session, Settings, Task } from './model';

export class HabitDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  segments!: EntityTable<Segment, 'id'>;
  activeSession!: EntityTable<ActiveSession, 'sessionId'>;
  pickerEvents!: EntityTable<PickerEvent, 'id'>;
  settings!: Table<Settings, string>;

  constructor(name = 'habit-timer') {
    super(name);
    this.version(1).stores({
      // Booleans (archived, discarded, excluded...) aren't valid IndexedDB keys; filtered in memory.
      tasks: 'id, createdAt',
      sessions: 'id, startedAt',
      segments: 'id, sessionId, taskId, [sessionId+order]',
      activeSession: 'sessionId', // at most one row, enforced by sessionService
      pickerEvents: 'id, at', // reserved for the picker chunk; nothing writes yet
      settings: '', // single row under SETTINGS_KEY
    });
  }
}

export const SETTINGS_KEY = 'app';
export const db = new HabitDB();
