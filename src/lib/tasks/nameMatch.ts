import type { Task } from '../model';

/** Names compare case-insensitively with surrounding/repeated whitespace ignored. */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Display form of a typed name: trimmed, inner whitespace collapsed, case kept. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

export const findByName = (tasks: Task[], name: string): Task | undefined => {
  const n = normalizeName(name);
  return n ? tasks.find((t) => normalizeName(t.name) === n) : undefined;
};

/**
 * Fuzzy score of `query` against `name`; null = no match. Lower is better.
 * Exact < prefix < word-prefix < substring < in-order subsequence (scored by gap size).
 */
export function fuzzyScore(query: string, name: string): number | null {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q) return null;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(' ').some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  let gaps = 0;
  let j = 0;
  for (let i = 0; i < n.length && j < q.length; i++) {
    if (n[i] === q[j]) j++;
    else if (j > 0) gaps++;
  }
  return j === q.length ? 4 + gaps : null;
}

/** Fuzzy matches for the task-name combobox: best first, archived tasks after all active ones. */
export function matchTasks(tasks: Task[], query: string, limit = 6): Task[] {
  return tasks
    .map((t) => ({ t, score: fuzzyScore(query, t.name) }))
    .filter((x): x is { t: Task; score: number } => x.score != null)
    .sort(
      (a, b) =>
        Number(a.t.archived) - Number(b.t.archived) || a.score - b.score || a.t.name.localeCompare(b.t.name),
    )
    .slice(0, limit)
    .map((x) => x.t);
}
