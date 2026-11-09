<script lang="ts">
  // Allocation bar: the session total split into blocks in log order. NOT a timeline.
  // Dividers are dragged with hand-rolled pointer events (touch-action: none on the handles only).
  import type { Segment, Task } from '../lib/model';
  import { moveDivider } from '../lib/services/editorService';
  import { taskColor } from '../lib/taskColor';

  let {
    segs,
    step,
    tasksById,
    oncommit,
  }: {
    segs: Segment[];
    step: number;
    tasksById: Map<string, Task>;
    oncommit: (next: Segment[]) => void;
  } = $props();

  const MIN_PX = 22; // every block keeps a grabbable size; the bar may be slightly non-proportional

  let width = $state(0);
  // Drag preview; kept after commit until fresh data arrives so the bar doesn't flash back.
  // $state.raw: a deep $state proxy can't be structured-cloned into IndexedDB on commit.
  let preview = $state.raw<Segment[] | null>(null);
  let dragging = $state<number | null>(null);

  $effect(() => {
    void segs; // new data from the DB replaces the preview
    preview = null;
  });

  const shown = $derived(preview ?? segs);

  /** Proportional widths with a floor of MIN_PX; the rest is shared by the larger blocks. */
  function layout(list: Segment[], w: number): number[] {
    if (!w || !list.length) return list.map(() => 0);
    let fixed = new Set<number>();
    for (let pass = 0; pass < list.length; pass++) {
      const free = w - fixed.size * MIN_PX;
      const rest = list.reduce((a, s, i) => (fixed.has(i) ? a : a + s.durationSec), 0) || 1;
      const next = new Set(fixed);
      list.forEach((s, i) => {
        if (!fixed.has(i) && (s.durationSec / rest) * free < MIN_PX) next.add(i);
      });
      if (next.size === fixed.size) {
        return list.map((s, i) => (fixed.has(i) ? MIN_PX : (s.durationSec / rest) * free));
      }
      fixed = next;
    }
    return list.map(() => w / list.length);
  }

  const widths = $derived(layout(shown, width));
  const offsets = $derived.by(() => {
    let x = 0;
    return widths.map((w) => {
      const o = x;
      x += w;
      return o;
    });
  });

  let drag: { i: number; x0: number; base: Segment[]; secPerPx: number; baseLeft: number } | null = null;

  function down(e: PointerEvent, i: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pairPx = widths[i] + widths[i + 1];
    const pairSec = segs[i].durationSec + segs[i + 1].durationSec;
    drag = { i, x0: e.clientX, base: segs, secPerPx: pairSec / Math.max(1, pairPx), baseLeft: segs[i].durationSec };
    dragging = i;
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const target = drag.baseLeft + (e.clientX - drag.x0) * drag.secPerPx;
    preview = moveDivider(drag.base, drag.i, target, step, Date.now());
  }

  function up() {
    if (!drag) return;
    const result = preview;
    const base = drag.base;
    drag = null;
    dragging = null;
    if (result && result !== base) oncommit(result);
    else preview = null;
  }

  const label = (s: Segment) => (s.taskId ? (tasksById.get(s.taskId)?.name ?? '?') : 'Untitled');
</script>

<div class="wrap">
  <div class="caption muted small">Allocation · not a timeline</div>
  <div class="bar" bind:clientWidth={width}>
    {#each shown as s, i (s.id)}
      <div
        class="block"
        class:untitled={s.taskId == null}
        class:first={i === 0}
        class:last={i === shown.length - 1}
        class:hot={dragging != null && (i === dragging || i === dragging + 1)}
        style:left="{offsets[i]}px"
        style:width="{widths[i]}px"
        style:background={taskColor(s.taskId)}
      >
        {#if widths[i] > 44}<span>{label(s)}</span>{/if}
      </div>
    {/each}
    {#each shown.slice(0, -1) as s, i (s.id)}
      <div
        class="divider"
        class:active={dragging === i}
        style:left="{offsets[i] + widths[i]}px"
        role="slider"
        aria-label="Divider between {label(shown[i])} and {label(shown[i + 1])}"
        aria-valuenow={shown[i].durationSec}
        tabindex="-1"
        onpointerdown={(e) => down(e, i)}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
      ><span></span></div>
    {/each}
  </div>
</div>

<style>
  .wrap {
    margin: 4px 0 16px;
  }
  .caption {
    margin: 0 4px 6px;
  }
  .bar {
    position: relative;
    height: 56px;
    border-radius: 12px;
    overflow: visible;
    background: var(--surface-2);
  }
  .block {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    border-right: 1px solid var(--bg);
    transition: filter 0.1s;
  }
  .block.first {
    border-top-left-radius: 12px;
    border-bottom-left-radius: 12px;
  }
  .block.last {
    border-top-right-radius: 12px;
    border-bottom-right-radius: 12px;
    border-right: none;
  }
  .block.untitled {
    color: var(--muted);
    border: 1px dashed var(--border);
  }
  .block span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 6px;
  }
  .block.hot {
    filter: brightness(1.15);
    box-shadow: inset 0 0 0 2px var(--text);
  }
  .divider {
    position: absolute;
    top: -8px;
    bottom: -8px;
    width: 28px;
    margin-left: -14px;
    touch-action: none; /* only the handle captures touch; the page still scrolls elsewhere */
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .divider span {
    width: 6px;
    height: 34px;
    border-radius: 3px;
    background: var(--text);
    opacity: 0.55;
    box-shadow: 0 0 0 2px var(--bg);
  }
  .divider.active span {
    opacity: 1;
    height: 44px;
  }
</style>
