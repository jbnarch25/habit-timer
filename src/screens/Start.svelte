<script lang="ts">
  // Start sequence (chunk 2). Step 1: window. Step 2: task / queue.
  // Visuals are placeholders: native <select>s render as iOS scroll wheels.
  import { onDestroy, onMount } from 'svelte';
  import { alerts } from '../lib/alerts/webAlertService';
  import { formatTime } from '../lib/format';
  import { liveStats, liveTasks, taskMap } from '../lib/live';
  import type { DurationMode, StartSource } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { deriveWindowMin, start } from '../lib/services/sessionService';
  import { createTask } from '../lib/services/taskService';
  import { buildTaskList, queueTotals, remainingWindow } from '../lib/start/taskList';
  import { durationLabel } from '../lib/stats/stats';

  const tasks = liveTasks();
  const stats = liveStats();

  const FIVE = 5 * 60_000;
  const DURATIONS = Array.from({ length: 24 }, (_, i) => (i + 1) * 5); // 5…120

  let now = $state(Date.now());
  let tick: ReturnType<typeof setInterval>;
  onMount(() => (tick = setInterval(() => (now = Date.now()), 15_000)));
  onDestroy(() => clearInterval(tick));

  let step = $state<1 | 2>(1);
  // Whichever control was touched last decides the window.
  let mode = $state<'duration' | 'end'>('duration');
  let durationMin = $state<number | null>(null); // null = ∞
  let endAt = $state<number | null>(null);
  let queue = $state<string[]>([]);
  let barOpen = $state(false);
  let newName = $state('');
  let newMode = $state<DurationMode>('fixed');
  let starting = false;

  // End-time slots: 5-min boundaries from ≥ now+5 min up to now+3 h (placeholder range).
  const endSlots = $derived.by(() => {
    const first = Math.ceil((now + FIVE) / FIVE) * FIVE;
    return Array.from({ length: 36 }, (_, i) => first + i * FIVE);
  });

  /** The window in minutes as it would be if started now; null = ∞. */
  const W = $derived(mode === 'duration' ? durationMin : endAt != null ? (deriveWindowMin(endAt, now) ?? null) : null);

  const statsMap = $derived($stats ?? new Map());
  const byId = $derived(taskMap($tasks));
  const queuedTasks = $derived(queue.map((id) => byId.get(id)).filter((t) => t != null));
  const remaining = $derived(W == null ? null : remainingWindow(W, queuedTasks, statsMap));
  const list = $derived(buildTaskList($tasks ?? [], statsMap, remaining, queue));
  const totals = $derived(W == null ? null : queueTotals(queuedTasks, statsMap, W));

  function onDuration(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    mode = 'duration';
    durationMin = v === 'inf' ? null : Number(v);
  }

  function onEnd(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (v === 'preview') return;
    mode = 'end';
    endAt = Number(v);
  }

  async function go(taskIds: string[], startSource: StartSource) {
    if (starting) return;
    starting = true;
    alerts.unlock(); // inside the tap, for iOS audio + speech
    try {
      await start(
        mode === 'end' && endAt != null
          ? { taskIds, targetEndAt: endAt, startSource }
          : { taskIds, windowMin: durationMin ?? undefined, startSource },
      );
    } finally {
      starting = false;
    }
  }

  const startAnything = () => (queue.length ? go(queue, 'picked') : go([], 'quick'));
  const add = (id: string) => {
    if (!queue.includes(id)) queue = [...queue, id];
  };
  // With a queue, tapping a row only queues it (owner decision); otherwise it starts that task.
  const tapRow = (id: string) => (queue.length ? add(id) : go([id], 'picked'));

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= queue.length) return;
    const q = [...queue];
    [q[i], q[j]] = [q[j], q[i]];
    queue = q;
  }
  const remove = (i: number) => {
    queue = queue.filter((_, j) => j !== i);
    if (!queue.length) barOpen = false;
  };

  async function createNew(then: 'start' | 'queue') {
    const name = newName.trim();
    if (!name) return;
    const t = await createTask({ name, durationMode: newMode });
    newName = '';
    if (then === 'start') await go([t.id], 'picked');
    else add(t.id);
  }

  const wLabel = (w: number | null) => (w == null ? '∞' : `${Math.max(0, Math.round(w))} min`);
</script>

