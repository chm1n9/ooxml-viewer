<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type JSZip from 'jszip';
  import { EditorState } from '@codemirror/state';
  import { editorPresentation, capturePosition, captureReadingState, restoreReadingState } from './editorPresentation';
  import { EditorView, keymap } from '@codemirror/view';
  import { searchKeymap, openSearchPanel, searchPanelOpen } from '@codemirror/search';
  import { getChunks } from '@codemirror/merge';
  import { displayXml as formattedXml } from './partContent';
  import { get } from 'svelte/store';
  import { openSearchStore } from './shortcuts';
  import { inlineDiff } from './inlineDiff';
  import { navigateChange } from './diffNavigation';
  import { readSourceDiff, type SourcePreviewChange } from './sourceChanges';

  export let before: JSZip;
  export let after: JSZip;
  export let change: SourcePreviewChange;
  export let onClose: () => void;

  let closeButton: HTMLButtonElement;
  let panel: HTMLElement;
  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let destroyed = false;
  let mounted = false;
  let loadRequest = 0;
  let updated = false;
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = true;
  let error = '';
  let data: Awaited<ReturnType<typeof readSourceDiff>> | null = null;
  let formatted = true;
  let count = 0;
  const searchAction = () => { if (view) openSearchPanel(view); };

  export function captureView() {
    if (!view) return null;
    const position = capturePosition(view);
    return formatted ? position : { ...position, anchor: 0, head: 0 };
  }

  function renderDiff() {
    if (!data || data.binary || !container || destroyed) return;
    const previous = view;
    const position = previous ? captureReadingState(previous) : null;
    previous?.destroy();
    const original = formatted ? formattedXml(data.before) : data.before;
    const current = formatted ? formattedXml(data.after) : data.after;
    const state = EditorState.create({
      doc: current,
      extensions: [
        ...editorPresentation(), keymap.of(searchKeymap),
        EditorState.readOnly.of(true), EditorView.editable.of(false),
        EditorView.contentAttributes.of({ tabindex: '0', 'aria-label': 'Source comparison (read-only)' }),
        inlineDiff(original, false),
        EditorView.theme({
          '&': { height: '100%', fontSize: '12px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, monospace' },
          '.cm-content': { padding: '12px' },
          '.cm-gutters': { backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border-base)' },
          '.cm-tooltip': { backgroundColor: 'var(--color-bg-white)' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
    });
    count = getChunks(state)?.chunks.length ?? 0;
    view = new EditorView({ state, parent: container });
    if (position) {
      const next = view;
      restoreReadingState(next, position, () => !destroyed && view === next);
    }
    openSearchStore.set(searchAction);
  }

  $: if (mounted) void load(before, after, change);

  async function load(baseline: JSZip, latest: JSZip, part: SourcePreviewChange) {
    const request = ++loadRequest;
    try {
      const result = await readSourceDiff(baseline, latest, part);
      if (destroyed || request !== loadRequest) return;
      const refreshing = data !== null;
      error = '';
      data = result;
      // A whitespace-only change still needs a visible diff.
      if (result.before !== result.after && formattedXml(result.before) === formattedXml(result.after)) formatted = false;
      busy = false;
      await tick();
      if (destroyed || request !== loadRequest) return;
      renderDiff();
      if (refreshing) {
        updated = true;
        clearTimeout(updateTimer);
        updateTimer = setTimeout(() => { updated = false; }, 3000);
      }
    } catch {
      if (!destroyed && request === loadRequest) { error = 'Unable to display this source comparison.'; busy = false; }
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (!(event.target instanceof Node) || !panel?.contains(event.target)) return;
    if (event.key === 'Escape' && (!view || !searchPanelOpen(view.state))) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }
  onMount(() => {
    closeButton.focus({ preventScroll: true });
    mounted = true;
  });
  onDestroy(() => {
    destroyed = true;
    clearTimeout(updateTimer);
    view?.destroy();
    if (get(openSearchStore) === searchAction) openSearchStore.set(null);
  });
</script>

<svelte:window on:keydown={onKeydown} />

<section bind:this={panel} class="source-diff-panel" aria-label="Source diff" tabindex="-1">
  <header class="source-diff-header">
    <span class="source-diff-path" title={change.path}>{change.path}</span>
    <span class="source-diff-badge" title="Last loaded source → Updated source. Read-only; local edits are excluded.">Loaded → Disk · Read-only</span>
    <button bind:this={closeButton} type="button" class="toolbar-utility source-diff-back" title="Back to editor" aria-label="Back to editor" on:click={onClose}>
      <span class="i-tabler-arrow-left w-3.5 h-3.5" aria-hidden="true"></span>
      Back to editor
    </button>
  </header>
  {#if !busy && !error && change.kind === 'unchanged'}
    <p class="source-diff-info" role="status">{before.file(change.path) ? 'Matches the loaded version. No pending changes for this file.' : 'This file is no longer present in either source version.'}</p>
  {/if}
  {#if busy}
    <div class="source-diff-empty" role="status">Loading comparison…</div>
  {:else if error}
    <div class="source-diff-empty" role="status">{error}</div>
  {:else if data?.binary}
    <div class="source-diff-empty">
      <span class="i-tabler-file-unknown w-10 h-10" aria-hidden="true"></span>
      <p>Binary file {change.kind}. Text diff is unavailable.</p>
      <p class="source-diff-description">{data.beforeBytes.toLocaleString()} bytes → {data.afterBytes.toLocaleString()} bytes</p>
    </div>
  {:else}
    <div class="source-diff-editor" bind:this={container}></div>
    <footer>
      <button type="button" class="app-button source-diff-format" aria-pressed={formatted} on:click={() => { formatted = !formatted; renderDiff(); }}>Formatted XML</button>
      <div class="source-diff-navigation">
        <span title="Last loaded source → Updated source. Local edits are excluded.">{updated ? 'Comparison updated · ' : ''}{count ? `${count} ${count === 1 ? 'change' : 'changes'}` : 'No visible text changes'}</span>
        <button class="app-button" type="button" disabled={!count} title="Previous source change" aria-label="Previous source change" on:click={() => { if (view) navigateChange(view, -1); }}><span class="i-tabler-arrow-up w-3.5 h-3.5" aria-hidden="true"></span></button>
        <button class="app-button" type="button" disabled={!count} title="Next source change" aria-label="Next source change" on:click={() => { if (view) navigateChange(view, 1); }}><span class="i-tabler-arrow-down w-3.5 h-3.5" aria-hidden="true"></span></button>
      </div>
    </footer>
  {/if}
</section>

<style>
  .source-diff-panel { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; outline: none; background: var(--color-bg-white); color: var(--color-text-primary); border: 1px solid var(--color-border-base); border-left: 0; border-radius: 8px 0 0 8px; }
  .source-diff-header { display: flex; flex-shrink: 0; align-items: center; gap: 8px; height: 40px; box-sizing: border-box; padding: 0 12px; border-bottom: 1px solid var(--color-border-base); background: var(--color-bg-secondary); }
  .source-diff-path { flex: 1; min-width: 0; font-family: ui-monospace, monospace; font-size: 12px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .source-diff-badge { flex-shrink: 0; font-size: 11px; line-height: 20px; padding: 0 6px; border-radius: 4px; color: var(--color-primary); background: var(--color-primary-light); white-space: nowrap; }
  .source-diff-back { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex-shrink: 0; height: 28px; padding: 0 6px; font-size: 11px; white-space: nowrap; }
  .source-diff-info { margin: 0; padding: 6px 12px; font-size: 11px; color: var(--color-text-secondary); background: var(--color-bg-secondary); }
  .source-diff-description { margin: 0; font-size: 11px; line-height: 16px; color: var(--color-text-secondary); }
  .source-diff-editor { flex: 1; min-height: 0; overflow: hidden; }
  .source-diff-empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; font-size: 13px; text-align: center; color: var(--color-text-secondary); overflow: auto; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 10px; border-top: 1px solid var(--color-border-base); background: var(--color-bg-secondary); font-size: 11px; }
  footer button { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 2px 6px; }
  :global(#app button.source-diff-format[aria-pressed='true']) { background-color: var(--color-bg-element); color: var(--color-text-primary); }
  .source-diff-navigation { display: inline-flex; align-items: center; gap: 6px; }
</style>
