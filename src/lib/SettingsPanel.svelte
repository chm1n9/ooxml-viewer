<script lang="ts">
  import { loadSettings, saveSettings, type ViewerSettings } from './settings';

  export let visible = false;
  export let onClose: (() => void) = () => {};
  export let onSave: ((settings: ViewerSettings) => void) | undefined = undefined;

  let settings: ViewerSettings = loadSettings();

  $: if (visible) {
    settings = loadSettings();
  }

  function handleClose() {
    saveSettings(settings);
    onSave?.(settings);
    onClose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).getAttribute('data-settings-overlay') === 'true') {
      handleClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
  <div
    data-settings-overlay="true"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-panel-title"
    tabindex="-1"
    class="settings-overlay"
    on:click={handleOverlayClick}
    on:keydown={handleKeydown}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
    <div class="settings-panel" role="document" on:click|stopPropagation>
      <div class="settings-header">
        <h2 id="settings-panel-title" class="settings-title">Settings</h2>
        <button
          type="button"
          class="settings-close"
          aria-label="Close"
          on:click={handleClose}
        >
          <span class="i-carbon-close w-4 h-4" aria-hidden="true"></span>
        </button>
      </div>
      <div class="settings-body">
        <label class="settings-row" for="auto-collapse-tags">
          <span class="settings-label">Auto-collapse tags</span>
          <input
            id="auto-collapse-tags"
            type="text"
            class="settings-input"
            placeholder="e.g. w:p, w:t, w:r"
            bind:value={settings.autoCollapseTags}
          />
          <span class="settings-hint">Comma-separated tag names to fold when opening a file.</span>
        </label>
      </div>
      <div class="settings-footer">
        <button type="button" class="settings-btn-primary" on:click={handleClose}>
          Done
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    padding: 24px;
    box-sizing: border-box;
  }
  .settings-panel {
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    overflow: auto;
    background: var(--color-bg-white);
    border: 1px solid var(--color-border-base);
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  }
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border-base);
  }
  .settings-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .settings-close {
    padding: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .settings-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  .settings-body {
    padding: 20px;
  }
  .settings-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .settings-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  .settings-input {
    padding: 8px 12px;
    font-size: 0.8125rem;
    font-family: inherit;
    border: 1px solid var(--color-border-base);
    border-radius: 6px;
    background: var(--color-bg-white);
    color: var(--color-text-primary);
  }
  .settings-input::placeholder {
    color: var(--color-text-secondary);
  }
  .settings-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }
  .settings-hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  .settings-footer {
    padding: 12px 20px 20px;
    display: flex;
    justify-content: flex-end;
  }
  .settings-btn-primary {
    padding: 8px 16px;
    font-size: 0.8125rem;
    font-weight: 500;
    border-radius: 6px;
    border: 1px solid var(--color-border-base);
    background: var(--color-primary);
    color: white;
    cursor: pointer;
  }
  .settings-btn-primary:hover {
    background: var(--color-primary-hover);
  }
</style>
