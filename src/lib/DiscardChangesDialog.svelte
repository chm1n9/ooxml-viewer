<script lang="ts">
  import { onMount } from 'svelte';

  export let onResolve: (discard: boolean) => void;
  export let title = 'Close without downloading?';
  export let description = 'Your changes have not been exported. Keep editing to download a copy, or discard these changes and close the file.';
  export let confirmLabel = 'Discard changes';
  let dialog: HTMLDialogElement;
  let keepEditingButton: HTMLButtonElement;

  function resolve(confirmed: boolean) {
    dialog.close();
    onResolve(confirmed);
  }

  onMount(() => {
    dialog.showModal();
    keepEditingButton.focus();
    return () => dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="discard-title" aria-describedby="discard-description" on:cancel|preventDefault={() => resolve(false)}>
  <h2 id="discard-title" class="m-0 text-base font-semibold text-text-primary">{title}</h2>
  <p id="discard-description" class="mt-3 mb-5 text-sm text-text-secondary leading-relaxed">{description}</p>
  <div class="flex justify-end gap-2">
    <button bind:this={keepEditingButton} type="button" class="app-button px-3 py-2 text-sm" on:click={() => resolve(false)}>Keep editing</button>
    <button type="button" class="app-button px-3 py-2 text-sm" on:click={() => resolve(true)}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(420px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    box-sizing: border-box;
    margin: 0;
    padding: 24px;
    border: 1px solid var(--color-border-base);
    border-radius: 8px;
    background: var(--color-bg-white);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
</style>
