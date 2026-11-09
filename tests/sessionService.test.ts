import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import * as sessions from '../src/lib/services/sessionService';
import * as editor from '../src/lib/services/editorService';
import { createTask } from '../src/lib/services/taskService';
import { buildExport, importReplaceAll, parseExport } from '../src/lib/io/exportImport';

const T0 = 1_700_000_000_000;
const s = (sec: number) => T0 + sec * 1000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('session lifecycle', () => {
  it('laps, pause, end', async () => {
    const dishes = await createTask({ name: 'Dishes', durationMode: 'fixed' });
    await sessions.start({ taskIds: [dishes.id] }, s(0));
    await sessions.completeLap(s(60)); // dishes 60s
    await sessions.pause(s(70));
    await expect(sessions.completeLap(s(80))).rejects.toThrow();
    await sessions.resume(s(100)); // 30s paused
    await sessions.completeLap(s(130)); // untitled: 10 + 30 = 40s
    const session = await sessions.end(s(150)); // untitled 20s, not completed

    expect(await sessions.getActive()).toBeUndefined();
    expect(session.discarded).toBe(false);
    expect(session.pauses).toEqual([{ startedAt: s(70), endedAt: s(100) }]);
    const segs = await editor.sessionSegments(session.id);
    expect(segs.map((g) => [g.taskId, g.durationSec, g.completed])).toEqual([
      [dishes.id, 60, true],
      [null, 40, true],
      [null, 20, false],
    ]);
    expect(editor.sessionTotalSec(session)).toBe(120);
    expect(editor.sumSec(segs)).toBe(120); // live laps cover the total exactly
  });

  it('survives a "reload": state comes only from the DB', async () => {
    await sessions.start({}, s(0));
    await sessions.pause(s(30));
    const active = await sessions.getActive();
    expect(active?.pausedAt).toBe(s(30));
    expect(await sessions.start({}, s(40)).catch((e) => e.message)).toMatch(/already running/);
  });

  it('end while paused counts the pause until the end', async () => {
    await sessions.start({}, s(0));
    await sessions.pause(s(50));
    const session = await sessions.end(s(500));
    expect(editor.sessionTotalSec(session)).toBe(50);
    const segs = await editor.sessionSegments(session.id);
    expect(segs[0].durationSec).toBe(50);
  });

  it('quit keeps the session flagged as discarded', async () => {
    const t = await createTask({ name: 'Laundry', durationMode: 'fixed' });
    await sessions.start({ taskIds: [t.id] }, s(0));
    const session = await sessions.quit(s(100));
    expect(session.discarded).toBe(true);
    expect(await db.sessions.get(session.id)).toMatchObject({ discarded: true });
    const segs = await editor.sessionSegments(session.id);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ taskId: t.id, completed: false, durationSec: 100 });
    expect(await sessions.getActive()).toBeUndefined();
  });

  it('skips an empty untitled trailing lap', async () => {
    await sessions.start({}, s(0));
    await sessions.completeLap(s(60));
    const session = await sessions.end(s(60));
    expect(await editor.sessionSegments(session.id)).toHaveLength(1);
  });

  it('cleans up orphan segments', async () => {
    await sessions.start({}, s(0));
    await sessions.completeLap(s(60));
    await db.activeSession.clear(); // simulate a lost active session
    expect(await sessions.cleanupOrphans()).toBe(1);
  });
});

describe('editor', () => {
  it('applyEdit persists splits, drags, reorders and deletes', async () => {
    await sessions.start({}, s(0));
    const session = await sessions.end(s(19 * 60));
    let segs = await editor.sessionSegments(session.id);
    expect(segs[0]).toMatchObject({ source: 'live' });

    const step = editor.snapStep(editor.barLengthSec(segs, editor.sessionTotalSec(session)));
    segs = editor.splitSegment(segs, segs[0].id, step, 1);
    segs = editor.moveDivider(segs, 0, 9 * 60, step, 2);
    await editor.applyEdit(session.id, segs);
    let stored = await editor.sessionSegments(session.id);
    expect(stored.map((g) => g.durationSec)).toEqual([540, 600]);
    expect(stored[0].startedAt).toBe(s(0)); // kept on duration edits (chunk 3)

    stored = editor.reorder(stored, 1, 0, 3);
    await editor.applyEdit(session.id, stored);
    stored = await editor.sessionSegments(session.id);
    expect(stored.map((g) => g.durationSec)).toEqual([600, 540]);

    stored = editor.deleteSegment(stored, stored[0].id, 4); // untitled first → merges below
    await editor.applyEdit(session.id, stored);
    stored = await editor.sessionSegments(session.id);
    expect(stored.map((g) => [g.durationSec, g.order])).toEqual([[1140, 0]]);
  });

  it('a legacy remainder is virtual: nothing is written until the first real edit', async () => {
    await sessions.start({}, s(0));
    const session = await sessions.end(s(600));
    const [only] = await editor.sessionSegments(session.id);
    await db.segments.update(only.id, { durationSec: 400 }); // simulate a chunk-1 short session
    const total = editor.sessionTotalSec(session);

    const shown = editor.withRemainder(await editor.sessionSegments(session.id), session.id, total);
    expect(shown.map((g) => g.durationSec)).toEqual([400, 200]);
    expect(await editor.sessionSegments(session.id)).toHaveLength(1); // viewing wrote nothing

    const t = await createTask({ name: 'Dishes', durationMode: 'flexible' });
    await editor.applyEdit(session.id, editor.assign(shown, shown[0].id, t.id, 7));
    const stored = await editor.sessionSegments(session.id);
    expect(stored).toHaveLength(2);
    expect(stored[1]).toMatchObject({ taskId: null, durationSec: 200, source: 'edited' });
    expect(editor.isVirtual(stored[1])).toBe(false);
    expect(stored[0]).toMatchObject({ taskId: t.id, source: 'live', editedAt: 7 });
  });

  it('window delta is total minus window, none for ∞', async () => {
    await sessions.start({ windowMin: 20 }, s(0));
    const over = await sessions.end(s(22 * 60 + 30));
    expect(editor.windowDeltaSec(over)).toBe(150);
    await sessions.start({}, s(10_000));
    expect(editor.windowDeltaSec(await sessions.end(s(10_060)))).toBeNull();
  });
});

