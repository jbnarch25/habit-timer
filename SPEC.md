# Habit Timer — SPEC

Describes the app as it is (or is about to be, per the active brief). Present tense only. History and reasoning live in DECISIONS.md; future ideas in ROADMAP.md.

## 1. Purpose and principles

Personal-use PWA for iPhone, installed to the home screen. Single user, no accounts, no backend. Deciding what to do with a chunk of time is the hard part; the app filters your tasks to fit a time window, times the one you pick, and learns how long things actually take.

- **Reduce friction above all.** The fastest path is one tap.
- **Progressive disclosure.** The default UI is the simple case; extra options stay quiet.
- **Single focus.** During a session, show only the current task.
- **Capture raw data, derive everything else.** Store timestamps and durations; compute stats on read. (Exception: canceled and un-filed untitled sessions are not stored at all.)

Current phase: mechanics and content. Visual design comes later; keep styling simple.

## 2. Platform

- Vite + TypeScript + Svelte. `vite-plugin-pwa` for manifest and service worker (installable, offline).
- IndexedDB via Dexie. Call `navigator.storage.persist()` on first launch.
- Static hosting over HTTPS.
- iPhone portrait first. Respect safe-area insets. Dark mode via `prefers-color-scheme`.
- iOS suspends PWA JavaScript in the background, so:
  - **Screen Wake Lock** during sessions, on by default. Re-acquire on `visibilitychange`. Feature-detect, degrade quietly.
  - **Audio and speech** unlocked inside the Start tap (iOS requires a user gesture). In the same tap, set `navigator.audioSession.type = 'playback'` so alerts sound even with the ring/silent switch on.
  - If the app resumes after an alert point passed, show a banner; don't play a stale alert.

## 3. Data model

Plain records; logic in separate functions. Records reference each other by ID.

```ts
Task {
  id: string
  name: string                 // required, unique (case- and whitespace-insensitive)
  minChunkMin?: number         // divisible task: smallest worthwhile chunk
  goalMin?: number             // target time; stands in for median where noted
  maxMin?: number              // timer counts down from this; session auto-ends at zero
  taskAlert: boolean           // default false
  archived: boolean
  createdAt: number            // epoch ms
}

Session {
  id: string
  taskId: string               // every saved session has a task
  startedAt: number
  endedAt: number
  durationSec: number          // excludes paused time; source of truth for stats
  windowMin?: number           // absent = infinite window
  pauses: { startedAt: number, endedAt: number }[]
}

ActiveSession {                // at most one; persisted so a force-quit loses nothing
  startedAt: number
  taskId: string | null        // null = "Start Anything"
  windowMin?: number
  pausedAt: number | null
  pauses: { startedAt: number, endedAt: number }[]
  alertsFired: string[]
}
```

Elapsed time is always computed from timestamps: `(now or pausedAt) − startedAt − total paused time`. Never accumulate ticks.

**Derived on read, never stored:**
- **Median:** median `durationSec` of the task's last 10 sessions of at least 30 seconds.
- **Typical time:** goal time if set, otherwise median.
- **Last done:** most recent session's date, plus session count.

## 4. Screens

### Start screen
- Window input: duration scroll wheel (default ∞) and end-time scroll wheel (default "…"). Setting one updates the other ("session, ending at 9:33pm").
- Tasks, History and Settings controls are large enough to tap easily. Tasks and History are prominent and visually distinct from the rest of the screen.

### Task selection
- Sortable table: task, last done. Default sort: last done, oldest first (never-done tasks at the top). Archived tasks never appear.
- **Window filter** (first property set decides):
  1. Minimum chunk: shows if chunk ≤ window.
  2. Maximum: shows if max ≤ window.
  3. Goal time: shows if goal ≤ window.
  4. Median: shows if median ≤ window.
  5. None of these: always shows.
  Infinite window: no filtering.
- **"Start Anything"** is always the top row, selected by default. It's a plain stopwatch with no task.
- Tapping a row only selects it.
- Big start button at the bottom, labeled with the selection: "Start Anything" / "Start ‹task name›".
- **"+ New Task"** expands a collapsed quick-create area. It asks only for the name, using the task-name combobox; other properties are set in the Tasks tab. While it's open and incomplete, the button reads "Start What?"; once valid, "Start ‹new task name›". The task is created on Start and kept even if the session is canceled.

### Timer
- Lead-in: a visual 3‑2‑1 with a beep on each count (silent if beep is off in Settings), then the clock starts. `startedAt` is set when the clock starts, after the lead-in.
- Shows elapsed time and the task name ("Anything" for Start Anything). With a maximum set, counts down from the max instead.
- Controls: **End Task** (to review), **Pause / Resume** (freezes the clock, logs the pause, alerts shift accordingly; paused state is obvious), **X** (cancel; large enough to hit easily; confirmation; the session is not saved). During the lead-in, X cancels immediately with no confirmation.
- At zero on a countdown, the session ends automatically and goes to review.

### Review
- Task name and time taken.
- Below: delta vs window length (if a window was set) and delta vs typical time (if one exists).
- No options or editing, except for **Start Anything** sessions: an inline "Add to tasks?" opens the task-name combobox. Skipping it means the session is not saved.
- A Done button returns to Start. Task sessions are saved at End Task, not when you leave Review.

### Task-name combobox (shared component)
- Type a name; see fuzzy-matched existing tasks; pick one or create new.
- No duplicates: an exact match (ignoring case and extra whitespace) selects the existing task.
- Archived matches appear last, marked archived. Picking one un-archives it.

### Tasks tab
- Big + in a circle for New Task. Task list with a search bar. Archived tasks behind a filter.
- "…" menu per task: Edit, Archive, Delete. Delete removes the task and all its sessions, after a confirmation ("Delete Dishes and its 12 sessions?").
- New Task and Edit open a full sheet from the bottom with all properties: name, minimum chunk, goal time, maximum, task alert toggle.

### History
- Sessions by date. Untitled sessions never appear (they're either filed to a task or not saved).
- Row line 1: start timestamp and window length (omitted for infinite windows), existing size and font.
- Row line 2: task name and session length, slightly emphasized.
- "…" menu per session: Delete. View and delete only.

### Settings
- Export / import, beep on/off, voice on/off (default off), voice selection, wake lock toggle.

## 5. Alerts

Beep via Web Audio. A spoken announcement via `speechSynthesis` exists but is off by default (Voice setting); its wording is unspecified for now. Behind an `AlertService` interface (`schedule(points)`, `cancel()`). No alerts fire while paused.

- **Window alert:** at `windowMin` of session time, if a window was set. Pattern: three short beeps and one long.
- **Task alert:** one per session, at the task's typical time (goal if set, otherwise median), measured excluding pauses. Only if `task.taskAlert` is on and a typical time exists.
- **Collision:** if the task alert falls within 1 minute of the window alert, skip the task alert. The window alert always wins.

## 6. Export / import

- JSON: `{ schemaVersion: 2, exportedAt, tasks, sessions }`.
- Import replaces everything, after confirmation.
- Export via share sheet (`navigator.share` with a file), falling back to download.
