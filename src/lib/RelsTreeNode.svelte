<script lang="ts">
  import { nodeLabel } from './relsGraph';

  export let nodePath: string = '';
  export let edgesByFrom: Map<string, { to: string; type: string }[]>;
  export let expanded: Set<string>;
  export let onToggle: (path: string) => void;
  export let depth: number = 0;

  $: children = edgesByFrom.get(nodePath) ?? [];
  $: isExpanded = expanded.has(nodePath);
  $: hasChildren = children.length > 0;
</script>

<div class="tree-node">
  <div
    class="tree-row flex items-center gap-2 py-0.5 cursor-pointer hover:bg-bg-secondary rounded"
    role="button"
    tabindex="0"
    on:click={() => hasChildren && onToggle(nodePath)}
    on:keydown={(e) => e.key === 'Enter' && hasChildren && onToggle(nodePath)}
  >
    <span class="w-4 text-text-secondary shrink-0" style="margin-left: {depth * 16}px" aria-hidden="true">
      {#if hasChildren}
        {isExpanded ? '▼' : '▶'}
      {:else}
        {' '}
      {/if}
    </span>
    <span class="truncate min-w-0" title={nodePath}>{nodeLabel(nodePath)}</span>
  </div>
  {#if isExpanded && hasChildren}
    {#each children as { to, type }}
      <div class="tree-child flex items-start gap-2 py-0.5">
        <span class="w-4 shrink-0" style="margin-left: {(depth + 1) * 16}px" aria-hidden="true"> </span>
        <span class="text-primary shrink-0 text-xs">[{type}]</span>
        <div class="min-w-0 flex-1">
          <svelte:self
            nodePath={to}
            {edgesByFrom}
            {expanded}
            {onToggle}
            depth={depth + 1}
          />
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .tree-node {
    margin: 0;
  }
  .tree-row:focus {
    outline: none;
  }
</style>
