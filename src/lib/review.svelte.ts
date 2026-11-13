import type { Finished } from './services/sessionService';

/**
 * The just-ended session shown on Review. In memory only: a task session is already saved at End Task;
 * an unfiled Start Anything session is lost on force-quit, same as skipping "Add to tasks?".
 */
export const review = $state<{ current: Finished | null; ending: boolean }>({ current: null, ending: false });
