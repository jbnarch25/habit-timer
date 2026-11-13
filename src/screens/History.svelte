<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { db } from '../lib/db';
  import { formatDate, formatDuration, formatTime } from '../lib/format';
  import { live, liveTasks, taskMap } from '../lib/live';
  import type { Session } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { deleteSession } from '../lib/services/sessionService';

  interface Day {
    label: string;
    sessions: Session[];
  }

  const tasks = liveTasks();
  const days = live(async (): Promise<Day[]> => {
    const sessions = await db.sessions.orderBy('startedAt').reverse().toArray();
    const out: Day[] = [];
    for (const s of sessions) {
      const label = formatDate(s.startedAt);
      let day = out[out.length - 1];
      if (!day || day.label !== label) out.push((day = { label, sessions: [] }));
      day.sessions.push(s);
    }
    return out;
  });

  const tasksById = $derived(taskMap($tasks));
  let menuFor = $state<Session | null>(null);

  async function doDelete() {
    const s = menuFor!;
    menuFor = null;
    await deleteSession(s.id);
  }
</script>

<div class="page">
  <header class="topbar">
    <button class="icon-btn" onclick={() => navigate('/')}>‹ Start</button>
    <h1>History</h1>
    <span style="width:44px"></span>
  </header>

  {#if $days && $days.length === 0}
    <p class="muted">No sessions yet.</p>
  {/if}

  {#each $days ?? [] as day (day.label)}
    <h2 class="section-title">{day.label}</h2>
    <ul class="card list">
      {#each day.sessions as s (s.id)}
        <li>
          <div class="info">
            <div class="muted small">{formatTime(s.startedAt)}{s.windowMin ? ` · ${s.windowMin} min window` : ''}</div>
            <div class="main">
              <span class="grow">{tasksById.get(s.taskId)?.name ?? ''}</span>
              <span class="tabular">{formatDuration(s.durationSec)}</span>
            </div>
          </div>
          <button class="more-btn" onclick={() => (menuFor = s)} aria-label="More">…</button>
        </li>
      {/each}
    </ul>
  {/each}
</div>

{#if menuFor}
  <ConfirmDialog
    message="{tasksById.get(menuFor.taskId)?.name ?? ''} · {formatDuration(menuFor.durationSec)} · {formatDate(menuFor.startedAt)} {formatTime(menuFor.startedAt)}"
    confirmLabel="Delete session"
    danger
    onconfirm={doDelete}
    oncancel={() => (menuFor = null)}
  />
{/if}

<style>
  h1 {
    font-size: 18px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .list li {
    display: flex;
    align-items: center;
  }
  .list li + li {
    border-top: 1px solid var(--border);
  }
  .info {
    flex: 1;
    min-width: 0;
    padding: 8px 4px 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .main {
    display: flex;
    gap: 8px;
    font-size: 17px;
    font-weight: 600;
  }
</style>
