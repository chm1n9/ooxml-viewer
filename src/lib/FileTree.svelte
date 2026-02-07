<script lang="ts">
  import { onMount } from 'svelte';
  import FileTreeNode from './FileTreeNode.svelte';
  import { buildFileTree, nodeId } from './fileTree';
  import type { FileEntry as FileEntryType } from './ooxml';

  export let entries: FileEntryType[] = [];
  export let selectedPath: string | null = null;
  export let fileName: string = '';

  let expandedKeys: string[] = [];
  let mounted = false;

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

  $: treeRoots = buildFileTree(entries);

  onMount(() => {
    mounted = true;
    if (fileType) {
      expandedKeys = loadExpandedKeys(fileType);
    }
  });
</script>

<div class="flex flex-col h-full w-full min-w-0 overflow-hidden">
  <h2 class="shrink-0 py-2 px-3 text-xs font-normal tracking-wide text-text-secondary border-b border-border-base">
    Files
  </h2>
  <ul class="flex-1 min-h-0 overflow-auto m-0 px-4 list-none">
    {#each treeRoots as node (nodeId(node) + '-' + expandedKeys.join(',') + '-' + (selectedPath ?? ''))}
      <FileTreeNode
        {node}
        {selectedPath}
        {expandedKeys}
        depth={0}
        onToggle={(key) => {
          expandedKeys = expandedKeys.includes(key)
            ? expandedKeys.filter((k) => k !== key)
            : [...expandedKeys, key];
        }}
        on:select
      />
    {/each}
  </ul>
</div>
