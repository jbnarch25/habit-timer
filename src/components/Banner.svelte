<script lang="ts">
  let { messages, ondismiss }: { messages: string[]; ondismiss: (i: number) => void } = $props();
</script>

{#each messages as m, i}
  <div class="banner" role="status">
    <span class="grow">{m}</span>
    <button class="icon-btn" onclick={() => ondismiss(i)} aria-label="Dismiss">✕</button>
  </div>
{/each}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border-left: 4px solid var(--accent);
    border-radius: 10px;
    padding: 6px 4px 6px 12px;
    margin-bottom: 8px;
    font-size: 15px;
  }
</style>
