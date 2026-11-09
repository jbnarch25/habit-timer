import { db, SETTINGS_KEY } from '../db';
import { DEFAULT_SETTINGS, type Settings } from '../model';

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(changes: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await getSettings()), ...changes };
    await db.settings.put(next, SETTINGS_KEY);
    return next;
  });
}
