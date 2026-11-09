<script lang="ts">
  import { formatDuration } from '../lib/format';
  import Sheet from './Sheet.svelte';

  let {
    title = 'Duration',
    seconds,
    max,
    minSec = 0,
    hint = '',
    onsave,
    onclose,
  }: {
    title?: string;
    seconds: number;
    max?: number;
    minSec?: number;
    hint?: string;
    onsave: (sec: number) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let min = $state(Math.floor(seconds / 60));
  // svelte-ignore state_referenced_locally
  let sec = $state(seconds % 60);

  const clamp = (t: number) => Math.max(minSec, max != null ? Math.min(max, t) : t);
  const raw = $derived((Number(min) || 0) * 60 + (Number(sec) || 0));
  const total = $derived(clamp(raw));

  function setTotal(t: number) {
    const c = clamp(t);
    min = Math.floor(c / 60);
    sec = c % 60;
  }
</script>

<Sheet {title} {onclose}>
  <div class="inputs">
    <label class="field">
      Minutes
      <input type="number" inputmode="numeric" min="0" bind:value={min} />
    </label>
    <label class="field">
      Seconds
      <input type="number" inputmode="numeric" min="0" max="59" bind:value={sec} />
    </label>
  </div>
  {#if max != null}
    <p class="max muted small" class:hit={raw > max}>
      {raw > max ? `Capped at ${formatDuration(max)}` : `Max ${formatDuration(max)}`}{hint ? ` · ${hint}` : ''}
    </p>
  {/if}
  <div class="row wrap bumps">
    {#each [-5, -1, 1, 5] as d}
      <button class="chip" onclick={() => setTotal(total + d * 60)}>{d > 0 ? '+' : '−'}{Math.abs(d)} min</button>
    {/each}
  </div>
  <button class="btn primary block" onclick={() => onsave(total)}>Save {formatDuration(total)}</button>
</Sheet>

<style>
  .inputs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .inputs input {
    font-size: 28px;
    text-align: center;
  }
  .max {
    text-align: center;
    margin: 10px 0 0;
  }
  .max.hit {
    color: var(--text);
  }
  .bumps {
    justify-content: center;
    margin: 14px 0 16px;
  }
</style>
