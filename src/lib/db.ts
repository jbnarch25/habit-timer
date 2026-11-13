import Dexie, { type EntityTable, type Table } from 'dexie';
import type { ActiveSession, Session, Settings, Task } from './model';

export class HabitDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  active!: Table<ActiveSession, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'habit-timer') {
    super(name);
    // v0 schema (multi-segment sessions). Kept so Dexie can upgrade existing installs.
    this.version(1).stores({
      tasks: 'id, createdAt',
      sessions: 'id, startedAt',
      segments: 'id, sessionId, taskId, [sessionId+order]',
      activeSession: 'sessionId',
      pickerEvents: 'id, at',
      settings: '',
    });
    // v1 simple loop. Existing data was test data: reset rather than migrate (DECISIONS 2026-11-13).
    this.version(2)
      .stores({
        // Booleans (archived) aren't valid IndexedDB keys; filtered in memory.
        tasks: 'id, createdAt',
        sessions: 'id, startedAt, taskId',
        segments: null,
        pickerEvents: null,
        activeSession: null,
        active: '', // single row under ACTIVE_KEY
        settings: '', // single row under SETTINGS_KEY
      })
      .upgrade(async (tx) => {
        await tx.table('tasks').clear();
        await tx.table('sessions').clear();
        await tx
          .table('settings')
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            s.voice = false;
            delete s.coalesceMinMin;
            delete s.coalescePct;
          });
      });
  }
}

export const SETTINGS_KEY = 'app';
export const ACTIVE_KEY = 'current';
export const db = new HabitDB();
