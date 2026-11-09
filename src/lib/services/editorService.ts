import { db } from '../db';
import { newId } from '../id';
import type { Segment, Session } from '../model';
import { msToSec, sessionElapsedMs } from '../time/elapsed';

// Allocation editor: works in durations only. Any duration edit or new segment is source 'edited'.

export const sessionTotalSec = (s: Session) =>
  msToSec(sessionElapsedMs({ startedAt: s.startedAt, pausedAt: null, pauses: s.pauses }, s.endedAt));

export async function sessionSegments(sessionId: string): Promise<Segment[]> {
  return db.segments.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

/** Positive = unallocated time; negative = over-allocated (concurrency), which is allowed. */
export const remainderSec = (session: Session, segments: Segment[]) =>
  sessionTotalSec(session) - segments.reduce((sum, s) => sum + s.durationSec, 0);

export const assignTask = (segmentId: string, taskId: string | null) => db.segments.update(segmentId, { taskId });

export async function setDuration(segmentId: string, durationSec: number): Promise<void> {
  await db.segments.where('id').equals(segmentId).modify((s) => {
    s.durationSec = Math.max(0, Math.round(durationSec));
    s.source = 'edited';
    delete s.startedAt;
  });
}

export async function addSegment(
  sessionId: string,
  durationSec: number,
  taskId: string | null = null,
): Promise<Segment> {
  return db.transaction('rw', db.segments, async () => {
    const existing = await sessionSegments(sessionId);
    const seg: Segment = {
      id: newId(),
      sessionId,
      order: existing.length ? existing[existing.length - 1].order + 1 : 0,
      taskId,
      durationSec: Math.max(0, Math.round(durationSec)),
      completed: true,
      source: 'edited',
      excluded: false,
    };
    await db.segments.add(seg);
    return seg;
  });
}

export const setCompleted = (segmentId: string, completed: boolean) => db.segments.update(segmentId, { completed });
export const setExcluded = (segmentId: string, excluded: boolean) => db.segments.update(segmentId, { excluded });
export const deleteSegment = (segmentId: string) => db.segments.delete(segmentId);
