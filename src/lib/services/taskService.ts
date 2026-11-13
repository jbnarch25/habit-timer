import { db } from '../db';
import { newId } from '../id';
import type { Task } from '../model';
import { cleanName, findByName } from '../tasks/nameMatch';

export type TaskProps = Pick<Task, 'minChunkMin' | 'goalMin' | 'maxMin'> & { taskAlert?: boolean };

export class DuplicateNameError extends Error {
  constructor(public existing: Task) {
    super(`A task named "${existing.name}" already exists.`);
  }
}

/** Drop absent optional fields so stored records stay clean. */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

export async function createTask(name: string, props: TaskProps = {}, now = Date.now()): Promise<Task> {
  return db.transaction('rw', db.tasks, async () => {
    const n = cleanName(name);
    if (!n) throw new Error('Task name is required.');
    const existing = findByName(await db.tasks.toArray(), n);
    if (existing) throw new DuplicateNameError(existing);
    const task: Task = clean({
      id: newId(),
      name: n,
      minChunkMin: props.minChunkMin,
      goalMin: props.goalMin,
      maxMin: props.maxMin,
      taskAlert: props.taskAlert ?? false,
      archived: false,
      createdAt: now,
    });
    await db.tasks.add(task);
    return task;
  });
}

/**
 * The combobox rule: an exact name match (ignoring case/whitespace) selects the existing task,
 * un-archiving it if needed; otherwise a new task is created.
 */
export async function resolveTaskName(name: string, now = Date.now()): Promise<Task> {
  return db.transaction('rw', db.tasks, async () => {
    const existing = findByName(await db.tasks.toArray(), name);
    if (!existing) return createTask(name, {}, now);
    if (existing.archived) {
      await db.tasks.update(existing.id, { archived: false });
      return { ...existing, archived: false };
    }
    return existing;
  });
}

/** Full-property save from the Tasks tab sheet. Cleared optional properties are removed. */
export async function saveTask(id: string, name: string, props: TaskProps): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) throw new Error('Task not found.');
    const n = cleanName(name);
    if (!n) throw new Error('Task name is required.');
    const clash = findByName(await db.tasks.toArray(), n);
    if (clash && clash.id !== id) throw new DuplicateNameError(clash);
    await db.tasks.put(
      clean({
        ...task,
        name: n,
        minChunkMin: props.minChunkMin,
        goalMin: props.goalMin,
        maxMin: props.maxMin,
        taskAlert: props.taskAlert ?? task.taskAlert,
      }),
    );
  });
}

export const setArchived = (id: string, archived: boolean) => db.tasks.update(id, { archived });

export const sessionCount = (taskId: string) => db.sessions.where('taskId').equals(taskId).count();

/** Delete a task and all of its sessions (a running session on it is left alone). */
export async function deleteTask(id: string): Promise<number> {
  return db.transaction('rw', db.tasks, db.sessions, async () => {
    const n = await db.sessions.where('taskId').equals(id).delete();
    await db.tasks.delete(id);
    return n;
  });
}
