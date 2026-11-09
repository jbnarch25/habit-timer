# Habit Timer — SPEC

Personal-use PWA for iPhone (installed to home screen). Single user, no accounts, no backend.

**How this spec is organized:** the reference sections (data model, stats, alerts, export) describe the system as it should be. Chunk sections describe work: **DONE** = built, **BUILD THIS NOW** = in flight (written as changes to what exists), **PLANNED** = decided but not scheduled. Open questions are not buildable until resolved.

## Purpose

Deciding *what* to do with a chunk of time is the hard part of chores, cooking, exercise, hobbies. This app:
1. Times work with a stopwatch, split into per-task laps, and logs how long things actually take.
2. (Later chunk) Picks or suggests a task that fits a given time window, weighted by staleness.

## Design principles (apply to every UI decision)

- **Reduce friction above all.** The fastest path is two taps: Next (window defaults to ∞) → Start Anything. Start the stopwatch, figure out the rest later.
- **Progressive disclosure.** The default UI is the simple single-task case. Advanced features (queues, editing, extra task options) are available but quiet, never in the way.
- **Single focus, minimal interaction mid-session.** During an active segment, show only the current task (plus a quiet "Next up" when a queue exists). No task selection, skipping or reordering mid-session; fix things in review.
- **Capture raw data generously, derive everything else.** Store timestamps, durations and events whenever they're known, even without a current use. Never store computed stats (medians, last done, staleness); compute them on read.

---

## Stack
- Vite + TypeScript + Svelte
- `vite-plugin-pwa` for manifest + service worker (offline-capable, installable)
- IndexedDB via Dexie. `navigator.storage.persist()` requested on first launch.
- Hosting: GitHub Pages (public repo), deployed via GitHub Actions on push to `main`. Vite `base` and the PWA manifest `start_url`/`scope` match the `/<repo-name>/` path; hash routing.
- Mobile-first, iPhone portrait, safe-area insets, dark mode via `prefers-color-scheme`

## Data model
Entities are plain records (TS interfaces). Logic lives in separate functions/services, not on the stored objects. Records reference each other by ID; never embed copies.

```ts
Task {
  id: string
  name: string
  category?: string                 // free text, e.g. "chores", "cooking"
  durationMode: 'fixed' | 'flexible'
    // fixed:    atomic, takes about the same time every time (put laundry on ≈ 7 min)
    // flexible: divisible, any chunk counts as progress (dishes)
  estimateMin?: number              // fixed: user estimate used until real history exists
  minMin?: number                   // flexible: smallest worthwhile chunk
  maxMin?: number | null            // flexible: null/absent = open-ended
  targetFrequencyDays?: number      // e.g. 7 = weekly. For future staleness logic
  preferredTimes?: ('morning' | 'afternoon' | 'evening' | 'night')[]  // optional, for future suggestions
  medianAlert: boolean              // announce when the current lap hits this task's median.
                                    // Default: true for fixed, false for flexible. User-toggleable.
  archived: boolean
  createdAt: number                 // epoch ms
}

Session {                           // one continuous stopwatch run
  id: string
  startedAt: number                 // epoch ms
  endedAt: number                   // epoch ms
  windowMin?: number                // target window, if any (absent = ∞)
  targetEndAt?: number              // NEW (chunk 2): set when the window was chosen as a clock time
  plannedTaskIds?: string[]         // NEW (chunk 2): the queue as it stood at start. Raw data: plan vs. actual
  startSource: 'quick' | 'picked' | 'suggested'
  pauses: { startedAt: number, endedAt: number }[]  // raw pause log
  discarded: boolean                // true = user quit (X). Kept for later querying (e.g. tasks bailed on),
                                    // hidden from History and excluded from all derived stats.
}

Segment {                           // a lap within a session: time spent on one task
  id: string
  sessionId: string
  order: number                     // display sequence within the session
  taskId: string | null             // null = untitled, assign later
  durationSec: number               // SOURCE OF TRUTH for all stats
  startedAt?: number                // recorded for live laps; absent for editor-created segments
  completed: boolean                // true = "Completed task"; false = session ended mid-task
  source: 'live' | 'edited'         // measured vs. after-the-fact allocation
  editedAt?: number                 // NEW (chunk 2): epoch ms of last manual edit (raw data; used later by snap/absorber logic)
  excluded: boolean                 // user excludes from stats
}

ActiveSession {                     // at most one; persisted so app kill/reload loses nothing
  sessionId: string
  startedAt: number
  windowMin?: number
  targetEndAt?: number              // NEW (chunk 2)
  currentLapStartedAt: number
  currentTaskId: string | null
  queue: string[]                   // NEW (chunk 2): remaining queued task ids; head becomes the next lap.
                                    // A persisted row without this field is treated as [].
  pausedAt: number | null           // non-null while paused
  pauses: { startedAt: number, endedAt: number }[]  // completed pauses so far
  alertsFired: string[]             // alert point ids already announced
}

// Reserved for the picker chunk (table exists, nothing writes to it yet):
PickerEvent { id, at, windowMin, suggestedTaskIds: string[], action: 'accepted' | 'rerolled' | 'dismissed', chosenTaskId? }
```

