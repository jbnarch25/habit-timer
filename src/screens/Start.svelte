<script lang="ts">
  // Start sequence. Step 1: window. Step 2: task selection, then the 3‑2‑1 lead-in.
  // Visuals are placeholders: native <select>s render as iOS scroll wheels.
  import { onDestroy, onMount } from 'svelte';
  import LeadIn from '../components/LeadIn.svelte';
  import TaskNameCombobox from '../components/TaskNameCombobox.svelte';
  import { alerts } from '../lib/alerts/webAlertService';
  import { formatTime, relativeDay } from '../lib/format';
  import { liveStats, liveTasks } from '../lib/live';
  import { navigate } from '../lib/router.svelte';
  import { deriveWindowMin, start } from '../lib/services/sessionService';
  import { resolveTaskName } from '../lib/services/taskService';
  import { buildTaskList, DEFAULT_SORT, type Sort, type SortKey } from '../lib/start/taskList';
  import { cleanName, findByName } from '../lib/tasks/nameMatch';

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

  let sort = $state<Sort>({ ...DEFAULT_SORT });
  let selectedId = $state<string | null>(null); // null = Start Anything
  let newOpen = $state(false);
  let newName = $state('');
  let leadIn = $state<{ name: string; taskId: Promise<string | null> } | null>(null);

  // End-time slots: 5-min boundaries from ≥ now+5 min up to now+3 h (placeholder range).
  const endSlots = $derived.by(() => {
    const first = Math.ceil((now + FIVE) / FIVE) * FIVE;
    return Array.from({ length: 36 }, (_, i) => first + i * FIVE);
  });

  /** The window in minutes as it would be if started now; null = ∞. */
  const W = $derived(mode === 'duration' ? durationMin : endAt != null ? (deriveWindowMin(endAt, now) ?? null) : null);

  const statsMap = $derived($stats ?? new Map());
  const rows = $derived(buildTaskList($tasks ?? [], statsMap, W, sort));
  // A selection that the window filter hides falls back to Start Anything.
  const selected = $derived(rows.find((t) => t.id === selectedId) ?? null);
  const newDisplayName = $derived(findByName($tasks ?? [], newName)?.name ?? cleanName(newName));

  const startLabel = $derived(
    newOpen ? (newDisplayName ? `Start ${newDisplayName}` : 'Start What?') : selected ? `Start ${selected.name}` : 'Start Anything',
  );

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

  function sortBy(key: SortKey) {
    sort = sort.key === key ? { key, asc: !sort.asc } : { key, asc: key === 'name' ? true : DEFAULT_SORT.asc };
  }
  const arrow = (key: SortKey) => (sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : '');

  function tapStart() {
    if (leadIn || (newOpen && !newDisplayName)) return;
    alerts.unlock(); // inside the tap: iOS audio session + Web Audio
    if (newOpen) {
      // Quick-create: the task is made now and kept even if the session is canceled.
      leadIn = { name: newDisplayName, taskId: resolveTaskName(newName).then((t) => t.id) };
    } else {
      leadIn = { name: selected?.name ?? 'Anything', taskId: Promise.resolve(selected?.id ?? null) };
    }
  }

  async function afterLeadIn() {
    if (!leadIn) return;
    try {
      const taskId = await leadIn.taskId;
      await start(
        mode === 'end' && endAt != null ? { taskId, targetEndAt: endAt } : { taskId, windowMin: durationMin ?? undefined },
      );
    } catch (e) {
      console.error(e);
      leadIn = null;
    }
  }

  function cancelLeadIn() {
    if (newOpen) {
      // The task now exists: select it instead of leaving the quick-create open.
      void leadIn?.taskId.then((id) => (selectedId = id));
      newOpen = false;
      newName = '';
    }
    leadIn = null;
  }

  const wLabel = (w: number | null) => (w == null ? '∞' : `${Math.max(0, Math.round(w))} min`);
  const lastDone = (id: string) => {
    const st = statsMap.get(id);
    return st?.lastDoneAt ? `${relativeDay(st.lastDoneAt)} · ${st.sessionCount}×` : '—';
  };
