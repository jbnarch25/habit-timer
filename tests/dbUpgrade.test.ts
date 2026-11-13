import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { HabitDB } from '../src/lib/db';

describe('v0 → v1 upgrade', () => {
  it('resets tasks and sessions, drops old tables, keeps settings with voice off', async () => {
    const name = 'upgrade-test';
    const old = new Dexie(name);
    old.version(1).stores({
      tasks: 'id, createdAt',
      sessions: 'id, startedAt',
      segments: 'id, sessionId, taskId, [sessionId+order]',
      activeSession: 'sessionId',
      pickerEvents: 'id, at',
      settings: '',
    });
    await old.open();
    await old.table('tasks').add({ id: 't', name: 'Old', durationMode: 'fixed', createdAt: 1 });
    await old.table('sessions').add({ id: 's', startedAt: 1 });
    await old.table('segments').add({ id: 'g', sessionId: 's', taskId: 't', order: 0 });
    await old.table('activeSession').add({ sessionId: 'x' });
    await old.table('settings').put({ beep: false, voice: true, coalesceMinMin: 2, coalescePct: 15, wakeLock: false }, 'app');
    old.close();

    const db = new HabitDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.active.count()).toBe(0);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['active', 'sessions', 'settings', 'tasks']);
    expect(await db.settings.get('app')).toEqual({ beep: false, voice: false, wakeLock: false });
    db.close();
  });
});
