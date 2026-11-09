<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import DurationInput from '../components/DurationInput.svelte';
  import TaskPickerSheet from '../components/TaskPickerSheet.svelte';
  import { db } from '../lib/db';
  import { formatDate, formatDuration, formatTime } from '../lib/format';
  import { live, liveTasks, taskMap } from '../lib/live';
  import type { Segment } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import * as ed from '../lib/services/editorService';

  let { id, fresh }: { id: string; fresh: boolean } = $props();

  // svelte-ignore state_referenced_locally
  const session = live(async () => (await db.sessions.get(id)) ?? null);
  // svelte-ignore state_referenced_locally
  const segments = live(() => ed.sessionSegments(id));
  const tasks = liveTasks();

  // Which sheet is open. 'remainder' targets the virtual unallocated row.
  let assigning = $state<Segment | 'remainder' | null>(null);
  let editingDuration = $state<Segment | 'remainder' | null>(null);
  let deleting = $state<Segment | null>(null);

  const tasksById = $derived(taskMap($tasks));
  const total = $derived($session ? ed.sessionTotalSec($session) : 0);
  const remainder = $derived($session && $segments ? ed.remainderSec($session, $segments) : 0);

  async function onAssign(taskId: string | null) {
    const target = assigning;
    assigning = null;
    if (target === 'remainder') await ed.addSegment(id, remainder, taskId);
    else if (target) await ed.assignTask(target.id, taskId);
  }

  async function onDuration(sec: number) {
    const target = editingDuration;
    editingDuration = null;
    if (target === 'remainder') await ed.addSegment(id, sec);
    else if (target) await ed.setDuration(target.id, sec);
  }

  const delta = $derived($session ? ed.windowDeltaSec($session) : null);
  const signed = (sec: number) => `${sec < 0 ? '−' : '+'}${formatDuration(Math.abs(sec))}`;

  // Zero-sum interim clamp: a segment can take at most total − Σ other segments.
  const durationMax = $derived.by(() => {
    if (!editingDuration || !$session || !$segments) return 0;
    return editingDuration === 'remainder' ? remainder : ed.maxDurationFor($session, $segments, editingDuration.id);
  });

  function done() {
    navigate(fresh ? '/' : '/history');
  }
</script>

<div class="page">
  <header class="topbar">
    <button class="icon-btn" onclick={done}>‹ {fresh ? 'Start' : 'History'}</button>
    <button class="link" onclick={done}>Done</button>
  </header>

  {#if $session === undefined}
    <p class="muted">Loading…</p>
  {:else if $session === null}
    <p class="muted">Session not found.</p>
  {:else}
    <div class="summary">
      <p class="muted small">
        {formatDate($session.startedAt)} · {formatTime($session.startedAt)}–{formatTime($session.endedAt)}
        {#if $session.pauses.length}· {$session.pauses.length} pause{$session.pauses.length > 1 ? 's' : ''}{/if}
      </p>
      <h1>You spent <span class="tabular">{formatDuration(total)}</span></h1>
      {#if delta != null}
        <p class="delta muted tabular">{signed(delta)} vs. {$session.windowMin} min window</p>
      {/if}
      {#if $session.discarded}<p class="muted small">This session was discarded and doesn't count toward stats.</p>{/if}
    </div>

    <ul class="list">
      {#each $segments ?? [] as seg (seg.id)}
        {@const task = seg.taskId ? tasksById.get(seg.taskId) : undefined}
        <li class="card seg" class:excluded={seg.excluded}>
          <div class="row">
            <button class="task grow" class:untitled={!task} onclick={() => (assigning = seg)}>
              {task?.name ?? 'Untitled'}
            </button>
            <button class="dur tabular" onclick={() => (editingDuration = seg)}>{formatDuration(seg.durationSec)}</button>
          </div>
          <div class="row wrap flags">
            <button class="chip" class:on={seg.completed} onclick={() => ed.setCompleted(seg.id, !seg.completed)}>
              {seg.completed ? '✓ Completed' : 'Unfinished'}
            </button>
            <button class="chip" class:on={seg.excluded} onclick={() => ed.setExcluded(seg.id, !seg.excluded)}>
              {seg.excluded ? 'Excluded from stats' : 'Exclude'}
            </button>
            <span class="grow"></span>
            <button class="icon-btn" onclick={() => (deleting = seg)} aria-label="Delete segment">🗑</button>
          </div>
        </li>
      {/each}

      {#if remainder > 0}
        <li class="card seg remainder">
          <div class="row">
            <button class="task grow untitled" onclick={() => (assigning = 'remainder')}>Untitled · unallocated</button>
            <button class="dur tabular" onclick={() => (editingDuration = 'remainder')}>{formatDuration(remainder)}</button>
          </div>
        </li>
      {/if}
    </ul>
  {/if}
</div>

{#if assigning && $tasks}
  <TaskPickerSheet tasks={$tasks} title="Assign task" onpick={onAssign} onclose={() => (assigning = null)} />
{/if}

{#if editingDuration}
  <DurationInput
    seconds={editingDuration === 'remainder' ? remainder : editingDuration.durationSec}
    max={durationMax}
    onsave={onDuration}
    onclose={() => (editingDuration = null)}
  />
{/if}

{#if deleting}
  <ConfirmDialog
    message="Delete this {formatDuration(deleting.durationSec)} segment?"
    confirmLabel="Delete"
    danger
    onconfirm={async () => {
      const d = deleting!;
      deleting = null;
      await ed.deleteSegment(d.id);
    }}
    oncancel={() => (deleting = null)}
  />
{/if}

<style>
  .summary {
    margin: 8px 4px 16px;
  }
  .summary p {
    margin: 0 0 4px;
  }
  h1 {
    font-size: 26px;
  }
  .list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .seg {
    padding: 6px 8px 8px 14px;
  }
  .seg.excluded {
    opacity: 0.6;
  }
  .remainder {
    border-style: dashed;
    background: transparent;
  }
  .task {
    min-height: 44px;
    text-align: left;
    font-size: 17px;
    font-weight: 500;
  }
  .untitled {
    color: var(--muted);
    font-weight: 400;
  }
  .dur {
    min-height: 44px;
    min-width: 72px;
    font-size: 19px;
    font-weight: 600;
    border-radius: 10px;
    background: var(--surface-2);
    padding: 0 10px;
  }
  .flags {
    margin-top: 4px;
  }
  .flags .chip {
    min-height: 32px;
    font-size: 14px;
  }
  .summary .delta {
    margin: 4px 0 0;
    font-size: 16px;
  }
</style>
