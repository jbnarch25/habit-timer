import { db } from '../db';
import { newId } from '../id';
import type { Segment, Session } from '../model';
import { msToSec, sessionElapsedMs } from '../time/elapsed';

// Allocation editor (chunk 3). Order and assignment live in the log; durations live in the bar.
// Zero-sum by construction: every duration change moves time between two segments, so the
// total never changes. All edit logic is pure (Segment[] in, Segment[] out) and returns the
// SAME array reference when nothing changed, so callers can skip persisting no-ops.
//
// Stamping (owner decisions): every change sets editedAt; only duration changes set
// source 'edited'; startedAt is never removed.

export const sessionTotalSec = (s: Session) =>
  msToSec(sessionElapsedMs({ startedAt: s.startedAt, pausedAt: null, pauses: s.pauses }, s.endedAt));

export async function sessionSegments(sessionId: string): Promise<Segment[]> {
  return db.segments.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

/** Neutral review delta vs. the window: total − window, in seconds. Null when no window (∞). */
export const windowDeltaSec = (session: Session) =>
  session.windowMin ? sessionTotalSec(session) - session.windowMin * 60 : null;

// ---------- helpers ----------

export const sumSec = (segs: Segment[]) => segs.reduce((a, s) => a + s.durationSec, 0);

/** Bar length: the session total, or the segment sum for legacy over-allocated sessions. */
export const barLengthSec = (segs: Segment[], totalSec: number) => Math.max(totalSec, sumSec(segs));

/** Interim snap rule: 1-minute steps; 5-second steps when the bar is under 5 minutes. */
export const snapStep = (lengthSec: number) => (lengthSec < 300 ? 5 : 60);

/** A segment's floor: one step, or its current size if it's already smaller (it can grow, never shrink). */
export const minFor = (s: Segment, step: number) => Math.min(s.durationSec, step);

const stamp = (s: Segment, now: number): Segment => ({ ...s, editedAt: now });
const stampDuration = (s: Segment, durationSec: number, now: number): Segment => ({
  ...s,
  durationSec,
  source: 'edited',
  editedAt: now,
});

/** Rewrite order to 0..n−1, stamping segments whose order changed. */
function renumber(segs: Segment[], now: number): Segment[] {
  return segs.map((s, i) => (s.order === i ? s : { ...s, order: i, editedAt: now }));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------- virtual remainder ----------

/** Id prefix for the in-memory remainder segment; replaced by a real id when first persisted. */
export const VIRTUAL_PREFIX = 'virtual:';
export const isVirtual = (s: Segment) => s.id.startsWith(VIRTUAL_PREFIX);

/**
 * Sessions whose segments sum to less than the total (chunks 1–2) show the gap as an untitled
 * segment at the end. It is virtual: nothing is written until the first real edit.
 */
export function withRemainder(segs: Segment[], sessionId: string, totalSec: number): Segment[] {
  const gap = totalSec - sumSec(segs);
  if (gap <= 0) return segs;
  return [
    ...segs,
    {
      id: `${VIRTUAL_PREFIX}${sessionId}`,
      sessionId,
      order: segs.length ? segs[segs.length - 1].order + 1 : 0,
      taskId: null,
      durationSec: gap,
      completed: true,
      source: 'edited',
      excluded: false,
    },
  ];
}

// ---------- pure edits ----------

/**
 * Drag the divider after segs[i]. The LEFT segment's duration snaps to a multiple of `step`;
 * the right neighbor takes the difference (keeping odd seconds). Both respect minFor.
 */
export function moveDivider(segs: Segment[], i: number, targetLeftSec: number, step: number, now: number): Segment[] {
  const left = segs[i];
  const right = segs[i + 1];
  if (!left || !right) return segs;
  const pair = left.durationSec + right.durationSec;
  const lo = minFor(left, step);
  const hi = pair - minFor(right, step);
  if (lo > hi) return segs;
  const next = clamp(Math.round(targetLeftSec / step) * step, lo, hi);
  if (next === left.durationSec) return segs;
  const out = [...segs];
  out[i] = stampDuration(left, next, now);
  out[i + 1] = stampDuration(right, pair - next, now);
  return out;
}

/** Neighbor that absorbs an exact edit: the next segment, or the previous one for the last. */
const neighborIndex = (segs: Segment[], i: number) => (i < segs.length - 1 ? i + 1 : i - 1);

/** Largest exact duration a segment may take (neighbor keeps min(its size, one step)). */
export function maxExactSec(segs: Segment[], id: string, step: number): number {
  const i = segs.findIndex((s) => s.id === id);
  if (i < 0) return 0;
  const j = neighborIndex(segs, i);
  if (j < 0) return segs[i].durationSec; // only segment: total is fixed
  return segs[i].durationSec + segs[j].durationSec - minFor(segs[j], step);
}

/** Exact (unsnapped) duration, zero-sum against the neighbor. Never below 1 s; typing never deletes. */
export function setDurationExact(segs: Segment[], id: string, sec: number, step: number, now: number): Segment[] {
  const i = segs.findIndex((s) => s.id === id);
  if (i < 0) return segs;
  const j = neighborIndex(segs, i);
  if (j < 0) return segs;
  const next = clamp(Math.round(sec), 1, maxExactSec(segs, id, step));
  const diff = next - segs[i].durationSec;
  if (diff === 0) return segs;
  const out = [...segs];
  out[i] = stampDuration(segs[i], next, now);
  out[j] = stampDuration(segs[j], segs[j].durationSec - diff, now);
  return out;
}

export const canSplit = (s: Segment, step: number) => s.durationSec >= 2 * step;

/** Exact halves; the new untitled half goes right after it. Refused under 2 steps. */
export function splitSegment(segs: Segment[], id: string, step: number, now: number, makeId = newId): Segment[] {
  const i = segs.findIndex((s) => s.id === id);
  if (i < 0 || !canSplit(segs[i], step)) return segs;
  const s = segs[i];
  const keep = Math.ceil(s.durationSec / 2);
  const half: Segment = {
    id: makeId(),
    sessionId: s.sessionId,
    order: s.order + 1,
    taskId: null,
    durationSec: s.durationSec - keep,
    completed: true,
    source: 'edited',
    editedAt: now,
    excluded: false,
  };
  return renumber([...segs.slice(0, i), stampDuration(s, keep, now), half, ...segs.slice(i + 1)], now);
}

/**
 * Named → unassign in place (time stays). Untitled → merge into the segment above
 * (below if it's first). The only segment can't be merged away.
 */
export function deleteSegment(segs: Segment[], id: string, now: number): Segment[] {
  const i = segs.findIndex((s) => s.id === id);
  if (i < 0) return segs;
  const s = segs[i];
  if (s.taskId != null) return assign(segs, id, null, now);
  if (segs.length === 1) return segs;
  const j = i > 0 ? i - 1 : i + 1;
  const out = [...segs];
  out[j] = stampDuration(segs[j], segs[j].durationSec + s.durationSec, now);
  out.splice(i, 1);
  return renumber(out, now);
}

export const canDelete = (segs: Segment[], s: Segment) => s.taskId != null || segs.length > 1;

export function reorder(segs: Segment[], from: number, to: number, now: number): Segment[] {
  if (from === to || from < 0 || to < 0 || from >= segs.length || to >= segs.length) return segs;
  const out = [...segs];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return renumber(out, now);
}

function patch(segs: Segment[], id: string, changes: Partial<Segment>, now: number): Segment[] {
  const i = segs.findIndex((s) => s.id === id);
  if (i < 0) return segs;
  const s = segs[i];
  if (Object.entries(changes).every(([k, v]) => s[k as keyof Segment] === v)) return segs;
  const out = [...segs];
  out[i] = stamp({ ...s, ...changes }, now);
  return out;
}

export const assign = (segs: Segment[], id: string, taskId: string | null, now: number) => patch(segs, id, { taskId }, now);
export const setCompleted = (segs: Segment[], id: string, completed: boolean, now: number) =>
  patch(segs, id, { completed }, now);
export const setExcluded = (segs: Segment[], id: string, excluded: boolean, now: number) =>
  patch(segs, id, { excluded }, now);

// ---------- persistence ----------

/**
 * Persist an edited segment list for a session: writes changed/new rows, deletes removed ones,
 * in one transaction. A virtual remainder still present is written as a real untitled segment.
 * Only call with the result of an edit that actually changed something.
 */
export async function applyEdit(sessionId: string, after: Segment[], now = Date.now()): Promise<void> {
  await db.transaction('rw', db.segments, async () => {
    const existing = new Map((await sessionSegments(sessionId)).map((s) => [s.id, s]));
    const keep = new Set<string>();
    const puts: Segment[] = [];
    for (const s of after) {
      if (isVirtual(s)) {
        puts.push({ ...s, id: newId(), source: 'edited', editedAt: s.editedAt ?? now });
        continue;
      }
      keep.add(s.id);
      const prev = existing.get(s.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(s)) puts.push(s);
    }
    const deletes = [...existing.keys()].filter((id) => !keep.has(id));
    if (puts.length) await db.segments.bulkPut(puts);
    if (deletes.length) await db.segments.bulkDelete(deletes);
  });
}
