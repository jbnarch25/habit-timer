<script lang="ts">
  import type { DurationMode, Task } from '../lib/model';
  import { createTask } from '../lib/services/taskService';
  import Sheet from './Sheet.svelte';

  let {
    tasks,
    title = 'Choose task',
    allowUntitled = true,
    onpick,
    onclose,
  }: {
    tasks: Task[];
    title?: string;
    allowUntitled?: boolean;
    onpick: (taskId: string | null) => void;
    onclose: () => void;
  } = $props();

  let filter = $state('');
  let mode = $state<DurationMode>('fixed');

  const visible = $derived(
    tasks.filter((t) => !t.archived && t.name.toLowerCase().includes(filter.trim().toLowerCase())),
  );
  const exact = $derived(tasks.some((t) => !t.archived && t.name.toLowerCase() === filter.trim().toLowerCase()));

  async function createAndPick() {
    const name = filter.trim();
    if (!name) return;
    const task = await createTask({ name, durationMode: mode });
    onpick(task.id);
  }
</script>

<Sheet {title} {onclose}>
  <input
    type="text"
    placeholder="Search or create a task"
    bind:value={filter}
    autocomplete="off"
    enterkeyhint="done"
    onkeydown={(e) => e.key === 'Enter' && !exact && createAndPick()}
  />

  {#if filter.trim() && !exact}
    <div class="create card">
      <div class="segmented">
        <button class:on={mode === 'fixed'} onclick={() => (mode = 'fixed')}>Fixed</button>
        <button class:on={mode === 'flexible'} onclick={() => (mode = 'flexible')}>Flexible</button>
      </div>
      <button class="btn primary block" onclick={createAndPick}>Create “{filter.trim()}”</button>
    </div>
  {/if}

  <ul>
    {#if allowUntitled && !filter}
      <li><button class="item muted" onclick={() => onpick(null)}>Untitled</button></li>
    {/if}
    {#each visible as t (t.id)}
      <li>
        <button class="item" onclick={() => onpick(t.id)}>
          {t.name}
          {#if t.category}<span class="muted small">{t.category}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
</Sheet>

<style>
  .create {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    margin-top: 10px;
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }
  li + li {
    border-top: 1px solid var(--border);
  }
  .item {
    width: 100%;
    min-height: 50px;
    text-align: left;
    font-size: 17px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
</style>
