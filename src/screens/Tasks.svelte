<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Sheet from '../components/Sheet.svelte';
  import TaskForm from '../components/TaskForm.svelte';
  import { formatDuration, relativeDay } from '../lib/format';
  import { liveStats, liveTasks } from '../lib/live';
  import type { Task } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { deleteTask, sessionCount, setArchived } from '../lib/services/taskService';
  import { matchTasks } from '../lib/tasks/nameMatch';

  const tasks = liveTasks();
  const stats = liveStats();

  let editing = $state<Task | 'new' | null>(null);
  let menuFor = $state<Task | null>(null);
  let confirmDelete = $state<{ task: Task; count: number } | null>(null);
  let showArchived = $state(false);
  let query = $state('');

  const pool = $derived(($tasks ?? []).filter((t) => t.archived === showArchived));
  const list = $derived(query.trim() ? matchTasks(pool, query, Infinity) : pool);
  const archivedCount = $derived(($tasks ?? []).filter((t) => t.archived).length);

  function meta(t: Task): string {
    const st = $stats?.get(t.id);
    const parts: string[] = [];
    if (t.minChunkMin != null) parts.push(`chunk ${t.minChunkMin}m`);
    if (t.goalMin != null) parts.push(`goal ${t.goalMin}m`);
    if (t.maxMin != null) parts.push(`max ${t.maxMin}m`);
    if (st?.medianSec != null) parts.push(`usually ${formatDuration(st.medianSec)}`);
    parts.push(st?.lastDoneAt ? `${relativeDay(st.lastDoneAt)} · ${st.sessionCount}×` : 'never done');
    return parts.join(' · ');
  }

  function edit() {
    editing = menuFor;
    menuFor = null;
  }

  async function toggleArchive() {
    const t = menuFor!;
    menuFor = null;
    await setArchived(t.id, !t.archived);
  }

  async function askDelete() {
    const t = menuFor!;
    menuFor = null;
    confirmDelete = { task: t, count: await sessionCount(t.id) };
  }

  async function doDelete() {
    const t = confirmDelete!.task;
    confirmDelete = null;
    await deleteTask(t.id);
  }

  const deleteMessage = (d: { task: Task; count: number }) =>
    d.count === 0
      ? `Delete ${d.task.name}?`
      : `Delete ${d.task.name} and its ${d.count} session${d.count === 1 ? '' : 's'}?`;
</script>

<div class="page">
  <header class="topbar">
    <button class="icon-btn" onclick={() => navigate('/')}>‹ Start</button>
    <h1>Tasks</h1>
    <button class="add" onclick={() => (editing = 'new')} aria-label="New task">+</button>
  </header>

  <input class="search" type="search" placeholder="Search" bind:value={query} autocomplete="off" />

  <div class="segmented filter">
    <button class:on={!showArchived} onclick={() => (showArchived = false)}>Active</button>
    <button class:on={showArchived} onclick={() => (showArchived = true)}>Archived ({archivedCount})</button>
  </div>

  {#if $tasks && list.length === 0}
    <p class="muted empty">
      {query.trim() ? 'No matches.' : showArchived ? 'No archived tasks.' : 'No tasks yet. Tap + to add one.'}
    </p>
  {:else}
    <ul class="card list">
      {#each list as t (t.id)}
        <li>
          <button class="task" onclick={() => (editing = t)}>
            <span class="name">{t.name}</span>
            <span class="muted small">{meta(t)}</span>
          </button>
          <button class="more-btn" onclick={() => (menuFor = t)} aria-label="More for {t.name}">…</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if menuFor}
  <Sheet title={menuFor.name} onclose={() => (menuFor = null)}>
    <div class="menu">
      <button class="btn block" onclick={edit}>Edit</button>
      <button class="btn block" onclick={toggleArchive}>{menuFor.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="btn block danger" onclick={askDelete}>Delete</button>
    </div>
  </Sheet>
{/if}

{#if confirmDelete}
  <ConfirmDialog
    message={deleteMessage(confirmDelete)}
    confirmLabel="Delete"
    danger
    onconfirm={doDelete}
    oncancel={() => (confirmDelete = null)}
  />
{/if}

{#if editing}
  <TaskForm task={editing === 'new' ? undefined : editing} onclose={() => (editing = null)} />
{/if}

<style>
  h1 {
    font-size: 18px;
  }
  .add {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 32px;
    font-weight: 400;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .search {
    margin-top: 8px;
  }
  .filter {
    margin: 10px 0;
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
  .empty {
    padding: 0 4px;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
