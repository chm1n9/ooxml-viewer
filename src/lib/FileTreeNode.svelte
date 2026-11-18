<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SourceChange } from './sourceChanges';
  import { nodeId, type TreeNode } from './fileTree';

  const dispatch = createEventDispatcher<{ select: { path: string }; sourceSelect: SourceChange }>();

  export let node: TreeNode;
  export let selectedPath: string | null = null;
  export let expandedKeys: string[] = [];
  export let depth: number = 0;
  export let onToggle: (key: string) => void = () => {};
  export let sourceChangesByPath: Map<string, SourceChange> = new Map();
  export let updatedFolders: Set<string> = new Set();
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
        {#if updatedFolders.has(folder.key)}
          <span class="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center" role="img" aria-label="Contains source updates" title="Contains source updates">
            <span class="source-folder-update w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
          </span>
        {/if}
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
              {sourceChangesByPath}
              {updatedFolders}
              depth={depth + 1}
              on:select
              on:sourceSelect
            />
          {/each}
        </ul>
      </div>
    {/if}
  </li>
{:else}
  {@const file = node}
  {@const sourceChange = sourceChangesByPath.get(file.path)}
  <li class="list-none m-0 w-full min-w-0" data-file-path={file.path}>
    <div class="w-full min-w-0 box-border" style="padding-left: {levelPaddingLeft}px">
      <div
        class="{cardClass} {file.path === selectedPath ? 'text-primary' : 'text-text-primary'} {file.isBinary ? 'opacity-70' : ''}"
        aria-current={file.path === selectedPath ? 'true' : undefined}
      >
        <button type="button" class="file-name-trigger min-w-0 flex-1 truncate"
          class:source-added={sourceChange?.kind === 'added'}
          class:source-removed={sourceChange?.kind === 'removed'}
          title={file.sourceOnly ? `${file.path} — added in source; preview only` : file.path}
          aria-current={file.path === selectedPath ? 'true' : undefined}
          on:click={() => {
            if (file.sourceOnly && sourceChange) dispatch('sourceSelect', sourceChange);
            else dispatch('select', { path: file.path });
          }}
        >{file.name}</button>
        {#if modifiedPaths.has(file.path)}
          <span class="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center" role="img" aria-label="Unexported changes" title="Unexported changes">
            <span class="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true"></span>
          </span>
        {/if}
        {#if sourceChange}
          <button type="button" class="source-update-trigger" class:source-added={sourceChange.kind === 'added'} class:source-removed={sourceChange.kind === 'removed'}
            title={`Source ${sourceChange.kind} — view diff`}
            aria-label={`View source diff: ${file.path} (${sourceChange.kind})`}
            on:click={() => dispatch('sourceSelect', sourceChange)}>
            {#if sourceChange.kind === 'added'}<span class="i-tabler-plus w-3.5 h-3.5" aria-hidden="true"></span>
            {:else if sourceChange.kind === 'removed'}<span class="i-tabler-minus w-3.5 h-3.5" aria-hidden="true"></span>
            {:else}<span class="i-tabler-file-diff w-3.5 h-3.5" aria-hidden="true"></span>{/if}
          </button>
        {/if}
      </div>
    </div>
  </li>
{/if}

<style>
  .file-name-trigger { display: block; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .source-update-trigger { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 3px; background: transparent; color: #587a9b; display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; cursor: pointer; }
  .source-update-trigger:hover { background: var(--color-bg-hover); }
  .source-folder-update { background: #587a9b; }
  .source-added { color: #52825b; }
  .source-removed { color: #a45c50; }
  .file-name-trigger.source-removed { text-decoration: line-through; text-decoration-color: #bc8278; }
  .file-name-trigger:focus-visible, .source-update-trigger:focus-visible { outline: none; }
  .tree-row:has(.file-name-trigger:focus-visible)::before, .tree-row:has(.source-update-trigger:focus-visible)::before { outline: 2px solid var(--color-primary); outline-offset: -2px; }

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
