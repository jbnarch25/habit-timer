<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import Banner from '../components/Banner.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import TaskPickerSheet from '../components/TaskPickerSheet.svelte';
  import { coalesceThresholdMs, computeRawPoints, planAlerts } from '../lib/alerts/points';
  import { alerts } from '../lib/alerts/webAlertService';
  import { db } from '../lib/db';
  import { formatMs } from '../lib/format';
  import { live, liveSettings, liveStats, liveTasks, taskMap } from '../lib/live';
  import type { ActiveSession } from '../lib/model';
  import { keepAwake } from '../lib/platform/wakeLock';
  import { navigate } from '../lib/router.svelte';
  import * as svc from '../lib/services/sessionService';
  import { expectedSec } from '../lib/stats/stats';
  import { lapElapsedMs, sessionElapsedMs, sessionMsAt } from '../lib/time/elapsed';

  let { active }: { active: ActiveSession } = $props();

  const tasks = liveTasks();
  const stats = liveStats();
  const settings = liveSettings();
  // svelte-ignore state_referenced_locally
  const lapCount = live(() => db.segments.where('sessionId').equals(active.sessionId).count());

  let now = $state(Date.now());
  let banners = $state<string[]>([]);
  let picking = $state(false);
  let confirmQuit = $state(false);
  let busy = false;

  const paused = $derived(active.pausedAt != null);
  const sessionMs = $derived(sessionElapsedMs(active, now));
  const lapMs = $derived(lapElapsedMs(active, active.currentLapStartedAt, now));
  const tasksById = $derived(taskMap($tasks));
  const currentTask = $derived(active.currentTaskId ? tasksById.get(active.currentTaskId) : undefined);
  const windowMs = $derived(active.windowMin ? active.windowMin * 60_000 : 0);
  const lapNumber = $derived(($lapCount ?? 0) + 1);

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

  // Alert prefs
  $effect(() => {
    if ($settings) alerts.setPrefs({ beep: $settings.beep, voice: $settings.voice, voiceURI: $settings.voiceURI });
  });

  // Ids already announced/bannered in this view, to avoid duplicates before the DB write round-trips.
  const handled = new Set<string>();

  alerts.onFired = (alert, played) => {
    alert.ids.forEach((id) => handled.add(id));
    if (!played) banners = [...banners, `Passed while away: ${alert.text}`];
    void svc.markAlertsFired(alert.ids);
  };

  // (Re)plan alerts whenever the session, lap, task, history or settings change. Not on clock ticks.
  $effect(() => {
    if (!$settings || !$stats || !$tasks) return;
    if (active.pausedAt != null) {
      alerts.cancel(); // rescheduled on resume
      return;
    }
    const task = active.currentTaskId ? taskMap($tasks).get(active.currentTaskId) : undefined;
    const raw = computeRawPoints({
      windowMin: active.windowMin,
      lapStartSessionMs: sessionMsAt(active, active.currentLapStartedAt),
      lapStartedAt: active.currentLapStartedAt,
      taskName: task?.name,
      expectedSec: task ? expectedSec(task, $stats.get(task.id)) : null,
      medianAlert: task?.medianAlert ?? false,
    });
    const t = Date.now();
    const nowSessionMs = sessionElapsedMs(active, t);
    const plan = planAlerts(
      raw,
      [...active.alertsFired, ...handled],
      nowSessionMs,
      coalesceThresholdMs(active.windowMin, $settings.coalesceMinMin, $settings.coalescePct),
    );
    const stale = plan.stale.filter((p) => !p.ids.some((id) => handled.has(id)));
    if (stale.length) {
      stale.forEach((p) => p.ids.forEach((id) => handled.add(id)));
      untrack(() => (banners = [...banners, ...stale.map((p) => `Passed while away: ${p.text}`)]));
      void svc.markAlertsFired(stale.flatMap((p) => p.ids));
    }
    alerts.schedule(plan.upcoming.map((p) => ({ ids: p.ids, text: p.text, at: t + (p.atSessionMs - nowSessionMs) })));
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

  const completeLap = () => act(() => svc.completeLap());
  const togglePause = () => act(() => (paused ? svc.resume() : svc.pause()));
  const endSession = () =>
    act(async () => {
      const s = await svc.end();
      navigate(`/session/${s.id}?fresh`);
    });
  const quit = () =>
    act(async () => {
      confirmQuit = false;
      await svc.quit();
      navigate('/');
    });
  const pickTask = (taskId: string | null) =>
    act(async () => {
      picking = false;
      await svc.setCurrentTask(taskId);
    });
</script>

<!-- Any tap re-unlocks audio (needed after a reload restores a running session without a gesture). -->
<div class="timer page" class:paused onpointerdown={() => alerts.unlock()} role="presentation">
  <header class="topbar">
    <span class="muted small">{active.windowMin ? `${active.windowMin} min window` : ''}</span>
    <button class="icon-btn quit" onclick={() => (confirmQuit = true)} aria-label="Quit session">✕</button>
  </header>

  <Banner messages={banners} ondismiss={(i) => (banners = banners.filter((_, j) => j !== i))} />

  <section class="clock">
    {#if paused}<div class="paused-label">Paused</div>{/if}
    <div class="session-time tabular">{formatMs(sessionMs)}</div>
    {#if windowMs}
      <div class="window">
        <div class="bar"><div class="fill" class:over={sessionMs > windowMs} style:width="{Math.min(100, (sessionMs / windowMs) * 100)}%"></div></div>
        <span class="muted small tabular">
          {sessionMs > windowMs ? `+${formatMs(sessionMs - windowMs)} over` : `${formatMs(windowMs - sessionMs)} left`}
        </span>
      </div>
    {/if}

    <div class="task-name" class:untitled={!currentTask}>{currentTask?.name ?? 'Untitled'}</div>
    <div class="lap muted tabular">Lap {lapNumber} · {formatMs(lapMs)}</div>
    {#if !currentTask && ($lapCount ?? 0) > 0}
      <button class="link" onclick={() => (picking = true)}>Choose next task</button>
    {/if}
  </section>

  <section class="controls">
    <button class="btn primary big" onclick={completeLap} disabled={paused}>Completed task</button>
    <div class="secondary">
      <button class="btn" class:resume={paused} onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
      <button class="btn" onclick={endSession}>End session</button>
    </div>
  </section>
</div>

{#if picking && $tasks}
  <TaskPickerSheet tasks={$tasks} title="Next task" onpick={pickTask} onclose={() => (picking = false)} />
{/if}

{#if confirmQuit}
  <ConfirmDialog
    message="Discard this session? {formatMs(sessionMs)} won't count."
    confirmLabel="Discard"
    danger
    onconfirm={quit}
    oncancel={() => (confirmQuit = false)}
  />
{/if}

<style>
  .timer {
    min-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  .quit {
    font-size: 18px;
  }
  .clock {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
  }
  .session-time {
    font-size: clamp(64px, 22vw, 104px);
    font-weight: 200;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .paused .session-time,
  .paused .lap {
    opacity: 0.45;
  }
  .paused-label {
    color: var(--paused);
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .window {
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
  .task-name {
    margin-top: 24px;
    font-size: 26px;
    font-weight: 600;
  }
  .task-name.untitled {
    color: var(--muted);
    font-weight: 500;
  }
  .lap {
    font-size: 20px;
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
  .secondary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
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
