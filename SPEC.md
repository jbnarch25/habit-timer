# Habit Timer — SPEC

Personal-use PWA for iPhone (installed to home screen). Single user, no accounts, no backend.

## Purpose

Deciding *what* to do with a chunk of time is the hard part of chores, cooking, exercise, hobbies. This app:
1. Times work with a stopwatch, split into per-task laps, and logs how long things actually take.
2. (Later chunk) Picks or suggests a task that fits a given time window, weighted by staleness.

## Design principles (apply to every UI decision)

- **Reduce friction above all.** The fastest path is one tap: start the stopwatch, figure out the rest later.
- **Progressive disclosure.** The default UI is the simple single-task case. Advanced features (multi-task sessions, editing, extra task options) are available but quiet, never in the way.
- **Single focus.** During an active segment, show only the current task. Choosing or adding the next thing becomes available after "Completed task," not before.
- **Capture raw data generously, derive everything else.** Store timestamps, durations and events whenever they're known, even without a current use. Never store computed stats (medians, last done, staleness); compute them on read.

---

## Chunk 1 — Foundation (BUILD THIS NOW)

### Stack
- Vite + TypeScript + Svelte
- `vite-plugin-pwa` for manifest + service worker (offline-capable, installable)
- IndexedDB via Dexie. Call `navigator.storage.persist()` on first launch to request durable storage.
- Static hosting (Cloudflare Pages or GitHub Pages; HTTPS required for install)
- Mobile-first, iPhone portrait, respect safe-area insets, dark mode via `prefers-color-scheme`

### Data model
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
  windowMin?: number                // target window chosen at start, if any
  startSource: 'quick' | 'picked' | 'suggested'   // 'quick' only in chunk 1
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
  excluded: boolean                 // user excludes from stats
}

ActiveSession {                     // at most one; persisted so app kill/reload loses nothing
  sessionId: string
  startedAt: number
  windowMin?: number
  currentLapStartedAt: number
  currentTaskId: string | null
  pausedAt: number | null           // non-null while paused
  pauses: { startedAt: number, endedAt: number }[]  // completed pauses so far
  alertsFired: string[]             // alert point ids already announced
}

