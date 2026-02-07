<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { searchStore, setSearchQuery, setSearchMode, closeSearch, MOD } from './shortcuts';
  import type { FileEntry } from './ooxml';

  const dispatch = createEventDispatcher<{ selectPath: { path: string } }>();

  export let entries: FileEntry[] = [];

  let searchInput: HTMLInputElement;

  $: globalResults = $searchStore.mode === 'global' && $searchStore.query.trim()
    ? searchInEntries(entries, $searchStore.query.trim())
    : [];

  function searchInEntries(entries: FileEntry[], q: string): { path: string; snippet: string }[] {
    const lower = q.toLowerCase();
    const results: { path: string; snippet: string }[] = [];
    for (const e of entries) {
      if (e.isBinary) continue;
      if (e.path.toLowerCase().includes(lower)) {
        results.push({ path: e.path, snippet: e.path });
        continue;
      }
      const idx = e.content.toLowerCase().indexOf(lower);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 20);
      const end = Math.min(e.content.length, idx + q.length + 40);
      let snippet = e.content.slice(start, end).replace(/\n/g, ' ');
      if (snippet.length > 80) snippet = (start > 0 ? '…' : '') + snippet.slice(0, 77) + '…';
      results.push({ path: e.path, snippet });
    }
    return results;
  }

  function focusInput() {
    setTimeout(() => searchInput?.focus(), 50);
  }

  function handleSearchInput(e: Event) {
    setSearchQuery((e.target as HTMLInputElement).value);
  }

  $: if ($searchStore.open) focusInput();

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $searchStore.open) closeSearch();
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if $searchStore.open}
  <div class="search-bar" role="search">
    <input
      bind:this={searchInput}
      type="text"
      class="search-input"
      placeholder="Search…"
      value={$searchStore.query}
      on:input={handleSearchInput}
      on:keydown={(e) => e.key === 'Escape' && closeSearch()}
    />
    <div class="search-mode">
      <button
        type="button"
        class="mode-btn"
        class:active={$searchStore.mode === 'currentFile'}
        on:click={() => setSearchMode('currentFile')}
      >
        Current file
      </button>
      <button
        type="button"
        class="mode-btn"
        class:active={$searchStore.mode === 'global'}
        on:click={() => setSearchMode('global')}
      >
        All files
      </button>
    </div>
    <span class="search-hint">{MOD}+F to toggle</span>
    <button type="button" class="close-btn" on:click={closeSearch} title="Close">×</button>

    {#if $searchStore.mode === 'global' && $searchStore.query.trim()}
      <div class="global-results">
        {#if globalResults.length === 0}
          <p class="no-results">No matches</p>
        {:else}
          <ul>
            {#each globalResults as { path, snippet }}
              <li>
                <button
                  type="button"
                  class="result-row"
                  on:click={() => {
                    dispatch('selectPath', { path });
                    closeSearch();
                  }}
                >
                  <span class="result-path">{path}</span>
                  <span class="result-snippet">{snippet}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .search-bar {
    position: fixed;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg-white);
    border: 1px solid var(--color-border-base);
    border-radius: 8px;
    min-width: 320px;
    max-width: 90vw;
  }
  .search-input {
    flex: 1;
    min-width: 120px;
    padding: 6px 10px;
    border: 1px solid var(--color-border-base);
    border-radius: 6px;
    font: inherit;
    font-size: 13px;
  }
  .search-mode {
    display: flex;
    gap: 0;
    border: 1px solid var(--color-border-base);
    border-radius: 6px;
    overflow: hidden;
  }
  .mode-btn {
    padding: 6px 10px;
    font-size: 12px;
    border-right: 1px solid var(--color-border-base);
  }
  .mode-btn:last-of-type {
    border-right: none;
  }
  .mode-btn.active {
    background-color: var(--color-primary);
    color: var(--color-bg-white);
    border-color: var(--color-primary);
  }
  .search-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .close-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 18px;
    line-height: 1;
  }
  .global-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--color-bg-white);
    border: 1px solid var(--color-border-base);
    border-radius: 6px;
  }
  .global-results ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }
  .global-results li {
    margin: 0;
  }
  .result-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    padding: 8px 12px;
    text-align: left;
  }
  .result-row:hover {
    background-color: var(--color-bg-hover);
  }
  .result-path {
    font-size: 12px;
    color: var(--color-primary);
    margin-bottom: 2px;
  }
  .result-snippet {
    font-size: 11px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .no-results {
    margin: 0;
    padding: 12px;
    font-size: 12px;
    color: var(--color-text-secondary);
  }
</style>
