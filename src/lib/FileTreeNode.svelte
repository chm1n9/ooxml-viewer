<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nodeId, type TreeNode } from './fileTree';

  const dispatch = createEventDispatcher<{ select: { path: string } }>();

  export let node: TreeNode;
  export let selectedPath: string | null = null;
  export let expandedKeys: string[] = [];
  export let depth: number = 0;
  export let onToggle: (key: string) => void = () => {};

  const INDENT = 20;
  const BASE_PADDING_LEFT = 0;

  function toggleFolder(key: string) {
    onToggle(key);
  }

  function isExpanded(key: string): boolean {
    return expandedKeys.includes(key);
  }

  /** True if this folder is any parent of the currently opened file (highlight path to selection). */
  function isParentOfSelectedFile(folderKey: string): boolean {
    if (!selectedPath) return false;
    return selectedPath.startsWith(folderKey + '/');
  }

  const cardClass =
    'flex items-center py-1 pl-2 pr-2 cursor-pointer text-left min-w-0 rounded-md border border-border-base hover:border-border-hover hover:bg-bg-element text-sm gap-1 w-full box-border';
  const levelPaddingLeft = BASE_PADDING_LEFT + depth * INDENT;
</script>

{#if node.type === 'folder'}
  {@const folder = node}
  {@const isHighlighted = isParentOfSelectedFile(folder.key)}
  <li class="list-none m-0 mt-1 first:mt-0 flex flex-col w-full min-w-0">
    <div class="w-full min-w-0 box-border" style="padding-left: {levelPaddingLeft}px">
      <div
        class="{cardClass} {isHighlighted ? 'text-primary' : 'text-text-primary'}"
        role="button"
        tabindex="0"
        on:click={() => toggleFolder(folder.key)}
        on:keydown={(e) => e.key === 'Enter' && toggleFolder(folder.key)}
      >
        <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{folder.name}/</span>
        <span
          class="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center {isExpanded(folder.key) ? 'i-tabler-chevron-down' : 'i-tabler-chevron-right'}"
          aria-hidden="true"
        ></span>
      </div>
    </div>
    {#if isExpanded(folder.key)}
      <div class="border-l border-border-base">
        <ul class="m-0 p-0 list-none">
          {#each folder.children as child (nodeId(child) + '-' + (selectedPath ?? ''))}
            <svelte:self
              node={child}
              {selectedPath}
              {expandedKeys}
              {onToggle}
              depth={depth + 1}
              on:select
            />
          {/each}
        </ul>
      </div>
    {/if}
  </li>
{:else}
  {@const file = node}
  <li class="list-none mt-1 first:mt-0 w-full min-w-0" data-file-path={file.path}>
    <div class="w-full min-w-0 box-border" style="padding-left: {levelPaddingLeft}px">
      <div
        class="{cardClass} {file.path === selectedPath ? 'text-primary' : 'text-text-primary'} {file.isBinary ? 'opacity-70' : ''}"
        role="button"
        tabindex="0"
        on:click={() => dispatch('select', { path: file.path })}
        on:keydown={(e) => e.key === 'Enter' && dispatch('select', { path: file.path })}
      >
        <span class="min-w-0 flex-1 break-all" title={file.path}>{file.name}</span>
      </div>
    </div>
  </li>
{/if}
