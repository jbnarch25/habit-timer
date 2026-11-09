<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, onclose, children }: { title?: string; onclose: () => void; children: Snippet } = $props();
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
  <div class="grabber"></div>
  {#if title}
    <div class="head">
      <h2>{title}</h2>
      <button class="icon-btn" onclick={onclose} aria-label="Close">✕</button>
    </div>
  {/if}
  <div class="body">
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.45);
    z-index: 50;
    animation: fade 0.15s ease-out;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 51;
    max-height: 88dvh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    padding: 6px 16px calc(16px + env(safe-area-inset-bottom));
    max-width: 560px;
    margin: 0 auto;
    animation: up 0.2s ease-out;
  }
  .grabber {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--border);
    margin: 4px auto 6px;
    flex: none;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
  }
  h2 {
    font-size: 18px;
  }
  .body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-top: 8px;
  }
  @keyframes up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
