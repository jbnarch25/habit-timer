<script lang="ts">
  import type { Task } from '../lib/model';
  import { createTask, DuplicateNameError, saveTask, type TaskProps } from '../lib/services/taskService';
  import Sheet from './Sheet.svelte';

  let { task, onclose }: { task?: Task; onclose: () => void } = $props();

  // Form state is seeded once from the task being edited.
  // svelte-ignore state_referenced_locally
  const t = task;
  let name = $state(t?.name ?? '');
  let minChunk = $state<number | ''>(t?.minChunkMin ?? '');
  let goal = $state<number | ''>(t?.goalMin ?? '');
  let max = $state<number | ''>(t?.maxMin ?? '');
  let taskAlert = $state(t?.taskAlert ?? false);
  let error = $state('');

  const num = (v: number | '' | null | undefined) =>
    v === '' || v == null || Number.isNaN(Number(v)) || Number(v) <= 0 ? undefined : Number(v);

  async function save() {
    if (!name.trim()) return;
    const props: TaskProps = { minChunkMin: num(minChunk), goalMin: num(goal), maxMin: num(max), taskAlert };
    try {
      if (t) await saveTask(t.id, name, props);
      else await createTask(name, props);
      onclose();
    } catch (e) {
      error = e instanceof DuplicateNameError ? e.message : 'Couldn’t save.';
    }
  }
</script>

<Sheet title={t ? 'Edit task' : 'New task'} {onclose}>
  <div class="form">
    <label class="field">
      Name
      <!-- svelte-ignore a11y_autofocus -->
      <input type="text" bind:value={name} oninput={() => (error = '')} autofocus={!t} enterkeyhint="done" />
    </label>
    {#if error}<p class="error small">{error}</p>{/if}

    <div class="three">
      <label class="field">
        Min chunk
        <input type="number" inputmode="numeric" min="1" placeholder="min" bind:value={minChunk} />
      </label>
      <label class="field">
        Goal time
        <input type="number" inputmode="numeric" min="1" placeholder="min" bind:value={goal} />
      </label>
      <label class="field">
        Maximum
        <input type="number" inputmode="numeric" min="1" placeholder="min" bind:value={max} />
      </label>
    </div>
    <p class="muted small hint">
      All optional, in minutes. Min chunk: smallest worthwhile chunk. Goal: target time. Maximum: the timer counts
      down from it and ends the session at zero.
    </p>

    <div class="card">
      <label class="toggle-row">
        <span>
          Task alert
          <br /><span class="muted small">Beep at the goal time, or the usual time once there’s history.</span>
        </span>
        <input type="checkbox" class="switch" bind:checked={taskAlert} />
      </label>
    </div>

    <button class="btn primary block" onclick={save} disabled={!name.trim()}>Save</button>
  </div>
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .three {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    align-items: end;
  }
  .hint,
  .error {
    margin: -4px 4px 0;
  }
  .error {
    color: var(--danger);
  }
</style>