</script>

{#if step === 1}
  <div class="page step1">
    <header class="topbar">
      <span></span>
      <button class="gear" onclick={() => navigate('/settings')} aria-label="Settings">⚙︎</button>
    </header>

    <nav class="tiles">
      <button class="tile" onclick={() => navigate('/tasks')}>Tasks</button>
      <button class="tile" onclick={() => navigate('/history')}>History</button>
    </nav>

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
  <div class="page step2">
    <header class="topbar">
      <button class="icon-btn" onclick={() => (step = 1)}>‹ Back</button>
      <span class="muted small">{W == null ? '∞ session' : `${wLabel(W)} window`}</span>
    </header>

    <div class="card table">
      <div class="thead">
        <button class="th grow" onclick={() => sortBy('name')}>Task{arrow('name')}</button>
        <button class="th right" onclick={() => sortBy('lastDone')}>Last done{arrow('lastDone')}</button>
      </div>
      <button class="tr anything" class:on={!newOpen && !selected} onclick={() => ((selectedId = null), (newOpen = false))}>
        <span class="grow name">Start Anything</span>
        <span class="muted small">no task</span>
      </button>
      {#each rows as t (t.id)}
        <button class="tr" class:on={!newOpen && selected?.id === t.id} onclick={() => ((selectedId = t.id), (newOpen = false))}>
          <span class="grow name">{t.name}</span>
          <span class="muted small right">{lastDone(t.id)}</span>
        </button>
      {/each}
    </div>

    {#if W != null && rows.length === 0 && ($tasks?.length ?? 0) > 0}
      <p class="muted small empty">No tasks fit this window.</p>
    {/if}

    <div class="card new" class:open={newOpen}>
      <button class="new-toggle" onclick={() => (newOpen = !newOpen)}>{newOpen ? '− New Task' : '+ New Task'}</button>
      {#if newOpen}
        <div class="new-body">
          <TaskNameCombobox tasks={$tasks ?? []} bind:value={newName} autofocus />
        </div>
      {/if}
    </div>
  </div>

  <div class="bar">
    <button class="btn primary go" disabled={newOpen && !newDisplayName} onclick={tapStart}>{startLabel}</button>
  </div>
{/if}

{#if leadIn}
  <LeadIn taskName={leadIn.name} ondone={afterLeadIn} oncancel={cancelLeadIn} />
{/if}

<style>
  .step1 {
    min-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  .gear {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    font-size: 28px;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 4px;
  }
  .tile {
    min-height: 72px;
    border-radius: 18px;
    background: var(--surface);
    border: 2px solid var(--accent);
    color: var(--accent);
    font-size: 20px;
    font-weight: 700;
  }
  .tile:active {
    background: var(--surface-2);
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
  .step2 {
    padding-bottom: calc(110px + env(safe-area-inset-bottom));
  }
  .table {
    overflow: hidden;
  }
  .thead {
    display: flex;
    gap: 8px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
  }
  .th {
    min-height: 40px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    text-align: left;
  }
  .right {
    text-align: right;
  }
  .tr {
    width: 100%;
    min-height: 54px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    border-left: 4px solid transparent;
  }
  .tr + .tr {
    border-top: 1px solid var(--border);
  }
  .tr.on {
    background: var(--surface-2);
    border-left-color: var(--accent);
  }
  .name {
    font-size: 17px;
    font-weight: 500;
  }
  .anything .name {
    color: var(--accent);
    font-weight: 700;
  }
  .empty {
    margin: 10px 4px;
  }
  .new {
    margin-top: 16px;
  }
  .new-toggle {
    width: 100%;
    min-height: 52px;
    padding: 0 16px;
    text-align: left;
    color: var(--accent);
    font-weight: 600;
  }
  .new-body {
    padding: 0 12px 12px;
  }
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }
  .go {
    display: flex;
    width: 100%;
    max-width: 528px;
    margin: 0 auto;
    min-height: 64px;
    font-size: 20px;
    border-radius: 18px;
  }
</style>
