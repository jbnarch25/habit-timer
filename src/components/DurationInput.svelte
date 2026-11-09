<script lang="ts">
  import Sheet from './Sheet.svelte';

  let {
    title = 'Duration',
    seconds,
    onsave,
    onclose,
  }: { title?: string; seconds: number; onsave: (sec: number) => void; onclose: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let min = $state(Math.floor(seconds / 60));
  // svelte-ignore state_referenced_locally
  let sec = $state(seconds % 60);

  const total = $derived(Math.max(0, (Number(min) || 0) * 60 + (Number(sec) || 0)));

  function bump(deltaMin: number) {
    const t = Math.max(0, total + deltaMin * 60);
    min = Math.floor(t / 60);
    sec = t % 60;
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
  <div class="row wrap bumps">
    {#each [-5, -1, 1, 5] as d}
      <button class="chip" onclick={() => bump(d)}>{d > 0 ? '+' : '−'}{Math.abs(d)} min</button>
    {/each}
  </div>
  <button class="btn primary block" onclick={() => onsave(total)}>Save</button>
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
  .bumps {
    justify-content: center;
    margin: 14px 0 16px;
  }
</style>
