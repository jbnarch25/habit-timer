<script lang="ts">
  import { TIMES_OF_DAY, type DurationMode, type Task, type TimeOfDay } from '../lib/model';
  import { createTask, defaultMedianAlert, setArchived, updateTask } from '../lib/services/taskService';
  import Sheet from './Sheet.svelte';

  let { task, onclose }: { task?: Task; onclose: () => void } = $props();

  // Form state is seeded once from the task being edited.
  // svelte-ignore state_referenced_locally
  const t = task;
  let name = $state(t?.name ?? '');
  let mode = $state<DurationMode>(t?.durationMode ?? 'fixed');
  let category = $state(t?.category ?? '');
  let estimateMin = $state<number | ''>(t?.estimateMin ?? '');
  let minMin = $state<number | ''>(t?.minMin ?? '');
  let maxMin = $state<number | ''>(t?.maxMin ?? '');
  let frequency = $state<number | ''>(t?.targetFrequencyDays ?? '');
  let times = $state<TimeOfDay[]>(t?.preferredTimes ?? []);
  let medianAlert = $state(t?.medianAlert ?? defaultMedianAlert('fixed'));
  let medianAlertTouched = $state(!!t);
  let more = $state(false);

  function setMode(m: DurationMode) {
    mode = m;
    if (!medianAlertTouched) medianAlert = defaultMedianAlert(m);
  }

  const num = (v: number | '' | null | undefined) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));

  async function save() {
    if (!name.trim()) return;
    const fields = {
      name,
      durationMode: mode,
      category: category.trim() || undefined,
      estimateMin: mode === 'fixed' ? num(estimateMin) : undefined,
      minMin: mode === 'flexible' ? num(minMin) : undefined,
      maxMin: mode === 'flexible' ? (num(maxMin) ?? null) : undefined,
      targetFrequencyDays: num(frequency),
      preferredTimes: times.length ? [...times] : undefined,
      medianAlert,
    };
    if (t) await updateTask(t.id, fields);
    else await createTask(fields);
    onclose();
  }

  async function toggleArchive() {
    if (!t) return;
    await setArchived(t.id, !t.archived);
    onclose();
  }

  function toggleTime(x: TimeOfDay) {
    times = times.includes(x) ? times.filter((y) => y !== x) : [...times, x];
  }
</script>

<Sheet title={t ? 'Edit task' : 'New task'} {onclose}>
  <div class="form">
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" placeholder="Task name" bind:value={name} autofocus={!t} enterkeyhint="done" />

    <div class="segmented">
      <button class:on={mode === 'fixed'} onclick={() => setMode('fixed')}>Fixed</button>
      <button class:on={mode === 'flexible'} onclick={() => setMode('flexible')}>Flexible</button>
    </div>
    <p class="muted small hint">
      {mode === 'fixed'
        ? 'Takes about the same time every time (put laundry on).'
        : 'Any chunk counts as progress (dishes).'}
    </p>

    {#if !more}
      <button class="link" onclick={() => (more = true)}>More options</button>
    {:else}
      {#if mode === 'fixed'}
        <label class="field">
          Estimate (min), used until there's history
          <input type="number" inputmode="numeric" min="0" bind:value={estimateMin} />
        </label>
      {:else}
        <div class="two">
          <label class="field">
            Smallest chunk (min)
            <input type="number" inputmode="numeric" min="0" bind:value={minMin} />
          </label>
          <label class="field">
            Max (min), blank = open-ended
            <input type="number" inputmode="numeric" min="0" bind:value={maxMin} />
          </label>
        </div>
      {/if}
      <label class="field">
        Category
        <input type="text" placeholder="e.g. chores, cooking" bind:value={category} />
      </label>
      <label class="field">
        Target frequency (every N days)
        <input type="number" inputmode="numeric" min="1" bind:value={frequency} />
      </label>
      <div class="field">
        Preferred times
        <div class="row wrap">
          {#each TIMES_OF_DAY as x}
            <button class="chip" class:on={times.includes(x)} onclick={() => toggleTime(x)}>{x}</button>
          {/each}
        </div>
      </div>
      <div class="card">
        <label class="toggle-row">
          <span>Announce when a lap reaches the usual time</span>
          <input
            type="checkbox"
            class="switch"
            bind:checked={medianAlert}
            onchange={() => (medianAlertTouched = true)}
          />
        </label>
      </div>
    {/if}

    <button class="btn primary block" onclick={save} disabled={!name.trim()}>Save</button>
    {#if t}
      <button class="btn block" class:danger={!t.archived} onclick={toggleArchive}>
        {t.archived ? 'Unarchive' : 'Archive'}
      </button>
    {/if}
  </div>
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hint {
    margin: -4px 4px 0;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: end;
  }
  .field .row {
    margin-top: 4px;
  }
  .chip {
    text-transform: capitalize;
  }
  .link {
    align-self: flex-start;
  }
</style>
