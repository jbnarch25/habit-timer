<script lang="ts">
  // 3‑2‑1 lead-in: a beep on each count (silent if beep is off), then ondone. Nothing is stored yet,
  // so X cancels immediately with no confirmation.
  import { onDestroy, onMount } from 'svelte';
  import { alerts } from '../lib/alerts/webAlertService';

  let { taskName, ondone, oncancel }: { taskName: string; ondone: () => void; oncancel: () => void } = $props();

  let count = $state(3);
  const timers: ReturnType<typeof setTimeout>[] = [];

  onMount(() => {
    alerts.tick();
    for (const n of [2, 1]) {
      timers.push(
        setTimeout(() => {
          count = n;
          alerts.tick();
        }, (3 - n) * 1000),
      );
    }
    timers.push(setTimeout(ondone, 3000));
  });
  onDestroy(() => timers.forEach(clearTimeout));

  function cancel() {
    timers.forEach(clearTimeout);
    oncancel();
  }
</script>

<div class="leadin">
  <header class="topbar">
    <span></span>
    <button class="x-btn" onclick={cancel} aria-label="Cancel">✕</button>
  </header>
  <div class="center">
    <div class="task">{taskName}</div>
    {#key count}<div class="count tabular">{count}</div>{/key}
  </div>
</div>

<style>
  .leadin {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    padding: calc(12px + env(safe-area-inset-top)) 16px env(safe-area-inset-bottom);
  }
  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding-bottom: 15dvh;
  }
  .task {
    font-size: 26px;
    font-weight: 600;
    color: var(--muted);
  }
  .count {
    font-size: clamp(120px, 45vw, 200px);
    font-weight: 200;
    line-height: 1;
    color: var(--accent);
    animation: pop 0.9s ease-out both;
  }
  @keyframes pop {
    from {
      transform: scale(1.25);
      opacity: 0.3;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
