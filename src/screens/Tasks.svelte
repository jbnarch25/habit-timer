<script lang="ts">
  import TaskForm from '../components/TaskForm.svelte';
  import { relativeDay } from '../lib/format';
  import { liveStats, liveTasks } from '../lib/live';
  import type { Task } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { durationLabel } from '../lib/stats/stats';

  const tasks = liveTasks();
  const stats = liveStats();

  let editing = $state<Task | 'new' | null>(null);
  let showArchived = $state(false);

  const active = $derived(($tasks ?? []).filter((t) => !t.archived));
  const archived = $derived(($tasks ?? []).filter((t) => t.archived));
</script>

<div class="page">
  <header class="topbar">
    <button class="icon-btn" onclick={() => navigate('/')}>‹ Start</button>
    <h1>Tasks</h1>
    <button class="link" onclick={() => (editing = 'new')}>+ New</button>
  </header>

  {#if $tasks && active.length === 0}
    <p class="muted empty">No tasks yet.</p>
  {/if}

  {#if active.length}
    <ul class="card list">
      {#each active as t (t.id)}
        {@const st = $stats?.get(t.id)}
        <li>
          <button class="task" onclick={() => (editing = t)}>
            <span class="name">{t.name}</span>
            <span class="meta muted small">
              {durationLabel(t, st)}
              {#if st?.lastDoneAt}· {relativeDay(st.lastDoneAt)}{/if}
              {#if st?.segmentCount}· {st.segmentCount}×{/if}
            </span>
          </button>
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
            <button class="task muted" onclick={() => (editing = t)}><span class="name">{t.name}</span></button>
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
    font-size: 18px;
  }
  .list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    overflow: hidden;
  }
  .list li + li {
    border-top: 1px solid var(--border);
  }
  .task {
    width: 100%;
    min-height: 60px;
    padding: 8px 16px;
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
  .empty {
    padding: 0 4px;
  }
  .archived-toggle {
    margin: 16px 0 8px;
  }
</style>
