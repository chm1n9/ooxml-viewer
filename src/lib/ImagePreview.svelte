<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Popover from './Popover.svelte';

  const dispatch = createEventDispatcher<{ selectPath: { path: string } }>();

  export let path: string | null = null;
  export let previewUrl: string | null = null;
  export let dependencies: string[] = [];

  const DEPENDS_INLINE_MAX = 3;
  let popoverVisible = false;
  let popoverHover = false;
  let hidePopoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let popoverAnchor: HTMLButtonElement | null = null;

  function showPopover() {
    if (hidePopoverTimeout) clearTimeout(hidePopoverTimeout);
    hidePopoverTimeout = null;
    popoverVisible = true;
  }
  function scheduleHidePopover() {
    if (popoverHover) return;
    hidePopoverTimeout = setTimeout(() => (popoverVisible = false), 300);
  }
  function onPopoverMouseEnter() {
    popoverHover = true;
    if (hidePopoverTimeout) clearTimeout(hidePopoverTimeout);
    hidePopoverTimeout = null;
  }
  function onPopoverMouseLeave() {
    popoverHover = false;
    scheduleHidePopover();
  }
</script>

<div class="flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-l-lg border border-border-base border-l-0">
  {#if path}
    <div class="shrink-0 flex items-center gap-2 py-2 px-4 text-xs border-b border-border-base bg-bg-secondary">
      <span class="truncate shrink-0 text-text-secondary max-w-64" title={path}>{path}</span>
      <div class="flex-1 min-w-0 grid grid-flow-col auto-cols-max gap-1.5 overflow-hidden items-center">
        {#if dependencies.length > 0}
          <span class="text-text-secondary">Depends on:</span>
          {#each dependencies.slice(0, DEPENDS_INLINE_MAX) as dep}
            <button
              type="button"
              class="dep-btn px-1.5 py-0.5 rounded bg-bg-element text-text-primary truncate max-w-[140px] hover:bg-bg-hover"
              title={dep}
              on:click={() => dispatch('selectPath', { path: dep })}
            >
              {dep.split('/').pop() ?? dep}
            </button>
          {/each}
          {#if dependencies.length > DEPENDS_INLINE_MAX}
            <button
              bind:this={popoverAnchor}
              type="button"
              class="dep-btn px-1.5 py-0.5 rounded bg-bg-element text-text-primary hover:bg-bg-hover inline-flex items-center justify-center"
              title="Show all"
              on:mouseenter={showPopover}
              on:mouseleave={scheduleHidePopover}
            >
              <span class="i-carbon-overflow-menu-horizontal w-3.5 h-3.5" aria-hidden="true"></span>
            </button>
          {/if}
        {/if}
      </div>
    </div>
    <div class="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-white">
      {#if previewUrl}
        <img src={previewUrl} alt={path} class="max-w-full max-h-full object-contain" />
      {:else}
        <span class="text-text-secondary text-sm">No preview</span>
      {/if}
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center text-text-secondary text-sm">
      Select file to view content
    </div>
  {/if}
</div>

<Popover
  visible={popoverVisible}
  anchor={popoverAnchor}
  on:mouseenter={onPopoverMouseEnter}
  on:mouseleave={onPopoverMouseLeave}
>
  {#each dependencies as dep}
    <button
      type="button"
      class="dep-btn block w-full text-left px-1.5 py-1 h-7 rounded bg-bg-element hover:bg-bg-hover text-text-primary truncate"
      title={dep}
      on:click={() => dispatch('selectPath', { path: dep })}
    >
      {dep}
    </button>
  {/each}
</Popover>
