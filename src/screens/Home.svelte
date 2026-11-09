<script lang="ts">
  import TaskForm from '../components/TaskForm.svelte';
  import WindowPicker from '../components/WindowPicker.svelte';
  import { alerts } from '../lib/alerts/webAlertService';
  import { relativeDay } from '../lib/format';
  import { liveStats, liveTasks } from '../lib/live';
  import type { Task } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { start } from '../lib/services/sessionService';
  import { durationLabel } from '../lib/stats/stats';

  const tasks = liveTasks();
  const stats = liveStats();

  let windowMin = $state<number | undefined>(undefined);
  let editing = $state<Task | 'new' | null>(null);
  let showArchived = $state(false);
  let starting = false;

  const active = $derived(($tasks ?? []).filter((t) => !t.archived));
  const archived = $derived(($tasks ?? []).filter((t) => t.archived));

  async function go(taskId: string | null) {
    if (starting) return;
    starting = true;
    alerts.unlock(); // must happen inside the tap for iOS audio + speech
    try {
      await start({ taskId, windowMin, startSource: 'quick' });
    } finally {
      starting = false;
    }
  }
</script>

<div class="page">
  <header class="topbar">
    <h1>Habit Timer</h1>
    <div class="row">
      <button class="icon-btn" onclick={() => navigate('/history')}>History</button>
      <button class="icon-btn" onclick={() => navigate('/settings')} aria-label="Settings">⚙︎</button>
    </div>
  </header>

  <section class="start">
    <button class="quick" onclick={() => go(null)}>
      <span class="play">▶</span>
      <span>Start</span>
    </button>
    <WindowPicker bind:value={windowMin} />
  </section>

  <div class="row list-head">
    <h2 class="section-title grow">Tasks</h2>
    <button class="link" onclick={() => (editing = 'new')}>+ New</button>
  </div>

  {#if $tasks && active.length === 0}
    <p class="muted empty">No tasks yet. Start the stopwatch and name things afterwards, or add a task.</p>
  {/if}

  {#if active.length}
    <ul class="card list">
      {#each active as t (t.id)}
        {@const st = $stats?.get(t.id)}
        <li>
          <button class="task" onclick={() => go(t.id)}>
            <span class="name">{t.name}</span>
            <span class="meta muted small">
              {durationLabel(t, st)}
              {#if st?.lastDoneAt}· {relativeDay(st.lastDoneAt)}{/if}
              {#if st?.segmentCount}· {st.segmentCount}×{/if}
            </span>
          </button>
          <button class="icon-btn edit" onclick={() => (editing = t)} aria-label="Edit {t.name}">⋯</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if archived.length}
    <button class="link archived-toggle" onclick={() => (showArchived = !showArchived)}>
      {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
    </button>
    {#if showArchived}
      <ul class="card list">
        {#each archived as t (t.id)}
          <li>
            <span class="task muted"><span class="name">{t.name}</span></span>
            <button class="icon-btn edit" onclick={() => (editing = t)} aria-label="Edit {t.name}">⋯</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if editing}
  <TaskForm task={editing === 'new' ? undefined : editing} onclose={() => (editing = null)} />
{/if}

<style>
  h1 {
    font-size: 22px;
  }
  .start {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 28px 0 8px;
  }
  .quick {
    width: 184px;
    height: 184px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 26px;
    font-weight: 700;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .quick:active {
    transform: scale(0.97);
  }
  .play {
    font-size: 34px;
  }
  .list-head {
    margin: 24px 0 8px;
  }
  .list-head .section-title {
    margin: 0 4px;
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
  .task {
    flex: 1;
    min-width: 0;
    min-height: 60px;
    padding: 8px 4px 8px 16px;
    text-align: left;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .task:active {
    background: var(--surface-2);
  }
  .name {
    font-size: 17px;
    font-weight: 500;
  }
  .edit {
    font-size: 22px;
    margin-right: 4px;
  }
  .empty {
    padding: 0 4px;
    line-height: 1.4;
  }
  .archived-toggle {
    margin: 16px 0 8px;
  }
</style>
