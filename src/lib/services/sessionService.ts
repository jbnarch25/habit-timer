import { ACTIVE_KEY, db } from '../db';
import { newId } from '../id';
import type { ActiveSession, Session } from '../model';
import { msToSec, sessionElapsedMs } from '../time/elapsed';

export const getActive = (): Promise<ActiveSession | undefined> => db.active.get(ACTIVE_KEY);

async function requireActive(): Promise<ActiveSession> {
  const a = await getActive();
  if (!a) throw new Error('No active session');
  return a;
}

/** windowMin = round((targetEndAt − start) / 1 min); ≤ 0 means no window (∞). */
export function deriveWindowMin(targetEndAt: number, startedAt: number): number | undefined {
  const w = Math.round((targetEndAt - startedAt) / 60_000);
  return w > 0 ? w : undefined;
}

export interface StartOptions {
  /** null = "Start Anything". */
  taskId: string | null;
  /** Duration-mode window. Ignored when targetEndAt is given. */
  windowMin?: number;
  /** End-time mode: the window is derived at the instant the clock starts. */
  targetEndAt?: number;
}

/** Called after the lead-in: `now` is when the clock starts. */
export async function start(opts: StartOptions, now = Date.now()): Promise<ActiveSession> {
  return db.transaction('rw', db.active, async () => {
    if (await getActive()) throw new Error('A session is already running');
    const windowMin = opts.targetEndAt != null ? deriveWindowMin(opts.targetEndAt, now) : opts.windowMin;
    const active: ActiveSession = { startedAt: now, taskId: opts.taskId, pausedAt: null, pauses: [], alertsFired: [] };
    if (windowMin) active.windowMin = windowMin;
    await db.active.put(active, ACTIVE_KEY);
    return active;
  });
}

async function patchActive(fn: (a: ActiveSession) => ActiveSession): Promise<ActiveSession> {
  return db.transaction('rw', db.active, async () => {
    const next = fn(await requireActive());
    await db.active.put(next, ACTIVE_KEY);
    return next;
  });
}

export const pause = (now = Date.now()) => patchActive((a) => (a.pausedAt != null ? a : { ...a, pausedAt: now }));

export const resume = (now = Date.now()) =>
  patchActive((a) =>
    a.pausedAt == null ? a : { ...a, pausedAt: null, pauses: [...a.pauses, { startedAt: a.pausedAt, endedAt: now }] },
  );

export async function markAlertsFired(ids: string[]): Promise<void> {
  await db.transaction('rw', db.active, async () => {
    const a = await getActive();
    if (a) await db.active.put({ ...a, alertsFired: [...new Set([...a.alertsFired, ...ids])] }, ACTIVE_KEY);
  });
}

/** A finished session, as Review sees it. `id` is set once it's saved (always, unless Start Anything). */
export interface Finished extends Omit<Session, 'id' | 'taskId'> {
  id?: string;
  taskId: string | null;
}

/**
 * End Task. Closes any open pause, clears the active session and returns the result.
 * A task session is saved now; a Start Anything one is returned unsaved for "Add to tasks?" (fileSession).
 * `maxSec` (countdown): if the clock has passed it, the session ends exactly at the max.
 */
export async function end(now = Date.now(), maxSec?: number): Promise<Finished> {
  return db.transaction('rw', db.active, db.sessions, async () => {
    const a = await requireActive();
    // Ending while paused: the pause runs until the end; the clock was frozen at pausedAt.
    let endedAt = now;
    const elapsed = sessionElapsedMs(a, now);
    if (maxSec != null && a.pausedAt == null && elapsed > maxSec * 1000) endedAt = now - (elapsed - maxSec * 1000);
    const pauses = a.pausedAt != null ? [...a.pauses, { startedAt: a.pausedAt, endedAt }] : a.pauses;
    const finished: Finished = {
      taskId: a.taskId,
      startedAt: a.startedAt,
      endedAt,
      durationSec: msToSec(sessionElapsedMs({ ...a, pausedAt: null, pauses }, endedAt)),
      pauses,
    };
    if (a.windowMin) finished.windowMin = a.windowMin;
    await db.active.delete(ACTIVE_KEY);
    if (a.taskId != null) {
      const session: Session = { ...finished, id: newId(), taskId: a.taskId };
      await db.sessions.add(session);
      return session;
    }
    return finished;
  });
}

/** Save a Start Anything session under a task ("Add to tasks?"). */
export async function fileSession(f: Finished, taskId: string): Promise<Session> {
  const session: Session = { ...f, id: f.id ?? newId(), taskId };
  await db.sessions.put(session);
  return session;
}

/** X: nothing is saved. */
export const cancel = () => db.active.delete(ACTIVE_KEY);

export const deleteSession = (id: string) => db.sessions.delete(id);
