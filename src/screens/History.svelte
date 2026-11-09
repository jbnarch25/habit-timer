<script lang="ts">
  import { db } from '../lib/db';
  import { formatDate, formatDuration, formatTime } from '../lib/format';
  import { live, liveTasks, taskMap } from '../lib/live';
  import type { Segment, Session } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { sessionTotalSec } from '../lib/services/editorService';

  interface Day {
    label: string;
    sessions: { session: Session; segments: Segment[] }[];
  }

  const tasks = liveTasks();
  const days = live(async (): Promise<Day[]> => {
    const sessions = (await db.sessions.orderBy('startedAt').reverse().toArray()).filter((s) => !s.discarded);
    const segments = await db.segments.toArray();
    const bySession = new Map<string, Segment[]>();
    for (const g of segments) {
      const list = bySession.get(g.sessionId);
      if (list) list.push(g);
      else bySession.set(g.sessionId, [g]);
    }
    const out: Day[] = [];
    for (const s of sessions) {
      const label = formatDate(s.startedAt);
      let day = out[out.length - 1];
      if (!day || day.label !== label) out.push((day = { label, sessions: [] }));
      day.sessions.push({ session: s, segments: (bySession.get(s.id) ?? []).sort((a, b) => a.order - b.order) });
    }
    return out;
  });

  const tasksById = $derived(taskMap($tasks));
</script>

<div class="page">
  <header class="topbar">
    <button class="icon-btn" onclick={() => navigate('/')}>‹ Home</button>
    <h1>History</h1>
    <span style="width:44px"></span>
  </header>

  {#if $days && $days.length === 0}
    <p class="muted">No sessions yet.</p>
  {/if}

  {#each $days ?? [] as day (day.label)}
    <h2 class="section-title">{day.label}</h2>
    <ul class="list">
      {#each day.sessions as { session, segments } (session.id)}
        <li>
          <button class="card session" onclick={() => navigate(`/session/${session.id}`)}>
            <div class="row">
              <span class="grow muted small">{formatTime(session.startedAt)}{session.windowMin ? ` · ${session.windowMin} min window` : ''}</span>
              <span class="total tabular">{formatDuration(sessionTotalSec(session))}</span>
            </div>
            {#each segments as g (g.id)}
              {@const t = g.taskId ? tasksById.get(g.taskId) : undefined}
              <div class="row seg" class:excluded={g.excluded}>
                <span class="grow" class:muted={!t}>{t?.name ?? 'Untitled'}{g.completed ? '' : ' · unfinished'}</span>
                <span class="tabular muted">{formatDuration(g.durationSec)}</span>
              </div>
            {/each}
          </button>
        </li>
      {/each}
    </ul>
  {/each}
</div>

<style>
  h1 {
    font-size: 18px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .session {
    width: 100%;
    text-align: left;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .session:active {
    background: var(--surface-2);
  }
  .total {
    font-weight: 600;
  }
  .seg {
    font-size: 15px;
  }
  .seg.excluded {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