// Reserve for the picker chunk (create the table, nothing writes to it yet):
PickerEvent { id, at, windowMin, suggestedTaskIds: string[], action: 'accepted' | 'rerolled' | 'dismissed', chosenTaskId? }
```

Elapsed time is ALWAYS computed from stored timestamps: `(now or pausedAt) - startedAt - total paused time` (for lap time, count only pause time after the lap start). Never accumulate ticks. Segment `durationSec` and session totals exclude paused time.
Concurrency is NOT modeled live. It's handled by allocation in the editor (see below).

### Stats (derived on read)
- **Median per task**: median `durationSec` of the last 10 qualifying segments. Qualifying = session not discarded, not excluded, ≥ 30s, and for fixed tasks `completed === true` (an unfinished fixed task isn't a real duration).
- No history → fixed: fall back to `estimateMin`; flexible: show range (`minMin`–`maxMin` / "open-ended").
- **Last done**: most recent completed segment for the task (via its session's date). Also show session/segment count.

### Session flow (active timer screen)
- **Start**: one-tap quick start with no task (untitled stopwatch), OR pick/create a task first. Optional window picker (presets 10/15/20/30/45/60 + custom), kept out of the way.
- **Display**: large elapsed session time, current task name (or "Untitled"), current lap time, window marker.
Four controls, in order of prominence:
1. **Completed task** (primary): closes the current segment (`completed: true`, `source: 'live'`, `startedAt` = lap start), clock keeps running, a new untitled lap begins. Only now is "choose next task" offered (optional; can stay untitled). Rapid taps are allowed: rack up several untitled laps and name them afterward.
2. **Pause / Resume**: a distraction came up. Freezes session and lap clocks; alerts don't fire while paused and are rescheduled on resume. Paused state is visually obvious. Pauses are logged on the session.
3. **End session**: closes the current segment as `completed: false`, ends the session, opens the session review/editor.
4. **Quit (X)**: bail out. Confirmation dialog ("Discard this session? 12:34 won't count."). On confirm, close the current segment as `completed: false`, save the session with `discarded: true` (not deleted), cancel alerts, release wake lock, return to the default start state. Discarded sessions and their segments are hidden from History and excluded from all stats, but kept in the data and in export. Less prominent than the others (e.g. corner X).

### Session editor (allocation, not timeline)
Works in durations. The user never types timestamps.
- Shows total session time ("You spent 19:00") and the list of segments.
- Assign a segment to a task, or create a new task inline.
- Edit a segment's duration; add a new segment (e.g. split 19:00 into dishes 9, laundry 7, stretching 3). Edited/created segments get `source: 'edited'` and no `startedAt`.
- Any unallocated remainder shows as an untitled segment.
- Allocations summing to MORE than the total is allowed (this is how concurrency is represented); show a soft note, not an error.
- Toggle completed, toggle excluded, delete a segment.
- Same editor is reachable later from History.

### Screens
1. **Home / Tasks**: big quick-start button; task list (name, median or range, last done); tap a task to start with it; add/edit/archive. Advanced task fields (mode details, frequency, preferred times) behind "More options."
2. **Active timer**: as above. Screen stays on.
3. **Session editor**: as above.
4. **History**: sessions by date with their segments; open in editor.
5. **Settings**: export/import, alert preferences, wake lock toggle.

### Alerts (audio/voice, not push notifications)
iOS suspends PWA JavaScript when backgrounded or locked, so:
- **Screen Wake Lock** (`navigator.wakeLock`) during an active session, ON by default. Keeping the timer visible on screen is a feature. Re-acquire on `visibilitychange`. Feature-detect; degrade quietly.
- **Beep** via Web Audio + **spoken announcement** via `speechSynthesis` using iOS system voices ("Twenty minutes. Dishes usually takes twenty-five."). Unlock both inside the Start tap (iOS requires a user gesture).
- If the app resumes after an alert point passed while backgrounded, show a visual banner; don't play a stale alert.
- All behind an `AlertService` interface (`schedule(points)`, `cancel()`).

Alert points:
- **Window** (session-level): at `windowMin` of session time, if a window was set.
- **Median** (segment-level): for the current segment's task, only if `task.medianAlert` is true and a median/estimate exists. Measured from the lap start (excluding pauses). Re-armed each time a new segment begins.
- **Coalescing:** if two points fall within `max(2 min, 15% of window)` of each other, fire ONE combined announcement at the earlier time. Thresholds are settings.
- Settings: beep on/off, voice on/off, voice selection (`speechSynthesis.getVoices()`), coalescing thresholds.

### Export / import
- JSON: `{ schemaVersion: 1, exportedAt, tasks, sessions, segments, pickerEvents }`.
- Import: replace-all with confirmation.
- Export via share sheet (`navigator.share` with file), falling back to download.

### Acceptance criteria
- Installs to iPhone home screen and runs standalone and offline.
- Quick-start an untitled session, force-quit, reopen → still running with correct elapsed time.
- "Completed task" creates laps while the clock keeps running; End session opens the editor.
- Pause freezes both clocks (also across force-quit while paused); paused time is excluded from durations and alerts shift accordingly.
- Quit asks for confirmation, then the session is saved as discarded: absent from History and stats, still present in export.
- In the editor: allocate a session's time across several tasks, create a task inline, over-allocate with only a soft warning.
- With the screen awake, beep + voice fire at the window and at the current task's median; close points coalesce.
- Medians update correctly; excluded and unfinished fixed segments don't count.
- Export → wipe data → import restores everything.

---

## Later chunks (DO NOT BUILD YET — design in progress)
- **Picker:** given a window, filter tasks that fit (fixed: median/estimate ≤ window; flexible: `minMin` ≤ window), rank by staleness (time since last completed segment relative to `targetFrequencyDays`; partial progress may count partially), weighted random. Possible extra signals: `preferredTimes` / learned time-of-day from segment `startedAt`, reroll/skip history from `PickerEvent`. "Choose for me" = one pick + reroll. "Show options" = max 3. Picking starts the session with that window and task, `startSource` set accordingly.
- **Live concurrency** (segments with multiple tasks): deferred; migration would be `taskId → taskIds[]`.
- Possibly push notifications via a small backend if foreground-only alerts prove insufficient.
