import { liveQuery } from 'dexie';
import { readable, type Readable } from 'svelte/store';
import { db } from './db';
import type { Task } from './model';
import { computeAllStats, type TaskStats } from './stats/stats';
import { getSettings } from './services/settingsService';

/** A Dexie liveQuery as a Svelte store. `undefined` until the first result arrives. */
export function live<T>(query: () => T | Promise<T>): Readable<T | undefined> {
  return readable<T | undefined>(undefined, (set) => {
    const sub = liveQuery(query).subscribe({ next: set, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  });
}

export const liveTasks = () => live(() => db.tasks.toArray().then((ts) => ts.sort((a, b) => a.name.localeCompare(b.name))));

export const liveSettings = () => live(getSettings);

/**
 * Derived on read from all raw data (small, personal-scale data set).
 * `excludeSessionId` leaves one session out, e.g. so Review compares against the typical time before it.
 */
export const liveStats = (excludeSessionId?: string) =>
  live(async (): Promise<Map<string, TaskStats>> => {
    const [tasks, sessions] = await Promise.all([db.tasks.toArray(), db.sessions.toArray()]);
    return computeAllStats(
      tasks,
      excludeSessionId ? sessions.filter((s) => s.id !== excludeSessionId) : sessions,
    );
  });

export const taskMap = (tasks: Task[] | undefined) => new Map((tasks ?? []).map((t) => [t.id, t]));
