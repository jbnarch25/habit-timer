<script lang="ts">
  // Log: order and assignment. Drag the ⠿ handle to reorder (hand-rolled pointer events;
  // touch-action: none only on the handle so the page still scrolls).
  import { formatDuration } from '../lib/format';
  import type { Segment, Task } from '../lib/model';
  import { taskColor } from '../lib/taskColor';

  let {
    segs,
    tasksById,
    canEditDuration,
    onreorder,
    onassign,
    onduration,
    onmenu,
  }: {
    segs: Segment[];
    tasksById: Map<string, Task>;
    canEditDuration: boolean;
    onreorder: (from: number, to: number) => void;
    onassign: (s: Segment) => void;
    onduration: (s: Segment) => void;
    onmenu: (s: Segment) => void;
  } = $props();

  let list = $state<HTMLUListElement>();
  let drag = $state<{ from: number; dy: number; to: number } | null>(null);
  let y0 = 0;
  let rowH = 1;

  function down(e: PointerEvent, i: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const row = list?.children[i] as HTMLElement | undefined;
    rowH = (row?.offsetHeight ?? 56) + 6; // + gap
    y0 = e.clientY;
    drag = { from: i, dy: 0, to: i };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const dy = e.clientY - y0;
    const to = Math.max(0, Math.min(segs.length - 1, drag.from + Math.round(dy / rowH)));
    drag = { ...drag, dy, to };
  }

  function up() {
    if (!drag) return;
    const { from, to } = drag;
    drag = null;
    if (from !== to) onreorder(from, to);
  }

  /** Visual shift for rows the dragged one passes over. */
  function shift(i: number): number {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -rowH;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return rowH;
    return 0;
  }
</script>

<ul class="log" bind:this={list}>
  {#each segs as s, i (s.id)}
    {@const task = s.taskId ? tasksById.get(s.taskId) : undefined}
    <li
      class="card row-item"
      class:dragging={drag?.from === i}
      class:excluded={s.excluded}
      style:transform="translateY({drag?.from === i ? drag.dy : shift(i)}px)"
    >
      <span
        class="handle"
        role="button"
        tabindex="-1"
        aria-label="Drag to reorder"
        onpointerdown={(e) => down(e, i)}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
      >⠿</span>
      <span class="swatch" style:background={taskColor(s.taskId)}></span>
      <button class="name grow" class:untitled={!task} onclick={() => onassign(s)}>
        <span class="title">{task?.name ?? 'Untitled'}</span>
        {#if !s.completed || s.excluded}
          <span class="flags muted small">
            {[!s.completed && 'unfinished', s.excluded && 'excluded'].filter(Boolean).join(' · ')}
          </span>
        {/if}
      </button>
      <button class="dur tabular" onclick={() => onduration(s)} disabled={!canEditDuration}>
        {formatDuration(s.durationSec)}
      </button>
      <button class="icon-btn more" onclick={() => onmenu(s)} aria-label="Segment actions">⋯</button>
    </li>
  {/each}
</ul>

<style>
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row-item {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 56px;
    padding-right: 2px;
    transition: transform 0.12s ease;
    background: var(--surface);
  }
  .row-item.dragging {
    transition: none;
    position: relative;
    z-index: 5;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
  }
  .row-item.excluded .title {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .handle {
    touch-action: none;
    width: 36px;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 18px;
    cursor: grab;
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
    border: 1px solid var(--border);
  }
  .name {
    min-height: 48px;
    text-align: left;
    padding-left: 6px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }
  .title {
    font-size: 17px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .untitled .title {
    color: var(--muted);
    font-weight: 400;
  }
  .dur {
    min-height: 40px;
    min-width: 68px;
    font-size: 17px;
    font-weight: 600;
    border-radius: 10px;
    background: var(--surface-2);
    padding: 0 8px;
  }
  .more {
    font-size: 20px;
  }
</style>
