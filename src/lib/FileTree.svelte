<script lang="ts">
  import { onMount, tick } from 'svelte';
  import FileTreeNode from './FileTreeNode.svelte';
  import { buildFileTree, nodeId, getFolderKeysForPath } from './fileTree';
  import type { FileEntry as FileEntryType } from './ooxml';

  export let entries: FileEntryType[] = [];
  export let selectedPath: string | null = null;
  export let fileName: string = '';
  export let modifiedPaths: Set<string> = new Set();

  let filter = '';
  let filterOpen = false;
  let filterInput: HTMLInputElement | null = null;
  let filterButton: HTMLButtonElement | null = null;
  const filterPanelId = `file-filter-${crypto.randomUUID()}`;

  async function toggleFilter() {
    if (filterOpen && !filter) {
      filterOpen = false;
      filterButton?.focus();
      return;
    }
    filterOpen = true;
    await tick();
    filterInput?.focus();
  }

  function onFilterKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    if (filter) filter = '';
    else {
      filterOpen = false;
      filterButton?.focus();
    }
  }
  let collapsedFilterKeys: string[] = [];

  let expandedKeys: string[] = [];
  let mounted = false;
  let listEl: HTMLUListElement | null = null;

  const STORAGE_PREFIX = 'ooxml-expanded-keys-';

  function getFileExtension(name: string): string {
    const match = name.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  function loadExpandedKeys(fileType: string): string[] {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + fileType);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function saveExpandedKeys(fileType: string, keys: string[]): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + fileType, JSON.stringify(keys));
    } catch {
      // ignore localStorage errors
    }
  }

  $: fileType = getFileExtension(fileName);
  $: if (mounted && fileType) {
    expandedKeys = loadExpandedKeys(fileType);
  }

  $: if (mounted && fileType && expandedKeys) {
    saveExpandedKeys(fileType, expandedKeys);
  }

  $: query = filter.trim().toLowerCase();
  $: { query; collapsedFilterKeys = []; }
  $: filteredEntries = query
    ? entries.filter((entry) => (entry.path.split('/').pop() ?? '').toLowerCase().includes(query))
    : entries;
  $: treeRoots = buildFileTree(filteredEntries);
  $: visibleExpandedKeys = query
    ? [...new Set(filteredEntries.flatMap((entry) => getFolderKeysForPath(entry.path)))].filter((key) => !collapsedFilterKeys.includes(key))
    : expandedKeys;

  // Reveal only on selection changes; manual folder toggles must remain independent.
  $: if (mounted) revealSelectedPath(selectedPath);

  function revealSelectedPath(path: string | null) {
    if (!path) return;
    const keysToExpand = getFolderKeysForPath(path);
    if (keysToExpand.length > 0) {
      expandedKeys = [...new Set([...expandedKeys, ...keysToExpand])];
    }
    void tick().then(() => {
      requestAnimationFrame(() => {
        if (selectedPath !== path) return;
        const el = listEl?.querySelector(`[data-file-path="${CSS.escape(path)}"]`);
        (el as HTMLElement)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }

  export async function reveal(path: string) {
    if (!entries.some((entry) => entry.path === path)) return;
    filter = '';
    expandedKeys = [...new Set([...expandedKeys, ...getFolderKeysForPath(path)])];
    await tick();
    const item = listEl?.querySelector(`[data-file-path="${CSS.escape(path)}"] .tree-row`);
    if (!(item instanceof HTMLElement)) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
    if (!reducedMotion) {
      item.getAnimations().forEach((animation) => animation.cancel());
      item.animate([
        { boxShadow: 'inset 0 0 0 1px var(--color-primary)' },
        { boxShadow: 'inset 0 0 0 1px transparent' },
      ], { duration: 1000, easing: 'ease-out' });
    }
  }

  onMount(() => {
    mounted = true;
    if (fileType) {
      expandedKeys = loadExpandedKeys(fileType);
    }
  });
</script>

<div class="flex flex-col h-full w-full min-w-0 overflow-hidden">
  <div class="shrink-0 flex items-center justify-between h-10 box-border px-5 border-b border-border-base">
    <h2 class="m-0 text-xs font-normal tracking-wide text-text-secondary">Files</h2>
    <div class="flex items-center gap-1">
    <button bind:this={filterButton} type="button" class="toolbar-utility p-1 inline-flex items-center justify-center" title="Filter files" aria-label="Filter files" aria-expanded={filterOpen} aria-controls={filterPanelId} on:click={toggleFilter}>
      <span class="i-tabler-search w-4 h-4" aria-hidden="true"></span>
    </button>
    <button type="button" class="toolbar-utility p-1 inline-flex items-center justify-center" title="Collapse all folders" aria-label="Collapse all folders" disabled={!!query} on:click={() => (expandedKeys = [])}>
      <span class="i-tabler-fold-up w-4 h-4" aria-hidden="true"></span>
    </button>
    </div>
  </div>
  {#if filterOpen}
  <div id={filterPanelId} class="shrink-0 px-3 pt-2 pb-1">
    <div class="flex items-center gap-1 rounded-md border border-border-base bg-bg-white px-2 focus-within:border-primary">
      <span class="i-tabler-search w-4 h-4 shrink-0 text-text-secondary" aria-hidden="true"></span>
      <input bind:this={filterInput} type="search" aria-label="Filter files by name" placeholder="Filter files…" maxlength="200" bind:value={filter} on:keydown={onFilterKeydown} class="file-filter min-w-0 w-full h-8 border-0 outline-none bg-transparent text-xs text-text-primary font-inherit" />
      {#if filter}
        <button type="button" class="p-0.5 inline-flex shrink-0" title="Clear filter" aria-label="Clear filter" on:click={() => { filter = ''; filterInput?.focus(); }}>
          <span class="i-tabler-x w-3.5 h-3.5" aria-hidden="true"></span>
        </button>
      {/if}
    </div>
    {#if query}
      <p class="m-0 pt-1 text-xs text-text-secondary" role="status">{filteredEntries.length} of {entries.length} files</p>
    {/if}
  </div>
  {/if}
  <ul class="flex-1 min-h-0 overflow-auto m-0 px-3 py-2 list-none font-mono" bind:this={listEl}>
    {#each treeRoots as node (nodeId(node))}
      <FileTreeNode
        {node}
        {selectedPath}
        expandedKeys={visibleExpandedKeys}
        {modifiedPaths}
        depth={0}
        onToggle={(key) => {
          if (query) {
            collapsedFilterKeys = collapsedFilterKeys.includes(key)
              ? collapsedFilterKeys.filter((k) => k !== key)
              : [...collapsedFilterKeys, key];
            return;
          }
          expandedKeys = expandedKeys.includes(key)
            ? expandedKeys.filter((k) => k !== key)
            : [...expandedKeys, key];
        }}
        on:select
      />
    {/each}
    {#if query && filteredEntries.length === 0}
      <li class="px-2 py-4 text-xs text-text-secondary">No matching files. Try another name.</li>
    {/if}
  </ul>
  <slot name="footer" />
</div>

<style>
  .file-filter::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    display: none;
  }
</style>
