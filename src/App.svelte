<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import DropZone from './lib/DropZone.svelte';
  import FileTree from './lib/FileTree.svelte';
  import XmlEditor from './lib/XmlEditor.svelte';
  import ImagePreview from './lib/ImagePreview.svelte';
  import RelsGraph from './lib/RelsGraph.svelte';
  import SearchBar from './lib/SearchBar.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import { initShortcuts, searchStore } from './lib/shortcuts';
  import { loadSettings, parseAutoCollapseTags } from './lib/settings';
  import { ACCEPT_OFFICE } from './lib/constants';
  import { getDependenciesForPart } from './lib/relsGraph';
  import { getRoute, getPathFromState, pushRoute, replaceToBase } from './lib/routeHistory';
  import { isImagePath, loadOfficeFile, repackAndDownload, type FileEntry } from './lib/ooxml';
  import type JSZip from 'jszip';

  let teardownShortcuts: (() => void) | null = null;

  let zip: JSZip | null = null;
  let entries: FileEntry[] = [];
  let fileName = '';
  let selectedPath: string | null = null;
  let saving = false;
  let error = '';
  let showRelsGraph = false;
  let showSettingsPanel = false;
  let settingsSnapshot = loadSettings();

  const SIDEBAR_MIN = 260;
  const SIDEBAR_MAX = 600;
  const SIDEBAR_DEFAULT = 286;
  const SIDEBAR_STORAGE_KEY = 'ooxml-viewer-sidebar-width';

  let sidebarWidth = SIDEBAR_DEFAULT;
  let dragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;

  function resizeHandleMousedown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    dragStartX = e.clientX;
    dragStartWidth = sidebarWidth;
    document.body.style.cursor = 'col-resize';
  }

  function revokePreviewUrls(entries: FileEntry[]) {
    for (const e of entries) {
      if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    }
  }

  export let initialData: { zip: JSZip; entries: FileEntry[]; fileName: string } | null = null;
  let initialDataApplied = false;

  $: if (initialData && zip === null && !initialDataApplied) {
    initialDataApplied = true;
    zip = initialData.zip;
    entries = initialData.entries;
    fileName = initialData.fileName;
    selectedPath = null;
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (!dragging) return;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    const delta = e.clientX - dragStartX;
    let next = dragStartWidth + delta;
    next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, next));
    sidebarWidth = next;
  }

  function onWindowMouseUp() {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    }
  }

  function applyRouteToState() {
    const { hasFile: h, entries: ent } = routeStateRef;
    if (!h || !ent.length) return;
    const route = getRoute();
    if (route && ent.some((e) => e.path === route.path)) {
      selectedPath = route.path;
    } else {
      selectedPath = null;
    }
  }

  function onPopState(event: PopStateEvent) {
    const { hasFile: h, entries: ent } = routeStateRef;
    if (!h || !ent.length) return;
    const statePath = getPathFromState(event.state);
    if (statePath && ent.some((e) => e.path === statePath)) {
      selectedPath = statePath;
    } else {
      applyRouteToState();
    }
  }

  onMount(() => {
    teardownShortcuts = initShortcuts();
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored != null) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) sidebarWidth = n;
    }
    void tick().then(() => {
      if (routeStateRef.hasFile) applyRouteToState();
    });
    window.addEventListener('popstate', onPopState);
  });

  onDestroy(() => {
    window.removeEventListener('popstate', onPopState);
    teardownShortcuts?.();
  });

  $: currentEntry = selectedPath
    ? entries.find((e) => e.path === selectedPath) ?? null
    : null;
  $: editorContent = currentEntry?.content ?? '';
  $: hasFile = zip !== null && entries.length > 0;

  /** Ref kept in sync so popstate handler always sees current state (avoids stale closure). */
  let routeStateRef: { hasFile: boolean; entries: FileEntry[] } = { hasFile: false, entries: [] };
  $: routeStateRef = { hasFile, entries };
  $: currentDependencies = (() => {
    const list = selectedPath ? getDependenciesForPart(selectedPath, entries) : [];
    return [...list].sort((a, b) => {
      const aImage = isImagePath(a) || /\/media\//i.test(a);
      const bImage = isImagePath(b) || /\/media\//i.test(b);
      if (aImage === bImage) return 0;
      return aImage ? 1 : -1;
    });
  })();

  $: if (!hasFile) replaceToBase();

  async function onDrop(event: CustomEvent<{ file: File }>) {
    const file = event.detail.file;
    error = '';
    revokePreviewUrls(entries);
    try {
      const result = await loadOfficeFile(file);
      zip = result.zip;
      entries = result.entries;
      fileName = result.fileName;
      selectedPath = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to open file';
    }
  }

  function onFileSelect(event: CustomEvent<{ path: string }>) {
    selectedPath = event.detail.path;
    if (hasFile && selectedPath) pushRoute(selectedPath);
  }

  function onContentChange(event: CustomEvent<{ value: string }>) {
    if (!selectedPath) return;
    const entry = entries.find((e) => e.path === selectedPath);
    if (entry && !entry.isBinary) {
      entry.content = event.detail.value;
    }
  }

  function newFile() {
    revokePreviewUrls(entries);
    zip = null;
    entries = [];
    fileName = '';
    selectedPath = null;
    error = '';
  }

  async function save() {
    if (!zip || entries.length === 0) return;
    saving = true;
    error = '';
    try {
      await repackAndDownload(zip, entries, fileName);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      saving = false;
    }
  }

  function openFileInput() {
    const input = document.getElementById('file-input') as HTMLInputElement;
    input?.click();
  }

  function onFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onDrop(new CustomEvent('drop', { detail: { file } }));
    input.value = '';
  }

  function onSearchSelectPath(event: CustomEvent<{ path: string }>) {
    selectedPath = event.detail.path;
  }
