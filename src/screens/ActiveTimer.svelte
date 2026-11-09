<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import Banner from '../components/Banner.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { coalesceThresholdMs, computeRawPoints, planAlerts } from '../lib/alerts/points';
  import { alerts } from '../lib/alerts/webAlertService';
  import { formatMs } from '../lib/format';
  import { liveSettings, liveStats, liveTasks, taskMap } from '../lib/live';
  import { queueOf, type ActiveSession } from '../lib/model';
  import { keepAwake } from '../lib/platform/wakeLock';
  import { navigate } from '../lib/router.svelte';
  import * as svc from '../lib/services/sessionService';
  import { expectedSec } from '../lib/stats/stats';
  import { lapElapsedMs, sessionElapsedMs, sessionMsAt } from '../lib/time/elapsed';

  let { active }: { active: ActiveSession } = $props();

  const tasks = liveTasks();
  const stats = liveStats();
  const settings = liveSettings();

  let now = $state(Date.now());
  let banners = $state<string[]>([]);
  let confirmQuit = $state(false);
  let busy = false;

  const paused = $derived(active.pausedAt != null);
  const sessionMs = $derived(sessionElapsedMs(active, now));
  const lapMs = $derived(lapElapsedMs(active, active.currentLapStartedAt, now));
  const tasksById = $derived(taskMap($tasks));
  const currentTask = $derived(active.currentTaskId ? tasksById.get(active.currentTaskId) : undefined);
  const windowMs = $derived(active.windowMin ? active.windowMin * 60_000 : 0);
  // After the first "Completed task" the lap no longer equals the session.
  const multiLap = $derived(active.currentLapStartedAt !== active.startedAt);
  const nextTask = $derived.by(() => {
    const id = queueOf(active)[0];
    return id ? tasksById.get(id) : undefined;
  });

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
</script>

{#snippet windowMarker()}
  <div class="window">
    <div class="bar"><div class="fill" class:over={sessionMs > windowMs} style:width="{Math.min(100, (sessionMs / windowMs) * 100)}%"></div></div>
    <span class="muted small tabular">
      {sessionMs > windowMs ? `+${formatMs(sessionMs - windowMs)} over` : `${formatMs(windowMs - sessionMs)} left`}
      of {active.windowMin} min
    </span>
  </div>
{/snippet}

<!-- Any tap re-unlocks audio (needed after a reload restores a running session without a gesture). -->
<div class="timer page" class:paused onpointerdown={() => alerts.unlock()} role="presentation">
  <header class="topbar">
    <span></span>
    <button class="icon-btn quit" onclick={() => (confirmQuit = true)} aria-label="Quit session">✕</button>
  </header>

  <Banner messages={banners} ondismiss={(i) => (banners = banners.filter((_, j) => j !== i))} />

  <section class="clock">
    <!-- Spotlight: current segment. Fixed position; nothing above it changes size. -->
    <div class="paused-label" class:on={paused}>Paused</div>
    <div class="spotlight">
      <div class="task-name" class:untitled={!currentTask}>{currentTask?.name ?? 'Untitled'}</div>
      <div class="lap-time tabular">{formatMs(lapMs)}</div>
    </div>

    {#if nextTask}<div class="next muted">Next: {nextTask.name}</div>{/if}

    {#if multiLap}
      <div class="session">
        <span class="muted tabular">Session {formatMs(sessionMs)}</span>
        {#if windowMs}{@render windowMarker()}{/if}
      </div>
    {:else if windowMs}
      <!-- lap = session: the window marker sits with the spotlight -->
      {@render windowMarker()}
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
    justify-content: flex-start;
    padding-top: 10dvh;
    gap: 12px;
    text-align: center;
  }
  .spotlight {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .lap-time {
    font-size: clamp(64px, 22vw, 104px);
    font-weight: 200;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .paused .lap-time,
  .paused .session {
    opacity: 0.45;
  }
  .paused-label {
    color: var(--paused);
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    visibility: hidden; /* reserves its space so the spotlight never moves */
  }
  .paused-label.on {
    visibility: visible;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .next {
    font-size: 17px;
  }
  .session {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    width: 100%;
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
    font-size: 28px;
    font-weight: 600;
  }
  .task-name.untitled {
    color: var(--muted);
    font-weight: 500;
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