describe('queues and end-time windows', () => {
  it('starts on the first task, advances through the queue, then falls back to untitled', async () => {
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name) => createTask({ name, durationMode: 'fixed' })));
    let active = await sessions.start({ taskIds: [a.id, b.id, c.id], startSource: 'picked' }, s(0));
    expect(active.currentTaskId).toBe(a.id);
    expect(active.queue).toEqual([b.id, c.id]);
    active = await sessions.completeLap(s(60));
    expect([active.currentTaskId, active.queue]).toEqual([b.id, [c.id]]);
    active = await sessions.completeLap(s(120));
    expect([active.currentTaskId, active.queue]).toEqual([c.id, []]);
    active = await sessions.completeLap(s(180));
    expect([active.currentTaskId, active.queue]).toEqual([null, []]);

    // queue survives a "force-quit": it's only ever read back from the DB
    const session = await sessions.end(s(200));
    expect(session.plannedTaskIds).toEqual([a.id, b.id, c.id]);
    expect(session.startSource).toBe('picked');
    const segs = await editor.sessionSegments(session.id);
    expect(segs.map((g) => g.taskId)).toEqual([a.id, b.id, c.id, null]);
  });

  it('a chunk-1 active row without a queue still works', async () => {
    await db.activeSession.add({
      sessionId: 'old',
      startedAt: s(0),
      startSource: 'quick',
      currentLapStartedAt: s(0),
      currentTaskId: null,
      pausedAt: null,
      pauses: [],
      alertsFired: [],
    });
    const active = await sessions.completeLap(s(30));
    expect(active.currentTaskId).toBeNull();
    const session = await sessions.end(s(60));
    expect(session.plannedTaskIds).toBeUndefined();
    expect(await editor.sessionSegments('old')).toHaveLength(2);
  });

  it('derives the window from the end time at the moment of start', async () => {
    const active = await sessions.start({ targetEndAt: s(20 * 60 + 20) }, s(0));
    expect(active.windowMin).toBe(20);
    expect(active.targetEndAt).toBe(s(20 * 60 + 20));
    const session = await sessions.end(s(60));
    expect(session.targetEndAt).toBe(s(20 * 60 + 20));
    expect(sessions.deriveWindowMin(s(0), s(60))).toBeUndefined(); // end time already passed → ∞
  });
});

describe('export / import', () => {
  it('round-trips everything', async () => {
    await createTask({ name: 'Dishes', durationMode: 'flexible', minMin: 5, maxMin: null });
    await sessions.start({}, s(0));
    await sessions.completeLap(s(60));
    await sessions.end(s(120));
    await sessions.start({}, s(200));
    await sessions.quit(s(260));

    const before = await buildExport(s(999));
    const text = JSON.stringify(before);
    await Promise.all(db.tables.map((t) => t.clear()));
    await importReplaceAll(parseExport(text));
    const after = await buildExport(s(999));

    const sortById = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    expect(sortById(after.tasks)).toEqual(sortById(before.tasks));
    expect(sortById(after.sessions)).toEqual(sortById(before.sessions));
    expect(sortById(after.segments)).toEqual(sortById(before.segments));
    expect(after.sessions.filter((x) => x.discarded)).toHaveLength(1);
  });

  it('rejects unknown schema versions', () => {
    expect(() => parseExport('{"schemaVersion":2}')).toThrow(/schemaVersion/);
  });
});
