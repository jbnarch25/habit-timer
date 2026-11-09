import { db } from '../db';
import { newId } from '../id';
import type { DurationMode, Task } from '../model';

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'archived' | 'medianAlert'> & {
  medianAlert?: boolean;
};

/** Median alert defaults: on for fixed tasks, off for flexible ones. */
export const defaultMedianAlert = (mode: DurationMode) => mode === 'fixed';

export async function createTask(input: TaskInput, now = Date.now()): Promise<Task> {
  const task: Task = {
    ...input,
    name: input.name.trim(),
    medianAlert: input.medianAlert ?? defaultMedianAlert(input.durationMode),
    archived: false,
    id: newId(),
    createdAt: now,
  };
  await db.tasks.add(task);
  return task;
}

export async function updateTask(id: string, changes: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<void> {
  if (changes.name != null) changes.name = changes.name.trim();
  await db.tasks.update(id, changes);
}

export const setArchived = (id: string, archived: boolean) => db.tasks.update(id, { archived });

export async function allTasks(): Promise<Task[]> {
  const tasks = await db.tasks.toArray();
  return tasks.sort((a, b) => a.name.localeCompare(b.name));
}
