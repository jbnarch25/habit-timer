// PLACEHOLDER (owner-approved): tasks have no color field, so a stable hue is derived from the
// task id. Nothing is stored. Untitled segments use the neutral surface color.

export function taskHue(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  return h % 360;
}

export const taskColor = (taskId: string | null) =>
  taskId == null ? 'var(--surface-2)' : `hsl(${taskHue(taskId)} 55% 52%)`;