</script>

<svelte:window
  on:mousemove={onWindowMouseMove}
  on:mouseup={onWindowMouseUp}
  on:mouseleave={onWindowMouseUp}
/>
<svelte:head>
  <style>
    html, body, #app { margin: 0; padding: 0; height: 100%; }
    body {
      background: var(--color-bg-base);
      font-family: "berkeleyMono", ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    ul, ol { padding-inline-start: 0; }
    /* Unified flat button: higher specificity so we override CM and others */
    #app button,
    #app .cm-button,
    #app main button {
      box-shadow: none !important;
      background-image: none !important;
      background-color: var(--color-bg-secondary) !important;
      border: 1px solid var(--color-border-base) !important;
      border-radius: 6px !important;
      color: var(--color-text-secondary) !important;
      font: inherit;
      cursor: pointer;
    }
    #app button:hover,
    #app .cm-button:hover {
      background-color: var(--color-bg-hover) !important;
    }
    #app button:active,
    #app .cm-button:active {
      background-color: var(--color-bg-hover) !important;
    }
    #app button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    * {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    *::-webkit-scrollbar {
      display: none;
    }
    /* Resize handle: fixed 3px, transparent by default, colored on hover */
    #app main div.sidebar-resize-handle {
      width: 4px;
      background-color: transparent;
    }
    #app main div.sidebar-resize-handle:hover {
      background-color: var(--color-primary-hover-light);
    }
    #app main div.sidebar-resize-handle.resizing,
    #app main div.sidebar-resize-handle:active {
      background-color: var(--color-primary-active);
    }
  </style>
</svelte:head>

<input
  id="file-input"
  type="file"
  accept={ACCEPT_OFFICE}
  on:change={onFileInputChange}
  class="hidden"
/>

<main class="m-0 p-0 min-h-screen h-full flex flex-col bg-bg-base" class:select-none={dragging}>
  {#if $searchStore.open}
    <SearchBar entries={entries} on:selectPath={onSearchSelectPath} />
  {/if}
  {#if !hasFile}
    <section class="flex-1 flex flex-col items-center justify-center p-8 box-border bg-bg-base">
      <DropZone on:drop={onDrop} on:click={openFileInput} />
      {#if error}
        <p class="mt-4 text-red-600 text-sm">{error}</p>
      {/if}
    </section>
  {:else}
    <header class="shrink-0 flex items-center justify-between h-16 px-6 border-b border-border-base bg-bg-base">
      <span class="font-semibold text-text-primary truncate text-sm">{fileName}</span>
      <div class="flex items-center gap-2">
        {#if false}
          <button
            class="h-9 px-4 text-sm font-medium"
            class:bg-bg-element={showRelsGraph}
            on:click={() => (showRelsGraph = !showRelsGraph)}
          >
            Rels
          </button>
        {/if}
        <button class="h-9 px-4 text-sm font-medium inline-flex items-center gap-2" on:click={newFile}>
          <span class="i-tabler-plus w-5 h-5 shrink-0" aria-hidden="true"></span>
          New
        </button>
        <button
          class="h-9 px-4 text-sm font-medium inline-flex items-center gap-2"
          disabled={saving}
          on:click={save}
        >
          <span class="i-tabler-download w-5 h-5 shrink-0" aria-hidden="true"></span>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          class="h-9 w-9 p-0 inline-flex items-center justify-center shrink-0"
          aria-label="Settings"
          on:click={() => (showSettingsPanel = true)}
        >
          <span class="i-tabler-settings w-5 h-5 text-text-secondary" aria-hidden="true"></span>
        </button>
      </div>
    </header>
    <SettingsPanel
      visible={showSettingsPanel}
      onClose={() => (showSettingsPanel = false)}
      onSave={(s) => (settingsSnapshot = s)}
    />
    {#if error}
      <p class="shrink-0 py-2 px-6 m-0 bg-red-50 text-red-600 text-sm">
        {error}
      </p>
    {/if}
    <div class="flex-1 flex min-h-0 overflow-hidden bg-bg-base">
      <div
        class="flex flex-col h-full shrink-0 border-r border-border-base bg-bg-base overflow-hidden"
        style="width: {sidebarWidth}px"
      >
        <FileTree
          entries={entries}
          selectedPath={selectedPath}
          fileName={fileName}
          on:select={onFileSelect}
        />
      </div>
      <div
        class="sidebar-resize-handle shrink-0 cursor-col-resize transition-all duration-150 select-none"
        class:resizing={dragging}
        role="button"
        tabindex="0"
        aria-label="Resize sidebar"
        on:mousedown={resizeHandleMousedown}
      ></div>
      {#key selectedPath}
        {#if showRelsGraph}
          <RelsGraph entries={entries} />
        {:else if currentEntry?.previewUrl}
          <ImagePreview
            path={selectedPath}
            previewUrl={currentEntry.previewUrl}
            dependencies={currentDependencies}
            on:selectPath={onFileSelect}
          />
        {:else}
          <XmlEditor
            path={selectedPath}
            content={editorContent}
            readOnly={currentEntry?.isBinary ?? true}
            dependencies={currentDependencies}
            autoCollapseTags={parseAutoCollapseTags(settingsSnapshot.autoCollapseTags)}
            on:contentChange={onContentChange}
            on:selectPath={onFileSelect}
          />
        {/if}
      {/key}
    </div>
  {/if}
</main>
