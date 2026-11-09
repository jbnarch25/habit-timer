import type { Segment, Session, Task } from '../model';

export const MEDIAN_SAMPLE = 10;
export const MIN_QUALIFYING_SEC = 30;

export interface TaskStats {
  medianSec: number | null; // from history only
  sampleSize: number;
  lastDoneAt: number | null; // startedAt of the session holding the most recent completed segment
  lastUsedAt: number | null; // startedAt of the most recent session with any segment of the task
  segmentCount: number;
  sessionCount: number;
}

/** Index sessions by id, dropping discarded ones: they never count toward anything. */
export function liveSessionMap(sessions: Session[]): Map<string, Session> {
  const m = new Map<string, Session>();
  for (const s of sessions) if (!s.discarded) m.set(s.id, s);
  return m;
}

export function isQualifying(seg: Segment, task: Task): boolean {
  if (seg.excluded) return false;
  if (seg.durationSec < MIN_QUALIFYING_SEC) return false;
  if (task.durationMode === 'fixed' && !seg.completed) return false;
  return true;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Stats for every task in one pass. `sessions` may include discarded ones; they're ignored. */
export function computeAllStats(tasks: Task[], sessions: Session[], segments: Segment[]): Map<string, TaskStats> {
  const sessionMap = liveSessionMap(sessions);
  const byTask = new Map<string, Segment[]>();
  for (const seg of segments) {
    if (seg.taskId == null || !sessionMap.has(seg.sessionId)) continue;
    const list = byTask.get(seg.taskId);
    if (list) list.push(seg);
    else byTask.set(seg.taskId, [seg]);
  }
  const chronological = (a: Segment, b: Segment) =>
    sessionMap.get(a.sessionId)!.startedAt - sessionMap.get(b.sessionId)!.startedAt || a.order - b.order;

  const result = new Map<string, TaskStats>();
  for (const task of tasks) {
    const segs = (byTask.get(task.id) ?? []).sort(chronological);
    const qualifying = segs.filter((s) => isQualifying(s, task)).slice(-MEDIAN_SAMPLE);
    const lastCompleted = [...segs].reverse().find((s) => s.completed);
    result.set(task.id, {
      medianSec: median(qualifying.map((s) => s.durationSec)),
      sampleSize: qualifying.length,
      lastDoneAt: lastCompleted ? sessionMap.get(lastCompleted.sessionId)!.startedAt : null,
      lastUsedAt: segs.length ? sessionMap.get(segs[segs.length - 1].sessionId)!.startedAt : null,
      segmentCount: segs.length,
      sessionCount: new Set(segs.map((s) => s.sessionId)).size,
    });
  }
  return result;
}

/** Expected duration for alerts: history median, else a fixed task's estimate. Null for flexible w/o history. */
export function expectedSec(task: Task, stats: TaskStats | undefined): number | null {
  if (stats?.medianSec != null) return stats.medianSec;
  if (task.durationMode === 'fixed' && task.estimateMin != null) return task.estimateMin * 60;
  return null;
}

// ---- Window fit (shared with the future picker) ----

/** Typical duration in minutes: history median, else estimate, else unknown (null). */
export function typicalMin(task: Task, stats: TaskStats | undefined): number | null {
  if (stats?.medianSec != null) return stats.medianSec / 60;
  return task.estimateMin ?? null;
}

export type Fit = 'fits' | 'no' | 'unknown';

/** Fixed: typical ≤ W (unknown → 'unknown'). Flexible: (minMin ?? 0) ≤ W. A window with nothing left (W ≤ 0) fits nothing. */
export function fitsWindow(task: Task, stats: TaskStats | undefined, W: number): Fit {
  if (task.durationMode === 'fixed') {
    const t = typicalMin(task, stats);
    if (t == null) return 'unknown';
    return W > 0 && t <= W ? 'fits' : 'no';
  }
  return W > 0 && (task.minMin ?? 0) <= W ? 'fits' : 'no';
}

/** How much of W the task would fill. Fixed: typical (0 if unknown). Flexible: min(maxMin ?? W, W). */
export function fillMin(task: Task, stats: TaskStats | undefined, W: number): number {
  if (task.durationMode === 'fixed') return typicalMin(task, stats) ?? 0;
  return Math.max(0, Math.min(task.maxMin ?? W, W));
}

/** Short label for lists: "≈ 25 min", "est. 7 min", "10–30 min", "10 min+ · open-ended". */
export function durationLabel(task: Task, stats: TaskStats | undefined): string {
  if (stats?.medianSec != null) return `≈ ${Math.max(1, Math.round(stats.medianSec / 60))} min`;
  if (task.durationMode === 'fixed') return task.estimateMin != null ? `est. ${task.estimateMin} min` : 'no history yet';
  const min = task.minMin;
  if (task.maxMin != null) return `${min ?? 0}–${task.maxMin} min`;
  return min ? `${min} min+ · open-ended` : 'open-ended';
}
