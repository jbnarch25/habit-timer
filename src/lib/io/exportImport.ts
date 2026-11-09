import { db } from '../db';
import type { ExportFile } from '../model';

export async function buildExport(now = Date.now()): Promise<ExportFile> {
  const [tasks, sessions, segments, pickerEvents] = await Promise.all([
    db.tasks.toArray(),
    db.sessions.toArray(),
    db.segments.toArray(),
    db.pickerEvents.toArray(),
  ]);
  return { schemaVersion: 1, exportedAt: now, tasks, sessions, segments, pickerEvents };
}

export function parseExport(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const d = data as Partial<ExportFile>;
  if (d?.schemaVersion !== 1) throw new Error(`Unsupported schemaVersion: ${String(d?.schemaVersion)}`);
  for (const key of ['tasks', 'sessions', 'segments', 'pickerEvents'] as const) {
    if (!Array.isArray(d[key])) throw new Error(`Missing "${key}" array.`);
  }
  // Older/hand-made files may predate `discarded`.
  d.sessions = d.sessions!.map((s) => ({ ...s, discarded: s.discarded ?? false }));
  return d as ExportFile;
}

/** Replace-all import. Also clears any running session (it would reference replaced data). */
export async function importReplaceAll(file: ExportFile): Promise<void> {
  await db.transaction('rw', [db.tasks, db.sessions, db.segments, db.pickerEvents, db.activeSession], async () => {
    await Promise.all([
      db.tasks.clear(),
      db.sessions.clear(),
      db.segments.clear(),
      db.pickerEvents.clear(),
      db.activeSession.clear(),
    ]);
    await db.tasks.bulkAdd(file.tasks);
    await db.sessions.bulkAdd(file.sessions);
    await db.segments.bulkAdd(file.segments);
    await db.pickerEvents.bulkAdd(file.pickerEvents);
  });
}

export function exportFilename(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `habit-timer-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Share sheet with a file where supported (iOS), otherwise a regular download. */
export async function shareOrDownload(file: ExportFile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = exportFilename(file.exportedAt);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const f = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [f] })) {
    try {
      await navigator.share({ files: [f], title: name });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
