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
    await sessions.start({ taskId: dishes.id }, s(0));
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
    expect(editor.remainderSec(session, segs)).toBe(0);
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
    await sessions.start({ taskId: t.id }, s(0));
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
  it('allocates, over-allocates, and marks edits', async () => {
    await sessions.start({}, s(0));
    const session = await sessions.end(s(19 * 60));
    const [only] = await editor.sessionSegments(session.id);
    expect(only.source).toBe('live');

    await editor.setDuration(only.id, 9 * 60);
    expect(editor.remainderSec(session, await editor.sessionSegments(session.id))).toBe(10 * 60);
    await editor.addSegment(session.id, 7 * 60);
    await editor.addSegment(session.id, 6 * 60);
    const segs = await editor.sessionSegments(session.id);
    expect(segs.map((g) => g.order)).toEqual([0, 1, 2]);
    expect(segs[0].source).toBe('edited');
    expect(segs[0].startedAt).toBeUndefined();
    expect(editor.remainderSec(session, segs)).toBe(-3 * 60); // over-allocated: allowed
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
