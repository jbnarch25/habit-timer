<script lang="ts">
  let { value = $bindable() }: { value: number | undefined } = $props();

  const PRESETS = [10, 15, 20, 30, 45, 60];
  let open = $state(false);
  let custom = $state('');

  function pick(v: number | undefined) {
    value = v;
    open = false;
  }

  function applyCustom() {
    const n = Math.round(Number(custom));
    if (n > 0) pick(n);
  }
</script>

{#if !open}
  <button class="link window-toggle" onclick={() => (open = true)}>
    {value ? `Window: ${value} min` : 'Set a time window'}
  </button>
{:else}
  <div class="picker">
    <div class="row wrap">
      <button class="chip" class:on={!value} onclick={() => pick(undefined)}>None</button>
      {#each PRESETS as p}
        <button class="chip" class:on={value === p} onclick={() => pick(p)}>{p}</button>
      {/each}
    </div>
    <div class="row custom">
      <input type="number" inputmode="numeric" placeholder="Custom min" bind:value={custom} />
      <button class="btn" onclick={applyCustom} disabled={!(Number(custom) > 0)}>Set</button>
    </div>
  </div>
{/if}

<style>
  .window-toggle {
    display: block;
    margin: 4px auto 0;
  }
  .picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  .picker .row {
    justify-content: center;
  }
  .custom input {
    max-width: 140px;
  }
</style>
