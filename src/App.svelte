<script lang="ts">
  import { onMount } from 'svelte';
  import { alerts } from './lib/alerts/webAlertService';
  import { live, liveSettings } from './lib/live';
  import { requestPersistenceOnce } from './lib/platform/storage';
  import { review } from './lib/review.svelte';
  import { router } from './lib/router.svelte';
  import { getActive } from './lib/services/sessionService';
  import ActiveTimer from './screens/ActiveTimer.svelte';
  import History from './screens/History.svelte';
  import Review from './screens/Review.svelte';
  import Settings from './screens/Settings.svelte';
  import Start from './screens/Start.svelte';
  import Tasks from './screens/Tasks.svelte';

  // Wrapped so "loading" (undefined) is distinguishable from "no active session".
  const active = live(async () => ({ session: await getActive() }));
  const settings = liveSettings();

  // Alert prefs follow settings app-wide (lead-in, timer, Settings test).
  $effect(() => {
    if ($settings) alerts.setPrefs({ beep: $settings.beep, voice: $settings.voice, voiceURI: $settings.voiceURI });
  });

  onMount(() => {
    void requestPersistenceOnce();
  });
</script>

{#if $active}
  {#if review.current}
    {#key review.current}
      <Review finished={review.current} />
    {/key}
  {:else if $active.session}
    <!-- Single focus: while a session runs, the timer is the only screen. Survives reloads via the DB. -->
    {#key $active.session.startedAt}
      <ActiveTimer active={$active.session} />
    {/key}
  {:else if review.ending}
    <!-- between End Task and Review: nothing, to avoid flashing Start -->
  {:else if router.route.name === 'tasks'}
    <Tasks />
  {:else if router.route.name === 'history'}
    <History />
  {:else if router.route.name === 'settings'}
    <Settings />
  {:else}
    <Start />
  {/if}
{/if}
