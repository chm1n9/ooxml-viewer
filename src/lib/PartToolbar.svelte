<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import Popover from './Popover.svelte';

  export let path: string;
  export let dependencies: string[] = [];
  export let referencedBy: string[] = [];
  $: groups = [
    { label: 'References', arrow: '↑', description: 'Files referenced by the current file', paths: dependencies },
    { label: 'Referenced by', arrow: '↓', description: 'Files that reference the current file', paths: referencedBy },
  ];

  const dispatch = createEventDispatcher<{ selectPath: { path: string }; revealPath: { path: string } }>();
  const panelId = `dependencies-${crypto.randomUUID()}`;
  let open = false;
  let trigger: HTMLButtonElement | null = null;
  let panel: HTMLDivElement | null = null;
  let triggerHovered = false;
  let panelHovered = false;
  let keyboardOpen = false;
  let closeTimeout: ReturnType<typeof setTimeout> | undefined;

  function showDependencies() {
    clearTimeout(closeTimeout);
    open = true;
  }

  function closeDependencies() {
    clearTimeout(closeTimeout);
    open = false;
    panelHovered = false;
    keyboardOpen = false;
  }

  function scheduleClose() {
    clearTimeout(closeTimeout);
    closeTimeout = setTimeout(() => {
      if (!triggerHovered && !panelHovered && !keyboardOpen) closeDependencies();
    }, 220);
  }

  async function openFromKeyboard() {
    keyboardOpen = true;
    showDependencies();
    await tick();
    if (open) panel?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function onTriggerClick(event: MouseEvent) {
    if (event.detail === 0) void openFromKeyboard();
    else showDependencies();
  }

  function onOutsideInteraction(event: Event) {
    if (!open || !(event.target instanceof Node)) return;
    if (event.type === 'focusin' && !keyboardOpen) return;
    if (!trigger?.contains(event.target) && !panel?.parentElement?.contains(event.target)) closeDependencies();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.target === trigger && event.key === 'ArrowDown') {
      event.preventDefault();
      void openFromKeyboard();
    }
    if (open && event.key === 'Escape') {
      event.preventDefault();
      closeDependencies();
      trigger?.focus();
    }
  }

  function selectDependency(dependency: string) {
    closeDependencies();
    trigger?.focus();
    dispatch('selectPath', { path: dependency });
  }

  onDestroy(() => clearTimeout(closeTimeout));
</script>

<svelte:window on:pointerdown={onOutsideInteraction} on:focusin={onOutsideInteraction} on:keydown={onKeydown} />

<div class="shrink-0 flex items-center h-10 box-border gap-2 px-3 text-xs border-b border-border-base bg-bg-secondary">
  <div class="part-path-space">
  <button
    type="button"
    class="part-path"
    title={`Locate in file tree: ${path}`}
    aria-label={`Locate in file tree: ${path}`}
    on:click={() => { closeDependencies(); dispatch('revealPath', { path }); }}
  >{path}</button>
  </div>
  {#if path}
    <button
      bind:this={trigger}
      type="button"
      class="dependency-trigger shrink-0 h-7 box-border inline-flex items-center gap-1.5 px-2 py-0 whitespace-nowrap"
      aria-expanded={open}
      aria-controls={panelId}
      title={`References: ${dependencies.length} · Referenced by: ${referencedBy.length}`}
      aria-label={`Relations: references ${dependencies.length}, referenced by ${referencedBy.length}`}
      on:mouseenter={() => { triggerHovered = true; keyboardOpen = false; showDependencies(); }}
      on:mouseleave={() => { triggerHovered = false; scheduleClose(); }}
      on:click={onTriggerClick}
    >
      Relations
      <span class="relation-counts" aria-hidden="true"><span>↑{dependencies.length}</span><span>↓{referencedBy.length}</span></span>
      <span class="w-3 h-3 {open ? 'i-tabler-chevron-up' : 'i-tabler-chevron-down'}" aria-hidden="true"></span>
    </button>
  {/if}
  <slot />
</div>

<Popover
  visible={open}
  anchor={trigger}
  on:mouseenter={() => { panelHovered = true; keyboardOpen = false; showDependencies(); }}
  on:mouseleave={() => { panelHovered = false; scheduleClose(); }}
>
  <div bind:this={panel} id={panelId} class="flex flex-col">
    {#each groups as group (group.label)}
    <div class="relation-group">
    <div class="dependency-heading" title={group.description}>
      <span><span aria-hidden="true">{group.arrow}</span> {group.label}</span>
      <span class="dependency-count">{group.paths.length}</span>
    </div>
    {#each group.paths as dependency, index (index)}
      {@const separator = dependency.lastIndexOf('/')}
      {@const name = dependency.slice(separator + 1)}
      {@const directory = separator >= 0 ? dependency.slice(0, separator) + '/' : ''}
      <button
        type="button"
        class="dependency-item"
        title={dependency}
        aria-label={dependency}
        on:click={() => selectDependency(dependency)}
      >
        <span class="dependency-details">
          <span class="dependency-directory">{directory}</span>
          <span class="dependency-name">{name}</span>
        </span>
      </button>
    {/each}
    </div>
    {/each}
  </div>
</Popover>

<style>
  .part-path-space {
    flex: 1;
    min-width: 0;
  }
  .part-path,
  .dependency-trigger {
    height: 28px;
    box-sizing: border-box;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .part-path:hover,
  .dependency-trigger:hover,
  .dependency-trigger[aria-expanded='true'] {
    background: var(--color-bg-element);
  }
  .part-path:focus-visible,
  .dependency-trigger:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  .part-path {
    display: block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding: 0 8px;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    line-height: 20px;
    text-align: left;
  }
  .relation-counts {
    display: inline-flex;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  .dependency-heading {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-bg-white);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    margin-bottom: 4px;
    color: var(--color-text-primary);
    font-size: 12px;
    font-weight: 600;
  }
  .relation-group + .relation-group {
    margin-top: 12px;
  }
  .dependency-count {
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--color-bg-element);
    font-variant-numeric: tabular-nums;
  }
  .dependency-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 3px 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .dependency-item:hover,
  .dependency-item:focus-visible {
    background: var(--color-bg-element);
  }
  .dependency-item:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
  .dependency-details {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    line-height: 18px;
  }
  .dependency-name {
    flex: 0 0 auto;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dependency-directory {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text-secondary);
  }
</style>
