import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { buildExport, importReplaceAll, parseExport } from '../src/lib/io/exportImport';
import * as sessions from '../src/lib/services/sessionService';
import {
  createTask,
  deleteTask,
  DuplicateNameError,
  resolveTaskName,
  saveTask,
  setArchived,
} from '../src/lib/services/taskService';

const T0 = 1_700_000_000_000;
const s = (sec: number) => T0 + sec * 1000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('session lifecycle', () => {
  it('start, pause, end saves one session with the task and duration', async () => {
    const dishes = await createTask('Dishes');
    await sessions.start({ taskId: dishes.id, windowMin: 20 }, s(0));
    await sessions.pause(s(60));
    await sessions.resume(s(90)); // 30s paused
    const f = await sessions.end(s(150));

    expect(await sessions.getActive()).toBeUndefined();
    expect(f.id).toBeDefined();
    const stored = await db.sessions.get(f.id!);
    expect(stored).toMatchObject({ taskId: dishes.id, durationSec: 120, windowMin: 20, startedAt: s(0), endedAt: s(150) });
    expect(stored!.pauses).toEqual([{ startedAt: s(60), endedAt: s(90) }]);
  });

  it('survives a "reload": state comes only from the DB', async () => {
    await sessions.start({ taskId: null }, s(0));
    await sessions.pause(s(10));
    const a = await sessions.getActive();
    expect(a).toMatchObject({ startedAt: s(0), taskId: null, pausedAt: s(10) });
    expect(a!.windowMin).toBeUndefined();
  });

  it('end while paused counts the pause until the end', async () => {
    const t = await createTask('T');
    await sessions.start({ taskId: t.id }, s(0));
    await sessions.pause(s(40));
    const f = await sessions.end(s(100));
    expect(f.durationSec).toBe(40);
    expect(f.pauses).toEqual([{ startedAt: s(40), endedAt: s(100) }]);
  });

  it('a countdown past its max ends exactly at the max', async () => {
    const t = await createTask('T', { maxMin: 1 });
    await sessions.start({ taskId: t.id }, s(0));
    const f = await sessions.end(s(75), 60); // app was suspended past zero
    expect(f.durationSec).toBe(60);
    expect(f.endedAt).toBe(s(60));
  });

  it('cancel saves nothing', async () => {
    const t = await createTask('T');
    await sessions.start({ taskId: t.id }, s(0));
    await sessions.cancel();
    expect(await sessions.getActive()).toBeUndefined();
    expect(await db.sessions.count()).toBe(0);
  });

  it('Start Anything is not saved until filed', async () => {
    await sessions.start({ taskId: null }, s(0));
    const f = await sessions.end(s(300));
    expect(f.id).toBeUndefined();
    expect(f.taskId).toBeNull();
    expect(await db.sessions.count()).toBe(0);
    const t = await resolveTaskName('Reading');
    const saved = await sessions.fileSession(f, t.id);
    expect(await db.sessions.get(saved.id)).toMatchObject({ taskId: t.id, durationSec: 300 });
  });

  it('derives the window from the end time at the moment the clock starts', async () => {
    const a = await sessions.start({ taskId: null, targetEndAt: s(30 * 60) }, s(10));
    expect(a.windowMin).toBe(30);
    await sessions.cancel();
    const b = await sessions.start({ taskId: null, targetEndAt: s(0) }, s(10));
    expect(b.windowMin).toBeUndefined(); // past: ∞
  });

  it('only one session at a time', async () => {
    await sessions.start({ taskId: null }, s(0));
    await expect(sessions.start({ taskId: null }, s(1))).rejects.toThrow();
  });
});

describe('tasks', () => {
  it('names are unique ignoring case and whitespace', async () => {
    const a = await createTask('  Wash   dishes ');
    expect(a.name).toBe('Wash dishes');
    await expect(createTask('wash DISHES')).rejects.toBeInstanceOf(DuplicateNameError);
    const b = await createTask('Laundry');
    await expect(saveTask(b.id, 'Wash dishes', {})).rejects.toBeInstanceOf(DuplicateNameError);
    await saveTask(b.id, 'laundry', { goalMin: 30 }); // renaming to itself is fine
    expect(await db.tasks.get(b.id)).toMatchObject({ name: 'laundry', goalMin: 30 });
  });

  it('saveTask clears removed properties; taskAlert defaults off', async () => {
    const t = await createTask('T', { goalMin: 5, maxMin: 10 });
    expect(t.taskAlert).toBe(false);
    await saveTask(t.id, 'T', { maxMin: 10, taskAlert: true });
    const stored = await db.tasks.get(t.id);
    expect(stored).toMatchObject({ maxMin: 10, taskAlert: true });
    expect('goalMin' in stored!).toBe(false);
  });

  it('resolveTaskName selects an existing task and un-archives it', async () => {
    const t = await createTask('Dishes');
    await setArchived(t.id, true);
    const r = await resolveTaskName(' dishes ');
    expect(r.id).toBe(t.id);
    expect((await db.tasks.get(t.id))!.archived).toBe(false);
    expect(await db.tasks.count()).toBe(1);
  });

  it('delete removes the task and all its sessions', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    for (const [t, at] of [[a, 0], [a, 100], [b, 200]] as const) {
      await sessions.start({ taskId: t.id }, s(at));
      await sessions.end(s(at + 60));
    }
    expect(await deleteTask(a.id)).toBe(2);
    expect(await db.tasks.get(a.id)).toBeUndefined();
    expect((await db.sessions.toArray()).map((x) => x.taskId)).toEqual([b.id]);
  });
});

describe('export / import', () => {
  it('round-trips tasks and sessions', async () => {
    const t = await createTask('T');
    await sessions.start({ taskId: t.id }, s(0));
    await sessions.end(s(60));
    const file = parseExport(JSON.stringify(await buildExport(s(100))));
    expect(file.schemaVersion).toBe(2);
    await Promise.all(db.tables.map((x) => x.clear()));
    await importReplaceAll(file);
    expect(await db.tasks.count()).toBe(1);
    expect(await db.sessions.count()).toBe(1);
  });

  it('rejects schema 1 and unknown versions', () => {
    expect(() => parseExport(JSON.stringify({ schemaVersion: 1, tasks: [], sessions: [] }))).toThrow(/old version/);
    expect(() => parseExport(JSON.stringify({ schemaVersion: 9, tasks: [], sessions: [] }))).toThrow(/schemaVersion/);
    expect(() => parseExport('nope')).toThrow(/JSON/);
  });
});
