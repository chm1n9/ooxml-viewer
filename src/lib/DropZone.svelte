<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ACCEPT_OFFICE_EXTENSIONS } from './constants';

  const dispatch = createEventDispatcher<{ click: void }>();

  export let dragging = false;

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLElement).click();
    }
  }
</script>

<div
  class="hero-transition flex flex-col items-center justify-center gap-2 p-6 min-h-[180px] box-border border border-dashed border-border-base rounded-lg bg-bg-secondary cursor-pointer transition-colors hover:border-primary hover:bg-primary-light {dragging ? 'border-primary bg-primary-light' : ''}"
  role="button"
  tabindex="0"
  on:click={() => dispatch('click')}
  on:keydown={onKeydown}
>
  <span class="i-tabler-upload w-6 h-6 text-text-secondary mb-1" aria-hidden="true"></span>
  <p class="m-0 text-sm text-text-primary">Drop an Office file anywhere</p>
  <p class="m-0 text-sm text-text-secondary">or click to choose a file</p>
  <p class="mt-2 mb-0 text-xs font-mono text-text-secondary" title={ACCEPT_OFFICE_EXTENSIONS.join(' · ')}>.pptx · .docx · .xlsx · .thmx</p>
  <p class="m-0 text-xs text-text-secondary">Also supports templates, slide shows &amp; macro-enabled files</p>
</div>
