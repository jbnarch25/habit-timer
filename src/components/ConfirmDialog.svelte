<script lang="ts">
  import Sheet from './Sheet.svelte';

  let {
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onconfirm,
    oncancel,
  }: { message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onconfirm: () => void; oncancel: () => void } =
    $props();
</script>

<Sheet onclose={oncancel}>
  <p class="msg">{message}</p>
  <div class="actions">
    <button class="btn block" class:danger onclick={onconfirm}>{confirmLabel}</button>
    <button class="btn block" onclick={oncancel}>{cancelLabel}</button>
  </div>
</Sheet>

<style>
  .msg {
    font-size: 17px;
    text-align: center;
    margin: 8px 0 20px;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
