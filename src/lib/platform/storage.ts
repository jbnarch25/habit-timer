import { getSettings, updateSettings } from '../services/settingsService';

/** Ask once, on first launch, for durable storage so iOS doesn't evict IndexedDB. */
export async function requestPersistenceOnce(): Promise<void> {
  const settings = await getSettings();
  if (settings.persistRequested) return;
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* unsupported */
  }
  await updateSettings({ persistRequested: true });
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}
