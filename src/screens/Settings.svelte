<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { alerts, loadVoices } from '../lib/alerts/webAlertService';
  import { buildExport, importReplaceAll, parseExport, shareOrDownload } from '../lib/io/exportImport';
  import { liveSettings } from '../lib/live';
  import type { ExportFile, Settings } from '../lib/model';
  import { isPersisted } from '../lib/platform/storage';
  import { wakeLockSupported } from '../lib/platform/wakeLock';
  import { navigate } from '../lib/router.svelte';
  import { updateSettings } from '../lib/services/settingsService';

  const settings = liveSettings();
  let voices = $state<SpeechSynthesisVoice[]>([]);
  let persisted = $state<boolean | null>(null);
  let message = $state('');
  let pendingImport = $state<ExportFile | null>(null);
  let fileInput = $state<HTMLInputElement>();

  onMount(async () => {
    persisted = await isPersisted();
    const lang = navigator.language.split('-')[0];
    voices = (await loadVoices()).sort(
      (a, b) => Number(b.lang.startsWith(lang)) - Number(a.lang.startsWith(lang)) || a.name.localeCompare(b.name),
    );
  });

  const set = (changes: Partial<Settings>) => updateSettings(changes);

  function test() {
    if (!$settings) return;
    alerts.unlock();
    alerts.setPrefs({ beep: $settings.beep, voice: $settings.voice, voiceURI: $settings.voiceURI });
    alerts.announce('Twenty minutes. Dishes usually takes twenty-five minutes.');
  }

  async function doExport() {
    const result = await shareOrDownload(await buildExport());
    message = result === 'cancelled' ? '' : 'Export ready.';
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    try {
      pendingImport = parseExport(await file.text());
    } catch (err) {
      message = `Import failed: ${(err as Error).message}`;
    }
  }

  async function confirmImport() {
    const data = pendingImport!;
    pendingImport = null;
    await importReplaceAll(data);
    message = `Imported ${data.tasks.length} tasks and ${data.sessions.length} sessions.`;
  }
</script>

<div class="page">
  <header class="topbar">
    <button class="icon-btn" onclick={() => navigate('/')}>‹ Start</button>
    <h1>Settings</h1>
    <span style="width:44px"></span>
  </header>

  {#if $settings}
    <h2 class="section-title">Alerts</h2>
    <div class="card">
      <label class="toggle-row">
        <span>Beep</span>
        <input type="checkbox" class="switch" checked={$settings.beep} onchange={(e) => set({ beep: e.currentTarget.checked })} />
      </label>
      <label class="toggle-row">
        <span>Voice</span>
        <input type="checkbox" class="switch" checked={$settings.voice} onchange={(e) => set({ voice: e.currentTarget.checked })} />
      </label>
      {#if $settings.voice && voices.length}
        <div class="toggle-row">
          <select value={$settings.voiceURI ?? ''} onchange={(e) => set({ voiceURI: e.currentTarget.value || undefined })}>
            <option value="">System default</option>
            {#each voices as v (v.voiceURI)}
              <option value={v.voiceURI}>{v.name} ({v.lang})</option>
            {/each}
          </select>
        </div>
      {/if}
      <div class="toggle-row">
        <button class="link" onclick={test}>Test alert</button>
      </div>
    </div>

    <h2 class="section-title">Combine close alerts</h2>
    <div class="card pad">
      <p class="muted small">Alerts closer than the larger of these fire as one announcement.</p>
      <div class="two">
        <label class="field">
          Minutes
          <input type="number" inputmode="decimal" min="0" value={$settings.coalesceMinMin}
            onchange={(e) => set({ coalesceMinMin: Math.max(0, Number(e.currentTarget.value) || 0) })} />
        </label>
        <label class="field">
          % of window
          <input type="number" inputmode="numeric" min="0" max="100" value={$settings.coalescePct}
            onchange={(e) => set({ coalescePct: Math.max(0, Number(e.currentTarget.value) || 0) })} />
        </label>
      </div>
    </div>

    <h2 class="section-title">Screen</h2>
    <div class="card">
      <label class="toggle-row">
        <span>
          Keep screen on during a session
          {#if !wakeLockSupported()}<br /><span class="muted small">Not supported on this device</span>{/if}
        </span>
        <input type="checkbox" class="switch" checked={$settings.wakeLock} onchange={(e) => set({ wakeLock: e.currentTarget.checked })} />
      </label>
    </div>

    <h2 class="section-title">Data</h2>
    <div class="card pad data">
      <button class="btn block" onclick={doExport}>Export (JSON)</button>
      <button class="btn block" onclick={() => fileInput?.click()}>Import… (replaces everything)</button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" onchange={onFile} hidden />
      <p class="muted small">
        Storage: {persisted === true ? 'durable' : persisted === false ? 'best-effort (may be cleared by the system)' : 'unknown'}
      </p>
      {#if message}<p class="small">{message}</p>{/if}
    </div>
  {/if}
</div>

{#if pendingImport}
  <ConfirmDialog
    message="Replace ALL current data with {pendingImport.tasks.length} tasks, {pendingImport.sessions.length} sessions and {pendingImport.segments.length} segments from this file?"
    confirmLabel="Replace everything"
    danger
    onconfirm={confirmImport}
    oncancel={() => (pendingImport = null)}
  />
{/if}

<style>
  h1 {
    font-size: 18px;
  }
  .pad {
    padding: 12px 16px;
  }
  .pad p {
    margin: 0 0 10px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .data {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .data p {
    margin: 4px 0 0;
  }
  select {
    width: 100%;
  }
</style>
