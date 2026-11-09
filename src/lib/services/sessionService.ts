import { db } from '../db';
import { newId } from '../id';
import type { ActiveSession, Segment, Session, StartSource } from '../model';
import { lapDurationSec } from '../time/elapsed';

export const getActive = (): Promise<ActiveSession | undefined> => db.activeSession.toCollection().first();

async function requireActive(): Promise<ActiveSession> {
  const a = await getActive();
  if (!a) throw new Error('No active session');
  return a;
}

export interface StartOptions {
  taskId?: string | null;
  windowMin?: number;
  startSource?: StartSource;
}

export async function start(opts: StartOptions = {}, now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    if (await db.activeSession.count()) throw new Error('A session is already running');
    const active: ActiveSession = {
      sessionId: newId(),
      startedAt: now,
      windowMin: opts.windowMin,
      startSource: opts.startSource ?? 'quick',
      currentLapStartedAt: now,
      currentTaskId: opts.taskId ?? null,
      pausedAt: null,
      pauses: [],
      alertsFired: [],
    };
    await db.activeSession.add(active);
    return active;
  });
}

async function nextOrder(sessionId: string): Promise<number> {
  const last = await db.segments.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).last();
  return last ? last.order + 1 : 0;
}

/** Close the current lap into a stored live segment. */
async function closeLap(active: ActiveSession, completed: boolean, now: number): Promise<Segment> {
  const seg: Segment = {
    id: newId(),
    sessionId: active.sessionId,
    order: await nextOrder(active.sessionId),
    taskId: active.currentTaskId,
    durationSec: lapDurationSec(active, active.currentLapStartedAt, now),
    startedAt: active.currentLapStartedAt,
    completed,
    source: 'live',
    excluded: false,
  };
  await db.segments.add(seg);
  return seg;
}

/** "Completed task": close the lap as completed; the clock keeps running with a new untitled lap. */
export async function completeLap(now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, db.segments, async () => {
    const active = await requireActive();
    if (active.pausedAt != null) throw new Error('Resume before completing a task');
    await closeLap(active, true, now);
    const next: ActiveSession = { ...active, currentLapStartedAt: now, currentTaskId: null };
    await db.activeSession.put(next);
    return next;
  });
}

export async function setCurrentTask(taskId: string | null): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    const active = await requireActive();
    const next = { ...active, currentTaskId: taskId };
    await db.activeSession.put(next);
    return next;
  });
}

export async function pause(now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    const active = await requireActive();
    if (active.pausedAt != null) return active;
    const next = { ...active, pausedAt: now };
    await db.activeSession.put(next);
    return next;
  });
}

export async function resume(now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    const active = await requireActive();
    if (active.pausedAt == null) return active;
    const next: ActiveSession = {
      ...active,
      pausedAt: null,
      pauses: [...active.pauses, { startedAt: active.pausedAt, endedAt: now }],
    };
    await db.activeSession.put(next);
    return next;
  });
}

export async function markAlertsFired(ids: string[]): Promise<ActiveSession | undefined> {
  return db.transaction('rw', db.activeSession, async () => {
    const active = await getActive();
    if (!active) return undefined;
    const next = { ...active, alertsFired: [...new Set([...active.alertsFired, ...ids])] };
    await db.activeSession.put(next);
    return next;
  });
}

/** Shared by End and Quit: close any open pause and the open lap, write the Session, clear ActiveSession. */
async function finish(discarded: boolean, now: number): Promise<Session> {
  return db.transaction('rw', db.activeSession, db.segments, db.sessions, async () => {
    const active = await requireActive();
    // Ending while paused: the pause runs until the end; the clocks were frozen at pausedAt.
    const pauses = active.pausedAt != null ? [...active.pauses, { startedAt: active.pausedAt, endedAt: now }] : active.pauses;
    const closed: ActiveSession = { ...active, pausedAt: null, pauses };
    const durationSec = lapDurationSec(closed, active.currentLapStartedAt, now);
    // Skip an empty trailing lap (e.g. "Completed task" then immediately End) unless it has a task.
    if (durationSec > 0 || active.currentTaskId != null) await closeLap(closed, false, now);
    const session: Session = {
      id: active.sessionId,
      startedAt: active.startedAt,
      endedAt: now,
      windowMin: active.windowMin,
      startSource: active.startSource,
      pauses,
      discarded,
    };
    await db.sessions.add(session);
    await db.activeSession.clear();
    return session;
  });
}

/** End session: close the current segment as not completed and persist the session. */
export const end = (now = Date.now()) => finish(false, now);

/** Quit (X): keep the data but flag the session as discarded (hidden from History, excluded from stats). */
export const quit = (now = Date.now()) => finish(true, now);

/** On launch: remove segments that belong to neither a stored session nor the active one (interrupted writes). */
export async function cleanupOrphans(): Promise<number> {
  return db.transaction('rw', db.segments, db.sessions, db.activeSession, async () => {
    const active = await getActive();
    const sessionIds = new Set(await db.sessions.toCollection().primaryKeys());
    if (active) sessionIds.add(active.sessionId);
    const orphans = await db.segments.filter((s) => !sessionIds.has(s.sessionId)).primaryKeys();
    await db.segments.bulkDelete(orphans);
    return orphans.length;
  });
}
