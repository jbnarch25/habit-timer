<script lang="ts">
  // Allocation editor (chunk 3): order + assignment in the log, durations in the bar.
  import AllocationBar from '../components/AllocationBar.svelte';
  import DurationInput from '../components/DurationInput.svelte';
  import SegmentLog from '../components/SegmentLog.svelte';
  import Sheet from '../components/Sheet.svelte';
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
  const stored = live(() => ed.sessionSegments(id));
  const tasks = liveTasks();

  // raw: segments must never become deep proxies (IndexedDB can't clone them).
  let assigning = $state.raw<Segment | null>(null);
  let exact = $state.raw<Segment | null>(null);
  let menu = $state.raw<Segment | null>(null);

  const tasksById = $derived(taskMap($tasks));
  const total = $derived($session ? ed.sessionTotalSec($session) : 0);
  // A legacy gap shows as a virtual untitled segment; it's only written with the first real edit.
  const segs = $derived($session && $stored ? ed.withRemainder($stored, id, total) : []);
  const length = $derived(ed.barLengthSec(segs, total));
  const step = $derived(ed.snapStep(length));
  const overAllocated = $derived(ed.sumSec(segs) > total);
  const delta = $derived($session ? ed.windowDeltaSec($session) : null);
  const signed = (sec: number) => `${sec < 0 ? '−' : '+'}${formatDuration(Math.abs(sec))}`;
  const last = $derived(segs[segs.length - 1]);

  /** Run a pure edit against the current list; persist only if something changed. */
  async function edit(fn: (segs: Segment[], now: number) => Segment[]) {
    const next = fn(segs, Date.now());
    if (next !== segs) await save(next);
  }

  async function save(next: Segment[]) {
    try {
      await ed.applyEdit(id, next);
    } catch (e) {
      console.error('Saving the edit failed', e);
    }
  }

  const current = (s: Segment | null) => (s ? segs.find((x) => x.id === s.id) : undefined);

  // Sheet actions receive the segment as an argument: the template's {@const s} derives from the
  // sheet state, so it's gone once the sheet closes.
  function menuAction(seg: Segment, fn: (list: Segment[], now: number, seg: Segment) => Segment[]) {
    menu = null;
    edit((list, now) => fn(list, now, seg));
  }

  function saveExact(seg: Segment, sec: number) {
    exact = null;
    edit((list, now) => ed.setDurationExact(list, seg.id, sec, step, now));
  }

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
      {#if overAllocated}
        <p class="muted small">
          Older session: segments add up to {formatDuration(ed.sumSec(segs))}, more than the session's
          {formatDuration(total)}. Edits keep this total.
        </p>
      {/if}
      {#if $session.discarded}<p class="muted small">This session was discarded and doesn't count toward stats.</p>{/if}
    </div>

    <SegmentLog
      {segs}
      {tasksById}
      canEditDuration={segs.length > 1}
      onreorder={(from, to) => edit((s, now) => ed.reorder(s, from, to, now))}
      onassign={(s) => (assigning = s)}
      onduration={(s) => (exact = s)}
      onmenu={(s) => (menu = s)}
    />

    <button
      class="btn block add"
      disabled={!last || !ed.canSplit(last, step)}
      onclick={() => edit((s, now) => ed.splitSegment(s, last.id, step, now))}
    >
      + Add
    </button>

    <AllocationBar {segs} {step} {tasksById} oncommit={save} />
    <p class="muted small hint">
      Drag the dividers to move time between neighbors ({step === 60 ? '1-minute' : '5-second'} steps). Tap a time
      in the list for exact values.
    </p>
  {/if}
</div>

{#if assigning && $tasks}
  <TaskPickerSheet
    tasks={$tasks}
    title="Assign task"
    onpick={(taskId) => {
      const s = assigning!;
      assigning = null;
      edit((list, now) => ed.assign(list, s.id, taskId, now));
    }}
    onclose={() => (assigning = null)}
  />
{/if}

{#if exact}
  {@const s = current(exact)}
  {#if s}
    <DurationInput
      title="Exact duration"
      seconds={s.durationSec}
      minSec={1}
      max={ed.maxExactSec(segs, s.id, step)}
      hint={s === last ? 'taken from the segment above' : 'taken from the next segment'}
      onsave={(sec) => saveExact(s, sec)}
      onclose={() => (exact = null)}
    />
  {/if}
{/if}

{#if menu}
  {@const s = current(menu)}
  {#if s}
    <Sheet title={s.taskId ? (tasksById.get(s.taskId)?.name ?? 'Segment') : 'Untitled'} onclose={() => (menu = null)}>
      <div class="actions">
        <button
          class="btn block"
          disabled={!ed.canSplit(s, step)}
          onclick={() => menuAction(s, (l, now, x) => ed.splitSegment(l, x.id, step, now))}
        >
          Split in half{ed.canSplit(s, step) ? '' : ' (too short)'}
        </button>
        <button class="btn block" onclick={() => menuAction(s, (l, now, x) => ed.setCompleted(l, x.id, !x.completed, now))}>
          {s.completed ? 'Mark unfinished' : 'Mark completed'}
        </button>
        <button class="btn block" onclick={() => menuAction(s, (l, now, x) => ed.setExcluded(l, x.id, !x.excluded, now))}>
          {s.excluded ? 'Include in stats' : 'Exclude from stats'}
        </button>
        <button
          class="btn block danger"
          disabled={!ed.canDelete(segs, s)}
          onclick={() => menuAction(s, (l, now, x) => ed.deleteSegment(l, x.id, now))}
        >
          {s.taskId ? 'Delete (unassign, keep time)' : segs.indexOf(s) === 0 ? 'Delete (merge into next)' : 'Delete (merge into above)'}
        </button>
      </div>
    </Sheet>
  {/if}
{/if}

<style>
  .summary {
    margin: 8px 4px 16px;
  }
  .summary p {
    margin: 0 0 4px;
  }
  .summary .delta {
    margin-top: 4px;
    font-size: 16px;
  }
  h1 {
    font-size: 26px;
  }
  .add {
    margin: 8px 0 20px;
  }
  .hint {
    margin: -6px 4px 0;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
