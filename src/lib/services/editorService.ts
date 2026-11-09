import { db } from '../db';
import { newId } from '../id';
import type { Segment, Session } from '../model';
import { msToSec, sessionElapsedMs } from '../time/elapsed';

// Allocation editor: works in durations only. Zero-sum: segments never sum to more than the session
// total (interim enforcement = clamping; see SPEC open question on allocation UX).
// Every manual edit stamps editedAt; duration edits and new segments are source 'edited'.

export const sessionTotalSec = (s: Session) =>
  msToSec(sessionElapsedMs({ startedAt: s.startedAt, pausedAt: null, pauses: s.pauses }, s.endedAt));

export async function sessionSegments(sessionId: string): Promise<Segment[]> {
  return db.segments.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

/** Unallocated time. Can only be negative for chunk-1 sessions that were over-allocated. */
export const remainderSec = (session: Session, segments: Segment[]) =>
  sessionTotalSec(session) - segments.reduce((sum, s) => sum + s.durationSec, 0);

/** Largest duration a segment may take: total − Σ other segments (never below 0). */
export function maxDurationFor(session: Session, segments: Segment[], segmentId: string): number {
  const others = segments.reduce((sum, s) => (s.id === segmentId ? sum : sum + s.durationSec), 0);
  return Math.max(0, sessionTotalSec(session) - others);
}

const stamp = (now = Date.now()) => ({ editedAt: now });

export const assignTask = (segmentId: string, taskId: string | null) =>
  db.segments.update(segmentId, { taskId, ...stamp() });

export async function setDuration(segmentId: string, durationSec: number): Promise<void> {
  await db.transaction('rw', db.segments, db.sessions, async () => {
    const seg = await db.segments.get(segmentId);
    if (!seg) return;
    const session = await db.sessions.get(seg.sessionId);
    if (!session) return;
    const max = maxDurationFor(session, await sessionSegments(seg.sessionId), segmentId);
    const clamped = Math.min(max, Math.max(0, Math.round(durationSec)));
    await db.segments.where('id').equals(segmentId).modify((s) => {
      s.durationSec = clamped;
      s.source = 'edited';
      s.editedAt = Date.now();
      delete s.startedAt;
    });
  });
}

/** Materialize (part of) the unallocated remainder as a new segment. Capped at the remainder. */
export async function addSegment(sessionId: string, durationSec: number, taskId: string | null = null): Promise<Segment | null> {
  return db.transaction('rw', db.segments, db.sessions, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const existing = await sessionSegments(sessionId);
    const dur = Math.min(remainderSec(session, existing), Math.max(0, Math.round(durationSec)));
    if (dur <= 0) return null;
    const seg: Segment = {
      id: newId(),
      sessionId,
      order: existing.length ? existing[existing.length - 1].order + 1 : 0,
      taskId,
      durationSec: dur,
      completed: true,
      source: 'edited',
      ...stamp(),
      excluded: false,
    };
    await db.segments.add(seg);
    return seg;
  });
}

export const setCompleted = (segmentId: string, completed: boolean) =>
  db.segments.update(segmentId, { completed, ...stamp() });
export const setExcluded = (segmentId: string, excluded: boolean) =>
  db.segments.update(segmentId, { excluded, ...stamp() });
export const deleteSegment = (segmentId: string) => db.segments.delete(segmentId);

/** Neutral review delta vs. the window: total − window, in seconds. Null when no window (∞). */
export const windowDeltaSec = (session: Session) =>
  session.windowMin ? sessionTotalSec(session) - session.windowMin * 60 : null;
