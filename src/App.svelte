<script lang="ts">
  import { onMount } from 'svelte';
  import { live } from './lib/live';
  import { requestPersistenceOnce } from './lib/platform/storage';
  import { router } from './lib/router.svelte';
  import { cleanupOrphans, getActive } from './lib/services/sessionService';
  import ActiveTimer from './screens/ActiveTimer.svelte';
  import History from './screens/History.svelte';
  import SessionEditor from './screens/SessionEditor.svelte';
  import Settings from './screens/Settings.svelte';
  import Start from './screens/Start.svelte';
  import Tasks from './screens/Tasks.svelte';

  // Wrapped so "loading" (undefined) is distinguishable from "no active session".
  const active = live(async () => ({ session: await getActive() }));

  onMount(() => {
    void cleanupOrphans();
    void requestPersistenceOnce();
  });
</script>

{#if $active}
  {#if $active.session}
    <!-- Single focus: while a session runs, the timer is the only screen. Survives reloads via the DB. -->
    {#key $active.session.sessionId}
      <ActiveTimer active={$active.session} />
    {/key}
  {:else if router.route.name === 'tasks'}
    <Tasks />
  {:else if router.route.name === 'history'}
    <History />
  {:else if router.route.name === 'settings'}
    <Settings />
  {:else if router.route.name === 'session'}
    {#key router.route.id}
      <SessionEditor id={router.route.id} fresh={router.route.fresh} />
    {/key}
  {:else}
    <Start />
  {/if}
{/if}
