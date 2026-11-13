<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import Banner from '../components/Banner.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { computePoints, planAlerts } from '../lib/alerts/points';
  import { alerts } from '../lib/alerts/webAlertService';
  import { formatMs } from '../lib/format';
  import { liveSettings, liveStats, liveTasks, taskMap } from '../lib/live';
  import type { ActiveSession } from '../lib/model';
  import { keepAwake } from '../lib/platform/wakeLock';
  import { review } from '../lib/review.svelte';
  import * as svc from '../lib/services/sessionService';
  import { typicalSec } from '../lib/stats/stats';
  import { sessionElapsedMs } from '../lib/time/elapsed';

  let { active }: { active: ActiveSession } = $props();

  const tasks = liveTasks();
  const stats = liveStats();
  const settings = liveSettings();

  let now = $state(Date.now());
  let banners = $state<string[]>([]);
  let confirmCancel = $state(false);
  let busy = false;

  const paused = $derived(active.pausedAt != null);
  const sessionMs = $derived(sessionElapsedMs(active, now));
  const task = $derived(active.taskId ? taskMap($tasks).get(active.taskId) : undefined);
  const maxMs = $derived(task?.maxMin ? task.maxMin * 60_000 : null);
  const windowMs = $derived(active.windowMin ? active.windowMin * 60_000 : 0);
  // Countdown when the task has a maximum. Round up so it reads 0:00 only at the end.
  const shownMs = $derived(maxMs != null ? Math.ceil(Math.max(0, maxMs - sessionMs) / 1000) * 1000 : sessionMs);

  // Re-render clock. Elapsed is always recomputed from stored timestamps.
  let tick: ReturnType<typeof setInterval>;
  const refresh = () => (now = Date.now());
  onMount(() => {
    tick = setInterval(refresh, 250);
    document.addEventListener('visibilitychange', refresh);
  });
  onDestroy(() => {
    clearInterval(tick);
    document.removeEventListener('visibilitychange', refresh);
    alerts.cancel();
    alerts.onFired = () => {};
    keepAwake(false);
  });

  // Wake lock follows the setting while this screen is up.
  $effect(() => {
    if ($settings) keepAwake($settings.wakeLock);
  });

  // Ids already announced/bannered in this view, to avoid duplicates before the DB write round-trips.
  const handled = new Set<string>();
  const awayText = (id: string, text: string) => `Passed while away: ${id === 'window' ? 'window, ' : ''}${text}`;

  alerts.onFired = (alert, played) => {
    handled.add(alert.id);
    if (!played) banners = [...banners, awayText(alert.id, alert.text)];
    void svc.markAlertsFired([alert.id]);
  };

  // (Re)plan alerts whenever the session, task or history change. Not on clock ticks. None while paused.
  $effect(() => {
    if (!$stats || !$tasks) return;
    if (active.pausedAt != null) {
      alerts.cancel(); // rescheduled on resume
      return;
    }
    const t = active.taskId ? taskMap($tasks).get(active.taskId) : undefined;
    const points = computePoints({
      windowMin: active.windowMin,
      taskName: t?.name,
      typicalSec: t ? typicalSec(t, $stats.get(t.id)) : null,
      taskAlert: t?.taskAlert ?? false,
    });
    const wall = Date.now();
    const nowSessionMs = sessionElapsedMs(active, wall);
    const plan = planAlerts(points, [...active.alertsFired, ...handled], nowSessionMs);
    if (plan.stale.length) {
      plan.stale.forEach((p) => handled.add(p.id));
      untrack(() => (banners = [...banners, ...plan.stale.map((p) => awayText(p.id, p.text))]));
      void svc.markAlertsFired(plan.stale.map((p) => p.id));
    }
    alerts.schedule(plan.upcoming.map((p) => ({ id: p.id, text: p.text, at: wall + (p.atSessionMs - nowSessionMs) })));
  });

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
      refresh();
    }
  }

  const togglePause = () => act(() => (paused ? svc.resume() : svc.pause()));
  const endTask = () =>
    act(async () => {
      review.ending = true;
      try {
        review.current = await svc.end(Date.now(), task?.maxMin != null ? task.maxMin * 60 : undefined);
      } finally {
        review.ending = false;
      }
    });
  const cancel = () =>
    act(async () => {
      confirmCancel = false;
      await svc.cancel();
    });

  // Countdown reached zero: end automatically and go to Review.
  $effect(() => {
    if (maxMs != null && !paused && sessionMs >= maxMs) untrack(endTask);
  });
</script>

<!-- Any tap re-unlocks audio (needed after a reload restores a running session without a gesture). -->
<div class="timer page" class:paused onpointerdown={() => alerts.unlock()} role="presentation">
  <header class="topbar">
    <span></span>
    <button class="x-btn" onclick={() => (confirmCancel = true)} aria-label="Cancel session">✕</button>
  </header>

  <Banner messages={banners} ondismiss={(i) => (banners = banners.filter((_, j) => j !== i))} />

  <section class="clock">
    <div class="paused-label" class:on={paused}>Paused</div>
    <div class="task-name" class:anything={!active.taskId}>{task?.name ?? 'Anything'}</div>
    <div class="time tabular">{formatMs(shownMs)}</div>
    {#if maxMs != null}<div class="muted small">counting down from {task?.maxMin} min</div>{/if}

    {#if windowMs}
      <div class="window">
        <div class="bar">
          <div class="fill" class:over={sessionMs > windowMs} style:width="{Math.min(100, (sessionMs / windowMs) * 100)}%"></div>
        </div>
        <span class="muted small tabular">
          {sessionMs > windowMs ? `+${formatMs(sessionMs - windowMs)} over` : `${formatMs(windowMs - sessionMs)} left`}
          of {active.windowMin} min
        </span>
      </div>
    {/if}
  </section>

  <section class="controls">
    <button class="btn primary big" onclick={endTask}>End Task</button>
    <button class="btn big" class:resume={paused} onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
  </section>
</div>

{#if confirmCancel}
  <ConfirmDialog
    message="Cancel this session? {formatMs(sessionMs)} won't be saved."
    confirmLabel="Cancel session"
    cancelLabel="Keep going"
    danger
    onconfirm={cancel}
    oncancel={() => (confirmCancel = false)}
  />
{/if}

<style>
  .timer {
    min-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  .clock {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 8dvh;
    gap: 12px;
    text-align: center;
  }
  .time {
    font-size: clamp(64px, 22vw, 104px);
    font-weight: 200;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .paused .time,
  .paused .window {
    opacity: 0.45;
  }
  .paused-label {
    color: var(--paused);
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    visibility: hidden; /* reserves its space so the clock never moves */
  }
  .paused-label.on {
    visibility: visible;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .task-name {
    font-size: 28px;
    font-weight: 600;
  }
  .task-name.anything {
    color: var(--muted);
    font-weight: 500;
  }
  .window {
    margin-top: 16px;
    width: min(280px, 80%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .bar {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
  }
  .fill.over {
    background: var(--danger);
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 8px;
  }
  .big {
    min-height: 72px;
    font-size: 20px;
    border-radius: 18px;
  }
  .resume {
    background: var(--paused);
    color: #fff;
  }
  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }
</style>
