<script lang="ts">
  import TaskNameCombobox from '../components/TaskNameCombobox.svelte';
  import { formatDelta, formatDuration } from '../lib/format';
  import { newId } from '../lib/id';
  import { liveStats, liveTasks, taskMap } from '../lib/live';
  import { review } from '../lib/review.svelte';
  import { navigate } from '../lib/router.svelte';
  import { fileSession, type Finished } from '../lib/services/sessionService';
  import { resolveTaskName } from '../lib/services/taskService';
  import { typicalSec } from '../lib/stats/stats';
  import { cleanName, findByName } from '../lib/tasks/nameMatch';

  let { finished }: { finished: Finished } = $props();

  // svelte-ignore state_referenced_locally
  const f = finished;
  // Known up front so stats can leave this session out: deltas compare against the typical time before it.
  const sessionId = f.id ?? newId();
  const tasks = liveTasks();
  const stats = liveStats(sessionId);

  let filedTaskId = $state<string | null>(null);
  let adding = $state(false);
  let name = $state('');
  let saving = false;

  const taskId = $derived(f.taskId ?? filedTaskId);
  const task = $derived(taskId ? taskMap($tasks).get(taskId) : undefined);
  const typical = $derived(task && $stats ? typicalSec(task, $stats.get(task.id)) : null);
  const windowDelta = $derived(f.windowMin ? f.durationSec - f.windowMin * 60 : null);
  const typicalDelta = $derived(typical != null ? f.durationSec - typical : null);
  const pickedName = $derived(findByName($tasks ?? [], name)?.name ?? cleanName(name));

  const overUnder = (d: number) =>
    Math.abs(d) < 1 ? 'right on' : `${formatDelta(d)} ${d > 0 ? 'over' : 'under'}`;

  async function save() {
    if (saving || !pickedName) return;
    saving = true;
    try {
      const t = await resolveTaskName(name);
      await fileSession({ ...f, id: sessionId }, t.id);
      filedTaskId = t.id;
      adding = false;
    } finally {
      saving = false;
    }
  }

  function done() {
    review.current = null;
    navigate('/');
  }
</script>

<div class="page review">
  <section class="result">
    <div class="task-name" class:anything={!task}>{task?.name ?? 'Anything'}</div>
    <div class="time tabular">{formatDuration(f.durationSec)}</div>

    <div class="deltas">
      {#if windowDelta != null}
        <div class="delta">
          <span class="muted">vs {f.windowMin} min window</span>
          <span class="tabular" class:over={windowDelta > 0}>{overUnder(windowDelta)}</span>
        </div>
      {/if}
      {#if typicalDelta != null && typical != null}
        <div class="delta">
          <span class="muted">vs {task?.goalMin != null ? 'goal' : 'usual'} {formatDuration(typical)}</span>
          <span class="tabular">{overUnder(typicalDelta)}</span>
        </div>
      {/if}
    </div>

    {#if !f.taskId}
      <div class="add">
        {#if filedTaskId}
          <p class="muted">Saved to {task?.name}.</p>
        {:else if !adding}
          <button class="btn block" onclick={() => (adding = true)}>Add to tasks?</button>
          <p class="muted small">If you skip this, the session isn't saved.</p>
        {:else}
          <TaskNameCombobox tasks={$tasks ?? []} bind:value={name} autofocus />
          <button class="btn primary block" disabled={!pickedName} onclick={save}>
            {pickedName ? `Save to ${pickedName}` : 'Save to…'}
          </button>
        {/if}
      </div>
    {/if}
  </section>

  <button class="btn primary big" onclick={done}>Done</button>
</div>

<style>
  .review {
    min-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  .result {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 12dvh;
    gap: 12px;
    text-align: center;
  }
  .task-name {
    font-size: 28px;
    font-weight: 600;
  }
  .task-name.anything {
    color: var(--muted);
    font-weight: 500;
  }
  .time {
    font-size: clamp(56px, 18vw, 88px);
    font-weight: 200;
    line-height: 1;
  }
  .deltas {
    margin-top: 12px;
    width: min(320px, 100%);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .delta {
    display: flex;
    justify-content: space-between;
    font-size: 17px;
  }
  .over {
    color: var(--danger);
  }
  .add {
    margin-top: 24px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
  }
  .add p {
    margin: 0 4px;
    text-align: center;
  }
  .big {
    min-height: 64px;
    font-size: 20px;
    border-radius: 18px;
    margin-bottom: 8px;
  }
</style>
