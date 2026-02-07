<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ACCEPT_OFFICE_EXTENSIONS } from './constants';

  const dispatch = createEventDispatcher<{ drop: { file: File }; click: void }>();

  let dragging = false;

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (ACCEPT_OFFICE_EXTENSIONS.includes(ext)) {
      dispatch('drop', { file });
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLElement).click();
    }
  }
</script>

<div
  class="flex flex-col items-center justify-center p-8 min-h-[200px] border-2 border-dashed border-border-base rounded-lg bg-white cursor-pointer transition-colors hover:border-primary hover:bg-primary-light {dragging ? 'border-primary bg-primary-light' : ''}"
  role="button"
  tabindex="0"
  on:click={() => dispatch('click')}
  on:dragover={onDragOver}
  on:dragleave={onDragLeave}
  on:drop={onDrop}
  on:keydown={onKeydown}
>
  <p class="m-0 text-base text-text-primary">Drop .pptx / .docx / .xlsx here</p>
  <p class="mt-1 text-sm text-text-secondary">or click to choose file</p>
</div>