{#if step === 1}
  <div class="page step1">
    <header class="topbar">
      <span></span>
      <nav class="row">
        <button class="icon-btn" onclick={() => navigate('/tasks')}>Tasks</button>
        <button class="icon-btn" onclick={() => navigate('/history')}>History</button>
        <button class="icon-btn" onclick={() => navigate('/settings')} aria-label="Settings">⚙︎</button>
      </nav>
    </header>

    <div class="sentence">
      <span>Start a</span>
      <select class="wheel" value={mode === 'duration' ? String(durationMin ?? 'inf') : 'derived'} onchange={onDuration}>
        {#if mode === 'end'}<option value="derived">≈ {wLabel(W)}</option>{/if}
        <option value="inf">∞</option>
        {#each DURATIONS as d}<option value={String(d)}>{d} min</option>{/each}
      </select>
      <span>session, ending at</span>
      <select class="wheel" value={mode === 'end' && endAt != null ? String(endAt) : 'preview'} onchange={onEnd}>
        <option value="preview">{mode === 'duration' && durationMin != null ? formatTime(now + durationMin * 60_000) : '…'}</option>
        {#each endSlots as t}<option value={String(t)}>{formatTime(t)}</option>{/each}
      </select>
    </div>

    <button class="btn primary next" onclick={() => (step = 2)}>Next</button>
  </div>
{:else}
  <div class="page step2" class:with-bar={queue.length > 0}>
    <header class="topbar">
      <button class="icon-btn" onclick={() => (step = 1)}>‹ Back</button>
      <span class="muted small">
        {#if W == null}∞ session{:else if queue.length}{wLabel(remaining)} left of {wLabel(W)}{:else}{wLabel(W)} window{/if}
      </span>
    </header>

    <ul class="card list">
      <li>
        <button class="row-main anything" onclick={startAnything}>
          <span class="name">Start Anything</span>
          <span class="muted small">{queue.length ? `Starts the ${queue.length}-task queue` : 'Untitled, name it later'}</span>
        </button>
      </li>
      {#each list.fits as t (t.id)}
        <li>
          <button class="row-main" onclick={() => tapRow(t.id)}>
            <span class="name">{t.name}</span>
            <span class="muted small">{durationLabel(t, statsMap.get(t.id))}</span>
          </button>
          <button class="icon-btn plus" onclick={() => add(t.id)} aria-label="Queue {t.name}">＋</button>
        </li>
      {/each}
    </ul>

    {#if W != null && list.fits.length === 0}
      <p class="muted small empty">{queue.length ? 'Nothing else fits the time left.' : 'No tasks fit this window.'}</p>
    {/if}

    {#if list.noEstimate.length}
      <h2 class="section-title">No estimate</h2>
      <ul class="card list">
        {#each list.noEstimate as t (t.id)}
          <li>
            <button class="row-main" onclick={() => tapRow(t.id)}><span class="name">{t.name}</span></button>
            <button class="icon-btn plus" onclick={() => add(t.id)} aria-label="Queue {t.name}">＋</button>
          </li>
        {/each}
      </ul>
    {/if}

    <h2 class="section-title">+ New task</h2>
    <div class="card new">
      <input type="text" placeholder="Task name" bind:value={newName} autocomplete="off" enterkeyhint="done" />
      <div class="segmented">
        <button class:on={newMode === 'fixed'} onclick={() => (newMode = 'fixed')}>Fixed</button>
        <button class:on={newMode === 'flexible'} onclick={() => (newMode = 'flexible')}>Flexible</button>
      </div>
      <div class="row">
        {#if !queue.length}
          <button class="btn primary grow" disabled={!newName.trim()} onclick={() => createNew('start')}>Start</button>
        {/if}
        <button class="btn grow" disabled={!newName.trim()} onclick={() => createNew('queue')}>Add to queue</button>
      </div>
    </div>
  </div>

  {#if queue.length}
    <div class="bar">
      {#if barOpen}
        <ol class="queue">
          {#each queuedTasks as t, i (t.id)}
            <li class="row">
              <span class="grow">{i + 1}. {t.name}</span>
              <button class="icon-btn" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button class="icon-btn" onclick={() => move(i, 1)} disabled={i === queue.length - 1} aria-label="Move down">↓</button>
              <button class="icon-btn" onclick={() => remove(i)} aria-label="Remove">✕</button>
            </li>
          {/each}
        </ol>
      {/if}
      {#if totals?.unknown}
        <p class="muted small unknown">+{totals.unknown} task{totals.unknown > 1 ? 's' : ''} without an estimate</p>
      {/if}
      <div class="row">
        <button class="btn" onclick={() => (barOpen = !barOpen)}>{barOpen ? 'Done' : 'Edit'}</button>
        <button class="btn primary grow" onclick={() => go(queue, 'picked')}>
          Start {queue.length} task{queue.length > 1 ? 's' : ''}{#if totals && W != null}&nbsp;· {Math.round(totals.min)} of {W} min{/if}
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .step1 {
    min-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  .sentence {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    align-content: center;
    gap: 10px 8px;
    font-size: 26px;
    font-weight: 600;
    text-align: center;
  }
  .wheel {
    width: auto;
    font-size: 26px;
    font-weight: 700;
    color: var(--accent);
    background: var(--surface-2);
    border: none;
    border-radius: 12px;
    padding: 6px 14px;
    -webkit-appearance: none;
    appearance: none;
    text-align: center;
  }
  .next {
    min-height: 64px;
    font-size: 20px;
    border-radius: 18px;
    margin-bottom: 8px;
  }
  .step2.with-bar {
    padding-bottom: 140px;
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
  .row-main {
    flex: 1;
    min-width: 0;
    min-height: 58px;
    padding: 8px 4px 8px 16px;
    text-align: left;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .row-main:active {
    background: var(--surface-2);
  }
  .name {
    font-size: 17px;
    font-weight: 500;
  }
  .anything .name {
    color: var(--accent);
    font-weight: 700;
  }
  .plus {
    font-size: 20px;
    color: var(--accent);
    margin-right: 4px;
  }
  .empty {
    margin: 10px 4px;
  }
  .new {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar > .row,
  .queue {
    max-width: 528px;
    width: 100%;
    margin: 0 auto;
  }
  .unknown {
    margin: 0 auto;
    max-width: 528px;
    width: 100%;
  }
  .queue {
    list-style: none;
    padding: 0;
    max-height: 40dvh;
    overflow-y: auto;
  }
</style>
