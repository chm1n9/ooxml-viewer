<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { nodeId, type TreeNode } from './fileTree';

  const dispatch = createEventDispatcher<{ select: { path: string } }>();

  export let node: TreeNode;
  export let selectedPath: string | null = null;
  export let expandedKeys: string[] = [];
  export let depth: number = 0;
  export let onToggle: (key: string) => void = () => {};
  export let modifiedPaths: Set<string> = new Set();

  const INDENT = 20;
  const BASE_PADDING_LEFT = 0;

  function toggleFolder(key: string) {
    onToggle(key);
  }

  const cardClass =
    'tree-row flex items-center py-1 pl-2 pr-2 cursor-pointer text-left min-w-0 border border-transparent text-sm gap-1 w-full box-border';
  $: levelPaddingLeft = BASE_PADDING_LEFT + depth * INDENT;
</script>

{#if node.type === 'folder'}
  {@const folder = node}
  {@const isHighlighted = selectedPath?.startsWith(folder.key + '/') ?? false}
  {@const expanded = expandedKeys.includes(folder.key)}
  <li class="list-none m-0 flex flex-col w-full min-w-0">
    <div class="w-full min-w-0 box-border" style="padding-left: {levelPaddingLeft}px">
      <div
        class="{cardClass} {isHighlighted ? 'text-primary' : 'text-text-primary'}"
        role="button"
        aria-expanded={expanded}
        tabindex="0"
        on:click={() => toggleFolder(folder.key)}
        on:keydown={(e) => e.key === 'Enter' && toggleFolder(folder.key)}
      >
        <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{folder.name}/</span>
        <span
          class="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center {expanded ? 'i-tabler-chevron-down' : 'i-tabler-chevron-right'}"
          aria-hidden="true"
        ></span>
      </div>
    </div>
    {#if expanded}
      <div class="border-l border-border-base">
        <ul class="m-0 p-0 list-none">
          {#each folder.children as child (nodeId(child))}
            <svelte:self
              node={child}
              {selectedPath}
              {expandedKeys}
              {onToggle}
              {modifiedPaths}
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
  <li class="list-none m-0 w-full min-w-0" data-file-path={file.path}>
    <div class="w-full min-w-0 box-border" style="padding-left: {levelPaddingLeft}px">
      <div
        class="{cardClass} {file.path === selectedPath ? 'text-primary' : 'text-text-primary'} {file.isBinary ? 'opacity-70' : ''}"
        role="button"
        aria-current={file.path === selectedPath ? 'true' : undefined}
        tabindex="0"
        on:click={() => dispatch('select', { path: file.path })}
        on:keydown={(e) => e.key === 'Enter' && dispatch('select', { path: file.path })}
      >
        <span class="min-w-0 flex-1 truncate" title={file.path}>{file.name}</span>
        {#if modifiedPaths.has(file.path)}
          <span class="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center" role="img" aria-label="Unexported changes" title="Unexported changes">
            <span class="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true"></span>
          </span>
        {/if}
      </div>
    </div>
  </li>
{/if}

<style>
  .tree-row {
    position: relative;
    isolation: isolate;
    border-radius: 4px;
  }
  .tree-row::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 4px;
    pointer-events: none;
  }
  .tree-row:hover::before {
    background: var(--color-bg-element);
  }
  .tree-row[aria-current='true']::before {
    background: var(--color-primary-light);
  }
  .tree-row:focus-visible {
    outline: none;
  }
  .tree-row:focus-visible::before {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
</style>
