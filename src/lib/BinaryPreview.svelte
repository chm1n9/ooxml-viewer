<script lang="ts">
  import PartToolbar from './PartToolbar.svelte';

  export let path: string;
  export let dependencies: string[] = [];
  export let referencedBy: string[] = [];

  $: filename = path.split('/').pop() ?? path;
</script>

<div class="flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-l-lg border border-border-base border-l-0">
  <PartToolbar {path} {dependencies} {referencedBy} on:selectPath on:revealPath />
  <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6">
    <div class="max-w-full text-center">
      <span class="i-tabler-file-unknown w-12 h-12 inline-block text-text-secondary mb-4" aria-hidden="true"></span>
      <p class="m-0 text-sm font-mono text-text-primary break-all">{filename}</p>
      <p class="mt-2 mb-0 text-sm text-text-secondary">Preview unavailable for this file.</p>
      <p class="mt-2 mb-0 text-xs text-text-muted">The original file is preserved when you download.</p>
    </div>
  </div>
</div>
