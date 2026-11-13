<script lang="ts">
  // Shared task-name input: fuzzy-matched existing tasks, pick one or type a new name.
  // The value is just a name; resolveTaskName() applies the rule (exact match = existing, un-archived).
  import type { Task } from '../lib/model';
  import { cleanName, findByName, matchTasks } from '../lib/tasks/nameMatch';

  let {
    tasks,
    value = $bindable(''),
    autofocus = false,
  }: { tasks: Task[]; value?: string; autofocus?: boolean } = $props();

  const exact = $derived(findByName(tasks, value));
  const matches = $derived(matchTasks(tasks, value));
  const showList = $derived(matches.length > 0 && !(exact && matches.length === 1));
</script>

<div class="combo">
  <!-- svelte-ignore a11y_autofocus -->
  <input
    type="text"
    placeholder="Task name"
    bind:value
    {autofocus}
    autocomplete="off"
    autocapitalize="sentences"
    enterkeyhint="done"
  />
  {#if cleanName(value)}
    <p class="hint muted small">
      {#if exact?.archived}Archived task, will be restored{:else if exact}Existing task{:else}New task{/if}
    </p>
  {/if}
  {#if showList}
    <ul class="matches">
      {#each matches as t (t.id)}
        <li>
          <button class:on={t.id === exact?.id} onclick={() => (value = t.name)}>
            <span class="grow">{t.name}</span>
            {#if t.archived}<span class="muted small">archived</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .combo {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hint {
    margin: 0 4px;
  }
  .matches {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .matches li + li {
    border-top: 1px solid var(--border);
  }
  .matches button {
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
  }
  .matches button:active,
  .matches button.on {
    background: var(--surface-2);
  }
</style>
