<script lang="ts">
  import EmptyFileState from './EmptyFileState.svelte';
  import PartToolbar from './PartToolbar.svelte';

  export let path: string | null = null;
  export let previewUrl: string | null = null;
  export let dependencies: string[] = [];
  export let referencedBy: string[] = [];

</script>

<div class="flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-l-lg border border-border-base border-l-0">
  {#if path}
    <PartToolbar {path} {dependencies} {referencedBy} on:selectPath on:revealPath />
    <div class="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-white">
      {#if previewUrl}
        <img src={previewUrl} alt={path} class="max-w-full max-h-full object-contain" />
      {:else}
        <span class="text-text-secondary text-sm">No preview</span>
      {/if}
    </div>
  {:else}
    <EmptyFileState />
  {/if}
</div>