All chunk 2 fields are optional/unindexed: no Dexie index changes, no data migration, existing data survives.

Elapsed time is ALWAYS computed from stored timestamps: `(now or pausedAt) - startedAt - total paused time` (for lap time, count only pause time after the lap start). Never accumulate ticks. Segment `durationSec` and session totals exclude paused time.
Concurrency is NOT modeled live or by overlapping segments. The user splits a session's total time across tasks in the editor; segments never sum to more than the session total. Each segment has one unambiguous duration.

## Stats (derived on read)
- **Median per task**: median `durationSec` of the last 10 qualifying segments. Qualifying = session not discarded, not excluded, ≥ 30s, and for fixed tasks `completed === true`.
- No history → fixed: fall back to `estimateMin`; flexible: show range (`minMin`–`maxMin` / "open-ended").
- **Last done**: most recent completed segment for the task (via its session's date). Also show session/segment count.
- **Window fit** (shared functions in the stats layer; the picker chunk will reuse them):
  - `typicalMin(task)` = median, else `estimateMin`, else unknown.
  - `fitsWindow(task, W)`: fixed → `typicalMin ≤ W`; flexible → `(minMin ?? 0) ≤ W`. Unknown fixed duration → "no estimate" (neither fits nor fails).
  - `fillMin(task, W)`: fixed → `typicalMin`; flexible → `min(maxMin ?? W, W)`.

## Alerts (audio/voice, not push notifications)
iOS suspends PWA JavaScript when backgrounded or locked, so:
- **Screen Wake Lock** during an active session, ON by default. Re-acquire on `visibilitychange`. Feature-detect; degrade quietly.
- **Beep** via Web Audio + **spoken announcement** via `speechSynthesis` (iOS system voices). Unlocked inside the Start tap.
- If the app resumes after an alert point passed while backgrounded, show a visual banner; don't play a stale alert.
- All behind an `AlertService` interface (`schedule(points)`, `cancel()`).

Alert points:
- **Window** (session-level): at `windowMin` of session time, if a window was set.
- **Median** (segment-level): for the current segment's task, only if `task.medianAlert` is true and a median/estimate exists. Measured from the lap start (excluding pauses). Re-armed each time a new segment begins (including when a queued task becomes current).
- **Coalescing:** if two points fall within `max(2 min, 15% of window)` of each other, fire ONE combined announcement at the earlier time. Thresholds are settings.
- Settings: beep on/off, voice on/off, voice selection, coalescing thresholds.

## Export / import
- JSON: `{ schemaVersion: 1, exportedAt, tasks, sessions, segments, pickerEvents }`. New optional fields ride along; older files import fine.
- Import: replace-all with confirmation.
- Export via share sheet (`navigator.share` with file), falling back to download.

---

## Chunk 1 — Foundation (DONE)

Built: data layer (all entities above except the chunk 2 fields), timestamp/pause math, session controls (Completed task, Pause/Resume, End, Quit-as-discarded), session editor, History, Settings, stats/medians, alerts with coalescing, wake lock, export/import, PWA install/offline, GitHub Pages deploy. Tests cover elapsed math, alert points, session service, stats.

**The screens and flows built in chunk 1 are functional placeholders.** Chunk 2 replaces the start flow, active timer layout and parts of the editor. Keep the services, data layer and alert logic.

---

## Chunk 2 — UI rework + queues (DONE)

**Built:** two-step start sequence as the default screen (`#/`), with Tasks (`#/tasks`), History and Settings off it; window fit functions (`typicalMin`, `fitsWindow`, `fillMin`) in the stats layer plus a pure step-2 list builder (`src/lib/start/taskList.ts`); queues (start, advance on Completed task, persisted on ActiveSession, `plannedTaskIds` on Session); end-time windows (`targetEndAt`, window derived at Start); active timer re-laid out around the current segment with a secondary session timer and "Next:" line; editor window delta, zero-sum clamp, `editedAt` stamping. No Dexie schema change; chunk-1 data loads unchanged. Tests: window fit + list building, queue lifecycle, end-time derivation, chunk-1 ActiveSession rows without `queue`, editor clamp and `editedAt`.

**Deviations / placeholders (decided during the build):**
- **Wheels are native `<select>`s** (iOS renders them as scroll wheels). Placeholder for a custom wheel.
- **End-time picker range:** 5-min slots from the first boundary ≥ now+5 min, up to now+3 h. Whichever of duration / end time was touched last decides the window; in end-time mode the duration control shows the derived "≈ N min".
- **Tapping a row with a non-empty queue adds it to the queue** (same as "+"); it only starts immediately when the queue is empty. Start happens via the bottom bar or Start Anything. (Owner decision.)
- **No duplicates in a queue:** queued tasks leave the list and live in the bottom bar. (Owner decision.)
- **Remaining window is computed in queue order:** `rem -= fillMin(task, rem)` per queued task, so reordering changes it; fixed tasks without an estimate contribute 0 and are counted separately in the bar ("+k without an estimate").
- **A full window (W ≤ 0) fits nothing**, including flexible tasks with no `minMin`.
- **Queue bar editing:** ↑/↓/✕ per item behind an "Edit" toggle (placeholder for drag-to-reorder).
- **Inline "+ New task" in step 2:** name + Fixed/Flexible; "Start" is offered only when the queue is empty, otherwise "Add to queue".
- **Window marker before the first Completed task** sits under the spotlight (lap = session); afterwards it moves with the secondary session timer.
- **Editor:** "+ Add segment" removed; the unallocated remainder row is the only way to add time. Chunk-1 sessions that were already over-allocated still display; the clamp only prevents making it worse.
- **`ActiveSession` also carries `startSource` and `plannedTaskIds`** (not in the interface above) so they can be written to the Session at End/Quit. `startSource` was already there in chunk 1.
- **Remaining queued tasks at End/Quit are dropped**; `plannedTaskIds` keeps the plan.
- Untested on device: median alert re-arming for each queued task is covered by design (alert id keyed by lap start; replanned when `currentTaskId` changes), not by an automated test.

All items are changes to existing chunk 1 code unless marked new.

### 2.1 Start sequence (replaces the Home Start button + WindowPicker presets)
The start sequence is the app's default screen (where the app opens and where Quit/End-review return to). Tasks, History and Settings are reached from navigation off it.

**Step 1: window.** Reads "Start a [∞] session, ending at [h:mm]".
- Duration is a scroll wheel: default **∞** (no window), then 5–120 min in 5-min steps.
- Picking a duration updates "ending at" (preview only). With ∞, "ending at" shows "…".
- The end time is also a picker (5-min steps). Choosing an end time sets `targetEndAt`; the window is derived **at the moment Start is tapped**: `windowMin = round((targetEndAt − startedAt) / 60000)`. If that's ≤ 0, treat as ∞.
- **Next** → step 2.

**Step 2: task.** A list for window W (W = remaining window, see queue below):
- **Top row, always: "Start Anything"** → starts untitled (or with the queue, if one is built).
- **Fits group:** non-archived tasks where `fitsWindow(task, W)`, sorted by `fillMin(task, W)` descending (biggest fill first; short tasks fall to the bottom). Ties: least recently done first.
- **"No estimate" group** at the bottom: fixed tasks with no median and no estimate.
- **∞ window:** no filtering; all non-archived tasks sorted by most recently used.
- **"+ New task"** at the bottom: create inline, then start with it (or queue it).
- **Tap a row** → start immediately with that single task (`startSource: 'picked'`).
- **"+" on a row** → add to the queue instead (new):
  - Once the queue is non-empty, W becomes `windowMin − Σ fillMin(queued)` and the list re-filters/re-sorts against it. (∞ stays unfiltered.)
  - A bottom bar appears: "Start N tasks · X of W min" (or "Start N tasks" for ∞). Queued items can be reordered or removed in the bar.
  - Starting sets `currentTaskId` = first queued task, `ActiveSession.queue` = the rest, `Session.plannedTaskIds` = the full queue.

### 2.2 Active timer (replaces the current layout)
- The **current segment** is the fixed, spotlighted element: task name (or "Untitled") + its stopwatch, always in the same place. On a single-segment session that's all there is (lap = session).
- After the first Completed task, a subtle secondary **session timer** (total running time) appears; the window marker, if set, belongs to it.
- **Next up** (new): when `queue` is non-empty, a quiet "Next: <task>" line under the spotlight.
- Completed laps are not listed on this screen.
- **Completed task:** closes the segment as before. The new lap takes the head of `queue` if any, otherwise untitled. **Remove the "Choose next task" link/sheet.** No input, no prompt.
- No skip or reorder mid-session. Pause, End and Quit unchanged.

### 2.3 Session editor changes
- **Header delta (new):** under "You spent 19:00", a subtle neutral delta vs. the window when one was set (e.g. "−1:00" / "+2:30"; sign only, no good/bad coloring). None for ∞.
- **Zero-sum allocation (replaces over-allocation):** segments can never sum to more than the session total. Remove the over-allocation soft note. Interim enforcement: a segment's duration input is clamped to `total − Σ other segments`; the unallocated remainder row works as today. (The real allocation UX is an open question, below; keep this simple and replaceable.)
- **`editedAt`:** set to now on every manual edit of a segment (duration, task, completed, excluded). Capture only; nothing reads it yet.

### Acceptance criteria (chunk 2)
- App opens on step 1 with ∞ selected; Next → Start Anything starts an untitled session (two taps).
- Choosing 20 min shows "ending at" correctly; choosing an end time instead derives the window at Start.
- Step 2 with W = 20: only fitting tasks show, biggest fill first; flexible tasks rank by `min(maxMin, W)`; no-estimate tasks are grouped at the bottom; archived never appear.
- Queue three tasks: list re-filters against the remaining window; bar shows count and total; session starts on task 1 with "Next: task 2" visible; Completed advances through the queue, then falls back to untitled laps.
- `plannedTaskIds` is saved on the session; queue survives force-quit.
- Median alert re-arms for each queued task as it becomes current.
- Editor shows the window delta; over-allocation is impossible; `editedAt` is written on edits.
- Existing phone data (chunk 1) still loads and displays correctly.

---

## Chunk 3 — Allocation editor (DONE)

**Built:** session editor rebuilt as header + log + allocation bar. Zero-sum logic is pure and unit-tested in `editorService` (`moveDivider`, `setDurationExact`, `splitSegment`, `deleteSegment`, `reorder`, `assign`/toggles, `withRemainder`, `barLengthSec`, `snapStep`), persisted through a single `applyEdit` diff/transaction. New components: `SegmentLog` (hand-rolled pointer-event reorder, row menu), `AllocationBar` (hand-rolled divider drag, minimum block width). The chunk 2 clamp, remainder row and over-allocation paths are removed. No schema change. Tests: every edit function, the 19:00 → 9/7/3 scenario, a 200-op randomized zero-sum invariant, virtual remainder persistence; headless browser run of drags, reorder, delete rules, tiny segments and no-write-on-view.

**Deviations / decisions (owner answers during planning unless noted):**
- **`source: 'edited'` only on duration changes.** Assign, reorder and completed/excluded toggles stamp `editedAt` but keep `source` (it means measured vs. allocated).
- **`startedAt` is kept on duration edits** (overrides the chunk 1 "edited segments have no `startedAt`" rule). New segments from Split have none.
- **Snapping is in duration terms:** a divider drag snaps the left segment's duration to a step multiple (9:37 → 9:00 / 10:00); the right neighbor takes the difference and keeps odd seconds. If the right neighbor's minimum blocks the snap, the left stops at the clamp.
- **Minimum size = min(current size, one step):** a sub-step segment can grow by drag but never shrink; shrinking only via exact input.
- **Exact input:** unsnapped seconds, own minimum 1 s (my choice; typing never deletes), neighbor clamped at min(its size, one step). The only segment's duration can't be edited (total is fixed).
- **Split:** exact halves (the original keeps the odd second), new untitled half `completed: true`, `excluded: false`. Disabled under 2 steps. Because **+** splits the last segment, **+ is disabled when the last segment is under 2 steps** (consequence, not separately specified).
- **Delete on a single named segment unassigns it**; only the untitled-merge case is refused.
- **Unallocated remainder is virtual** (replaces "materialize when opened"): shown as an untitled block/row, written (`source: 'edited'`) only with the first real edit to that session. Viewing writes nothing.
- **Drag:** hand-rolled pointer events for both log reorder (⠿ handle) and bar dividers, `touch-action: none` on handles only.
- **Row actions** are a "⋯" sheet (Split, Completed, Excluded, Delete with a label saying what it will do). Placeholder for swipe.
- **Block colors are derived from the task id** (hash → hue), untitled is neutral grey. Placeholder; no stored field.
- Legacy over-allocated sessions: bar length = segment sum, header note; no migration.

Replaces the chunk 2 interim clamp in the session editor. Separation of concerns: **order and assignment live in the log; durations live in the allocation bar.**

### Log (top)
- A list of the session's segments in `order`, each row showing task name (or "Untitled") and duration.
- **Assignment:** tapping the task name opens a task-selection sheet with a search field (reuse/extend `TaskPickerSheet`). Typing filters tasks; when nothing matches, offer "Create '<query>'" to create the task inline and assign it.
- **Reorder:** drag rows to change `order`. The allocation bar follows log order.
- **Row actions** (swipe or small row menu, kept out of the way): Split, Completed toggle, Excluded toggle, Delete.
- **Precise duration fallback:** tapping a row's duration opens a numeric input for fine edits. The bar is the primary way to change durations; this is the escape hatch for tiny segments and exact values. Changes are zero-sum: time taken from or given to the next segment (or previous, if last).
- **Add (+)** at the bottom of the log: adds an untitled segment by splitting the last segment in half. The row-menu Split does the same for that row (new untitled segment inserted right after it).

### Allocation bar (bottom)
- A horizontal bar representing the session total, divided into blocks in log order. This is an allocation view, NOT a chronological timeline; label and treat it that way.
- **Dividers** between adjacent blocks are draggable. Moving one transfers time between the two neighbors only, so the total never changes and over-allocation is impossible by construction. Remove the chunk 2 clamp and remainder pool: untitled time is simply an untitled segment.
- **Snapping:** dividers move in steps. Interim rule until per-task snap increments exist: 1-minute steps; 5-second steps for sessions under 5 minutes.
- **Minimum size:** a segment can't be dragged below one snap step. Dragging never deletes.
- **Small segments:** blocks have a minimum visual width so every divider stays grabbable (the bar may be slightly non-proportional). The log's numeric input covers precision.
- Each block shows its task name/color where width allows; the selected/dragged pair is highlighted.

### Delete
- Deleting a **named** segment unassigns it (becomes untitled in place); the time stays visible.
- Deleting an **untitled** segment merges its time into the segment above it (below, if it's first).
- Deleting the only segment isn't possible.

### Data
- Any duration, task, order, completed or excluded change sets `source: 'edited'` and `editedAt` = now on each affected segment (both neighbors on a divider drag).
- Live segments keep their `startedAt` even when reordered; the bar does not imply chronology.

### Existing data (from chunks 1–2)
- Sessions with an unallocated remainder (segments sum < total): when opened in the editor, materialize the remainder as an untitled segment at the end (`source: 'edited'`, `editedAt` = now), so the bar always covers the full total. Remove the remainder row.
- Legacy over-allocated sessions (chunk 1 test data, segments sum > total): the bar uses the segment sum as its length and the header notes the mismatch. Edits stay zero-sum from there. No migration.
- Remove the chunk 2 clamp once the bar and the zero-sum numeric input replace it.

### Implementation notes
- iOS Safari: drag reorder and divider drag need pointer events with `touch-action: none` on the drag handles, or a touch-capable library (e.g. `svelte-dnd-action` for the list). Test on the phone early.
- Keep zero-sum transfer logic in `editorService` (pure functions, unit-tested): `moveDivider`, `splitSegment`, `deleteSegment`, `setDurationExact`.

### Acceptance criteria
- A single untitled 19:00 session can be turned into dishes 9 / laundry 7 / stretching 3 using + and divider drags, without typing.
- The session total never changes during any edit; no over-allocation state is reachable.
- Reordering the log reorders the bar.
- A 30-second segment in a 60-minute session is still grabbable and editable.
- Delete follows the named/untitled rules above.
- Works by touch on a real iPhone.

---

## Open UI questions (not buildable yet)
- **Duration resolution per task** (decided in principle, needs a field + allocation UX first): storage stays to the second; each task sets a snap increment for display/editing (e.g. dishes to the minute, exercise to the second); needs a Task field, e.g. `snapSec?: number`. The live stopwatch always shows seconds; resolution applies to the editor, History and stats. Untitled segments default to 1 min. **Leftover seconds** (snapped segments vs. exact total) go to one absorber segment: the last unedited segment in order; if every segment has been edited, the one edited longest ago (via `editedAt`). The absorber stores exact seconds; display rounds to its task's increment.

---

## PLANNED / later chunks (DO NOT BUILD YET)
- **Routines (saved queues):** named, reusable queues ("Sunday reset": dishes, laundry, vacuum) that pre-populate step 2's queue. New entity + screen. Should reuse the chunk 2 queue mechanics.
- **Unfiled sessions surface:** a derived view/badge for sessions with untitled segments (no extra storage). Punted; untitled time stays in History until assigned.
- **Session delta / goal targeting:** per-task or per-session goals (finish under, fill the window) that drive how the review delta is styled. V2 candidate.
- **Picker:** given a window, filter with `fitsWindow`, rank by staleness (time since last completed segment relative to `targetFrequencyDays`; partial progress may count partially), weighted random. Possible extra signals: `preferredTimes` / learned time-of-day from segment `startedAt`, reroll/skip history from `PickerEvent`, plan-vs-actual from `plannedTaskIds`. "Choose for me" = one pick + reroll. "Show options" = max 3. Picking starts the session with that window and task, `startSource` set accordingly.
- **Live concurrency** (segments with multiple tasks): deferred; migration would be `taskId → taskIds[]`.
- Possibly push notifications via a small backend if foreground-only alerts prove insufficient.
