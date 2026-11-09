import { db } from '../db';
import { newId } from '../id';
import { queueOf, type ActiveSession, type Segment, type Session, type StartSource } from '../model';
import { lapDurationSec } from '../time/elapsed';

export const getActive = (): Promise<ActiveSession | undefined> => db.activeSession.toCollection().first();

async function requireActive(): Promise<ActiveSession> {
  const a = await getActive();
  if (!a) throw new Error('No active session');
  return a;
}

export interface StartOptions {
  /** First task becomes the current lap; the rest are queued. Empty = untitled. */
  taskIds?: string[];
  /** Duration-mode window. Ignored when targetEndAt is given. */
  windowMin?: number;
  /** End-time mode: the window is derived at this instant of starting. */
  targetEndAt?: number;
  startSource?: StartSource;
}

/** windowMin = round((targetEndAt − start) / 1 min); ≤ 0 means no window (∞). */
export function deriveWindowMin(targetEndAt: number, startedAt: number): number | undefined {
  const w = Math.round((targetEndAt - startedAt) / 60_000);
  return w > 0 ? w : undefined;
}

export async function start(opts: StartOptions = {}, now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    if (await db.activeSession.count()) throw new Error('A session is already running');
    const taskIds = opts.taskIds ?? [];
    const active: ActiveSession = {
      sessionId: newId(),
      startedAt: now,
      windowMin: opts.targetEndAt != null ? deriveWindowMin(opts.targetEndAt, now) : opts.windowMin,
      targetEndAt: opts.targetEndAt,
      startSource: opts.startSource ?? 'quick',
      plannedTaskIds: taskIds.length ? [...taskIds] : undefined,
      currentLapStartedAt: now,
      currentTaskId: taskIds[0] ?? null,
      queue: taskIds.slice(1),
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

/** "Completed task": close the lap as completed; the new lap takes the head of the queue, else untitled. */
export async function completeLap(now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, db.segments, async () => {
    const active = await requireActive();
    if (active.pausedAt != null) throw new Error('Resume before completing a task');
    await closeLap(active, true, now);
    const [head = null, ...rest] = queueOf(active);
    const next: ActiveSession = { ...active, currentLapStartedAt: now, currentTaskId: head, queue: rest };
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
      targetEndAt: active.targetEndAt,
      plannedTaskIds: active.plannedTaskIds,
      startSource: active.startSource,
      pauses,
      discarded,
    };
    // Drop absent optional fields so stored records stay clean.
    if (session.targetEndAt == null) delete session.targetEndAt;
    if (session.plannedTaskIds == null) delete session.plannedTaskIds;
    if (session.windowMin == null) delete session.windowMin;
    // Unstarted queue items are dropped; plannedTaskIds records the plan.
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
