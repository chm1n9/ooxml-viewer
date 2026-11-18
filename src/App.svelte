<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { droppedSource, pickSourceFile, type SourceFileHandle } from './lib/sourceFile';
  import { createSourceSession } from './lib/sourceSession';
  import SourceDiffPanel from './lib/SourceDiffPanel.svelte';
  import { sourceReloadPath, sourcePreviewChange, type SourcePreviewChange, type SourceChange } from './lib/sourceChanges';
  import DropZone from './lib/DropZone.svelte';
  import FileTree from './lib/FileTree.svelte';
  import XmlEditor from './lib/XmlEditor.svelte';
  import BinaryPreview from './lib/BinaryPreview.svelte';
  import ImagePreview from './lib/ImagePreview.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import DiscardChangesDialog from './lib/DiscardChangesDialog.svelte';
  import { createEditorSearchSession } from './lib/editorSearch';
  import { initShortcuts } from './lib/shortcuts';
  import { loadSettings, parseAutoCollapseTags } from './lib/settings';
  import { ACCEPT_OFFICE } from './lib/constants';
  import { createPackageIndex } from './lib/packageIndex';
  import { getRoute, pushRoute, pushToBase, replaceRoute, replaceToBase } from './lib/routeHistory';
  import { isImagePath, loadOfficeFile, repackAndDownload, type FileEntry } from './lib/ooxml';
  import type JSZip from 'jszip';

  let teardownShortcuts: (() => void) | null = null;
  let fileTree: FileTree | null = null;
  let saveShortcutLabel = 'Ctrl+S';

  let zip: JSZip | null = null;
  let entries: FileEntry[] = [];
  let packageIndex = createPackageIndex([]);
  function setPackageEntries(list: FileEntry[]) {
    entries = list;
    packageIndex = createPackageIndex(list);
  }
  let fileName = '';
  let searchSession = createEditorSearchSession();
  const source = createSourceSession();
  $: sourceStatus = $source.status;
  $: pendingSource = $source.pending;
  $: pendingSourceChanges = $source.changes;
  $: checkingSourceChanges = $source.checking;
  $: sourceChangesError = $source.error;
  $: sourceRequestBusy = $source.busy;
  $: sourceNotice = $source.notice;
  let sourceDiffPanel: SourceDiffPanel | null = null;
  let sourceDiff: { change: SourcePreviewChange; before: JSZip; after: JSZip } | null = null;

  function closeSourceDiff() {
    const editor = xmlEditor;
    const snapshot = previewEditorView;
    sourceDiff = null;
    previewEditorView = null;
    if (selectedPath) pushRoute(selectedPath);
    else pushToBase();
    void tick().then(() => { if (xmlEditor === editor) editor?.focusEditor(snapshot); });
  }

  function showSourceDiff(path: string): boolean {
    const baseline = $source.baseline;
    const latest = $source.latest ?? (!$source.pending ? baseline : null);
    if (!baseline || !latest || (!baseline.file(path) && !latest.file(path))) return false;
    if (!sourceDiff) previewEditorView = xmlEditor?.captureView() ?? null;
    sourceDiff = { change: sourcePreviewChange(path, pendingSourceChanges ?? []), before: baseline, after: latest };
    return true;
  }

  function openSourceDiff(event: CustomEvent<SourceChange>) {
    if (showSourceDiff(event.detail.path)) pushRoute(event.detail.path, 'source-diff');
  }
  $: if (sourceDiff && $source.latest && sourceDiff.after !== $source.latest) {
    sourceDiff = { ...sourceDiff, change: sourcePreviewChange(sourceDiff.change.path, $source.changes), after: $source.latest };
  }
  let showSourceConfirm = false;
  let sourceRevision = 0;
  let editGeneration = 0;
  let xmlEditor: XmlEditor | null = null;
  let restoreView: { top: number; left: number; anchor: number; head: number } | null = null;

  let previewEditorView: { top: number; left: number; anchor: number; head: number } | null = null;

  function stopWatchingSource() {
    source.stop();
    sourceDiff = null;
    previewEditorView = null;
    showSourceConfirm = false;
  }

  async function reloadSource(file: File, isCurrent: () => boolean, discard = false): Promise<JSZip | null> {
    if (!isCurrent() || saving || loading || discardResolver || showSettingsPanel || document.querySelector('dialog[open]')) return null;
    if (!discard && hasUnexportedChanges) return null;
    const editsAtStart = editGeneration;
    try {
      const result = await loadOfficeFile(file);
      if (!isCurrent()) { revokePreviewUrls(result.entries); return null; }
      if (saving || loading || editGeneration !== editsAtStart || (!discard && hasUnexportedChanges)) {
        revokePreviewUrls(result.entries);
        return null;
      }
      const targetPath = sourceReloadPath(result.entries.map(entry => entry.path), selectedPath, sourceDiff?.change.path ?? null);
      restoreView = sourceDiff && targetPath === sourceDiff.change.path
        ? sourceDiffPanel?.captureView() ?? null
        : targetPath === selectedPath ? (sourceDiff ? previewEditorView : xmlEditor?.captureView()) ?? null : null;
      revokePreviewUrls(entries);
      zip = result.zip;
      setPackageEntries(result.entries);
      exportedContents = snapshotContents(entries);
      fileName = result.fileName;
      selectedPath = targetPath;
      if (selectedPath) replaceRoute(selectedPath);
      else replaceToBase();
      sourceDiff = null;
      sourceRevision++;
      return result.zip;
    } catch {
      // A saving application may leave an incomplete ZIP briefly; retry later.
      return null;
    }
  }

  function requestSourceReload() {
    if (!pendingSource || sourceRequestBusy || loading || saving) return;
    if (hasUnexportedChanges) showSourceConfirm = true;
    else void reloadPendingSource(false);
  }

  async function reloadPendingSource(discard: boolean) {
    await source.reload((file, isCurrent) => reloadSource(file, isCurrent, discard));
  }

  function resolveSourceUpdate(reload: boolean) {
    showSourceConfirm = false;
    if (reload) void reloadPendingSource(true);
  }
  let selectedPath: string | null = null;
  let saving = false;
  let loading = false;
  let notice = '';
  let exportedContents = new Map<string, string>();
  let noticeTimeout: ReturnType<typeof setTimeout> | undefined;
  let discardResolver: ((discard: boolean) => void) | null = null;
  let error = '';
  let showSettingsPanel = false;
  let settingsSnapshot = loadSettings();

  const SIDEBAR_MIN = 260;
  const SIDEBAR_MAX = 600;
  const SIDEBAR_DEFAULT = 286;
  const SIDEBAR_STORAGE_KEY = 'ooxml-viewer-sidebar-width';

  let sidebarWidth = SIDEBAR_DEFAULT;
  let homeDragging = false;
  let homeDragDepth = 0;

  function resetHomeDrag() {
    homeDragDepth = 0;
    homeDragging = false;
  }

  function onHomeDragEnter(event: DragEvent) {
    if (hasFile || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    homeDragDepth++;
    homeDragging = true;
  }

  function onHomeDragOver(event: DragEvent) {
    if (hasFile || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = loading ? 'none' : 'copy';
  }

  function onHomeDragLeave(event: DragEvent) {
    if (hasFile || !event.dataTransfer?.types.includes('Files')) return;
    homeDragDepth = Math.max(0, homeDragDepth - 1);
    homeDragging = homeDragDepth > 0;
  }

  function onHomeDrop(event: DragEvent) {
    if (hasFile) return;
    const data = event.dataTransfer;
    if (!data?.files.length) { resetHomeDrag(); return; }
    event.preventDefault();
    resetHomeDrag();
    void droppedSource(data).then(source => {
      if (source) return onDrop(new CustomEvent('drop', { detail: source }));
    }).catch(() => { error = 'Unable to read dropped file.'; });
  }

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

  function snapshotContents(list: FileEntry[]) {
    return new Map(list.filter((entry) => !entry.isBinary).map((entry) => [entry.path, entry.content]));
  }

  $: modifiedPaths = new Set(entries
    .filter((entry) => !entry.isBinary && exportedContents.get(entry.path) !== entry.content)
    .map((entry) => entry.path));
  $: hasUnexportedChanges = modifiedPaths.size > 0;
  $: monitoringMessage = sourceStatus === 'watching' ? 'Source monitoring on'
    : sourceStatus === 'retrying' ? 'Source monitoring · waiting'
    : sourceStatus === 'unavailable' ? 'Source monitoring paused · reopen file'
    : 'Source monitoring unavailable';
  $: fileStatusMessage = loading ? 'Reading file…' : saving ? 'Preparing download…'
    : pendingSource ? (sourceNotice || `Source changed${checkingSourceChanges ? ' · checking…' : pendingSourceChanges ? ` · ${pendingSourceChanges.length} ${pendingSourceChanges.length === 1 ? 'file' : 'files'}` : ''}`)
    : error || sourceNotice || notice || ((!hasUnexportedChanges || sourceStatus !== 'watching') ? monitoringMessage : '');

  async function confirmDiscard(): Promise<boolean> {
    if (!hasUnexportedChanges) return true;
    if (discardResolver) return false;
    return new Promise((resolve) => (discardResolver = resolve));
  }

  function resolveDiscard(discard: boolean) {
    const resolve = discardResolver;
    discardResolver = null;
    resolve?.(discard);
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnexportedChanges) return;
    event.preventDefault();
    event.returnValue = '';
  }

  $: if (initialData && zip === null && !initialDataApplied) {
    initialDataApplied = true;
    zip = initialData.zip;
    searchSession = createEditorSearchSession();
    setPackageEntries(initialData.entries);
    exportedContents = snapshotContents(entries);
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
    if (route?.view === 'source-diff' && showSourceDiff(route.path)) return;
    sourceDiff = null;
    previewEditorView = null;
    selectedPath = route && ent.some(entry => entry.path === route.path) ? route.path : null;
    // A URL cannot recover memory-only source snapshots after a page reload or package replacement.
    if (route?.view === 'source-diff') {
      if (selectedPath) replaceRoute(selectedPath);
      else replaceToBase();
    }
  }

  function onPopState() {
    restoreView = null;
    applyRouteToState();
  }

  onMount(() => {
    saveShortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘S' : 'Ctrl+S';
    teardownShortcuts = initShortcuts({
      hasFile: () => zip !== null && entries.length > 0,
      isModalOpen: () => showSettingsPanel || discardResolver !== null || document.querySelector('dialog[open]') !== null,
      onSave: handleSaveShortcut,
    });
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
    stopWatchingSource();
    teardownShortcuts?.();
    clearTimeout(noticeTimeout);
    revokePreviewUrls(entries);
  });

  $: currentEntry = selectedPath
    ? entries.find((e) => e.path === selectedPath) ?? null
    : null;
  $: editorContent = currentEntry?.content ?? '';
  $: hasFile = zip !== null && entries.length > 0;

  /** Ref kept in sync so popstate handler always sees current state (avoids stale closure). */
  let routeStateRef: { hasFile: boolean; entries: FileEntry[] } = { hasFile: false, entries: [] };
  $: routeStateRef = { hasFile, entries };
  /** Priority for Depends on order: theme (0) > master (1) > layout (2) > slide (3) > others (4). */
  function dependencyOrder(path: string): number {
    const p = path.replace(/\\/g, '/').toLowerCase();
    if (/\/theme\//.test(p)) return 0;
    if (/master/i.test(p)) return 1;
    if (/layout/i.test(p)) return 2;
    if (/\/slides\//.test(p)) return 3;
    return 4;
  }

  $: packagePaths = packageIndex.paths;
  $: relationshipTargets = packageIndex.targetsFor(selectedPath ?? '');
  $: relationsIndex = packageIndex;
  $: currentReferencedBy = [...(relationsIndex.referencedBy.get(selectedPath ?? '') ?? [])]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $: currentDependencies = (() => {
    const list = [...(relationsIndex.references.get(selectedPath ?? '') ?? [])];
    return [...list].sort((a, b) => {
      const orderA = dependencyOrder(a);
      const orderB = dependencyOrder(b);
      if (orderA !== orderB) return orderA - orderB;
      const aImage = isImagePath(a) || /\/media\//i.test(a);
      const bImage = isImagePath(b) || /\/media\//i.test(b);
      if (aImage === bImage) return 0;
      return aImage ? 1 : -1;
    });
  })();

  $: if (!hasFile) replaceToBase();

  /** Run callback inside View Transitions API when supported, so hero elements can animate. */
  function withViewTransition(fn: () => void) {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as Document & { startViewTransition: (cb: () => void) => { finished: Promise<void> } }).startViewTransition(fn);
    } else {
      fn();
    }
  }

  async function onDrop(event: CustomEvent<{ file: File; handle?: SourceFileHandle }>) {
    if (loading || saving) return;
    if (!(await confirmDiscard()) || loading || saving) return;
    const file = event.detail.file;
    error = '';
    notice = '';
    loading = true;
    try {
      const result = await loadOfficeFile(file);
      stopWatchingSource();
      restoreView = null;
      withViewTransition(() => {
        revokePreviewUrls(entries);
        zip = result.zip;
        searchSession = createEditorSearchSession();
        setPackageEntries(result.entries);
        exportedContents = snapshotContents(entries);
        fileName = result.fileName;
        selectedPath = null;
        replaceToBase();
        source.start(file, result.zip, event.detail.handle);
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to open file';
    } finally {
      loading = false;
    }
  }

  function onFileSelect(event: CustomEvent<{ path: string }>) {
    sourceDiff = null;
    restoreView = null;
    selectedPath = event.detail.path;
    if (hasFile && selectedPath) pushRoute(selectedPath);
  }

  function onRevealPath(event: CustomEvent<{ path: string }>) {
    void fileTree?.reveal(event.detail.path);
  }

  function onContentChange(event: CustomEvent<{ value: string; initial?: boolean }>) {
    if (!selectedPath) return;
    const entry = entries.find((e) => e.path === selectedPath);
    if (entry && !entry.isBinary) {
      if (!event.detail.initial) editGeneration++;
      // Automatic display formatting is not a user edit. Keep an already-dirty baseline intact.
      if (event.detail.initial && exportedContents.get(entry.path) === entry.content) {
        exportedContents = new Map(exportedContents).set(entry.path, event.detail.value);
      }
      entry.content = event.detail.value;
      if (packageIndex.update(entry.path, entry.content)) packageIndex = packageIndex;
      entries = [...entries];
    }
  }

  async function newFile() {
    if (loading || saving) return;
    if (!(await confirmDiscard()) || loading || saving) return;
    stopWatchingSource();
    restoreView = null;
    revokePreviewUrls(entries);
    requestAnimationFrame(() => {
      withViewTransition(() => {
        zip = null;
        setPackageEntries([]);
        searchSession = createEditorSearchSession();
        exportedContents = new Map();
        fileName = '';
        selectedPath = null;
        error = '';
        notice = '';
      });
    });
  }

  function showNotice(message: string) {
    notice = message;
    clearTimeout(noticeTimeout);
    noticeTimeout = setTimeout(() => (notice = ''), 6000);
  }

  function handleSaveShortcut() {
    if (saving || loading) return;
    if (!hasUnexportedChanges) {
      showNotice('No unexported changes.');
      return;
    }
    void save();
  }

  async function save() {
    if (!zip || entries.length === 0 || saving || loading) return;
    saving = true;
    error = '';
    notice = '';
    const downloadedEntries = entries.map((entry) => ({ ...entry }));
    try {
      await repackAndDownload(zip, downloadedEntries, fileName);
      exportedContents = snapshotContents(downloadedEntries);
      showNotice('Download started. Your original file is unchanged.');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      saving = false;
    }
  }

  async function openFileInput() {
    if (loading || saving) return;
    const source = await pickSourceFile();
    if (source === null) return;
    if (source) { await onDrop(new CustomEvent('drop', { detail: source })); return; }
    const input = document.getElementById('file-input') as HTMLInputElement;
    input?.click();
  }

  function onFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onDrop(new CustomEvent('drop', { detail: { file } }));
    input.value = '';
  }

</script>

<svelte:window
  on:dragenter={onHomeDragEnter}
  on:dragover={onHomeDragOver}
  on:dragleave={onHomeDragLeave}
  on:drop={onHomeDrop}
  on:dragend={resetHomeDrag}
  on:blur={resetHomeDrag}
  on:beforeunload={onBeforeUnload}
  on:mousemove={onWindowMouseMove}
  on:mouseup={onWindowMouseUp}
  on:mouseleave={onWindowMouseUp}
/>
<svelte:head>
  <style>
    .hero-transition { view-transition-name: hero; }
    ::view-transition-old(hero),
    ::view-transition-new(hero) {
      animation-duration: 0.3s;
    }
    html, body, #app { margin: 0; padding: 0; height: 100%; }
    body {
      background: var(--color-bg-base);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .upload-home {
      padding-bottom: calc(2rem + clamp(24px, 8vh, 80px));
    }
    .file-status-line {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 20px;
      min-width: 0;
      color: var(--color-text-muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .file-status-message, .file-status-modified {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-status-modified { flex-shrink: 0; max-width: 55%; }
    #app main button.file-status-reload {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      gap: 4px;
      height: 20px;
      padding: 0 5px;
      font-size: 11px;
      color: var(--color-primary);
    }
    @media (max-height: 560px) {
      .upload-home { padding-bottom: 2rem; }
    }
    .home-title {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 32px;
      font-weight: 600;
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
    ul, ol { padding-inline-start: 0; }
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

<main class="relative m-0 p-0 min-h-screen h-full flex flex-col bg-bg-base" class:select-none={dragging || !hasFile}>
  {#if showSourceConfirm}
    <DiscardChangesDialog
      title="Source file changed"
      description="Reload the entire package from disk? All unexported edits in every file will be replaced. Download your current edits first if you want to keep them."
      confirmLabel="Reload source"
      onResolve={resolveSourceUpdate}
    />
  {/if}
  {#if discardResolver}
    <DiscardChangesDialog onResolve={resolveDiscard} />
  {/if}
  <SettingsPanel
    visible={showSettingsPanel}
    onClose={() => (showSettingsPanel = false)}
    onSave={(settings) => { settingsSnapshot = settings; }}
  />
  {#if !hasFile}
    <div class="absolute bottom-0 left-0 z-10 flex items-center h-12 box-border px-3">
      <button type="button" class="toolbar-utility h-9 w-9 p-0 inline-flex items-center justify-center" aria-label="Settings" title="Settings" on:click={() => (showSettingsPanel = true)}>
        <span class="i-tabler-settings w-5 h-5" aria-hidden="true"></span>
      </button>
    </div>
    <section class="upload-home flex-1 flex flex-col items-center justify-center p-8 box-border bg-bg-base">
      <div class="w-full max-w-[440px] text-center">
        <div class="mb-8 flex flex-col items-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} width="56" height="56" alt="" draggable="false" class="mb-5" />
          <h1 class="home-title m-0 text-text-primary">OOXML Viewer</h1>
          <p class="mt-3 mb-0 text-sm leading-relaxed text-text-secondary">Explore and edit the structure of Office files.</p>
        </div>
        <DropZone dragging={homeDragging} on:click={openFileInput} />
        <p class="mt-4 mb-0 text-xs text-text-secondary">Files stay in your browser.</p>
      </div>
      {#if loading}
        <p class="mt-4 text-sm text-text-secondary" role="status">Reading file…</p>
      {/if}
      {#if error}
        <p class="mt-4 text-red-600 text-sm">{error}</p>
      {/if}
    </section>
  {:else}
    <header class="shrink-0 flex items-center justify-between gap-3 px-3 py-3 border-b border-border-base bg-bg-base">
      <div class="min-w-0 flex-1 pl-2 flex flex-col gap-0.5">
        <span class="font-mono font-medium text-text-primary truncate text-sm" title={fileName}>{fileName}</span>
        <div class="file-status-line" role="status" aria-label="File status">
          {#if hasUnexportedChanges}
            <span class="file-status-modified text-primary" title="Download a copy to export your changes">Unexported changes · {modifiedPaths.size}</span>
          {/if}
          {#if hasUnexportedChanges && fileStatusMessage}<span aria-hidden="true">·</span>{/if}
          {#if fileStatusMessage}
            <span class="file-status-message" class:text-primary={!!pendingSource} class:text-red-600={!!error} title={fileStatusMessage}>{fileStatusMessage}</span>
          {/if}
          {#if pendingSource}
            {#if sourceChangesError}
              <button type="button" class="toolbar-utility file-status-reload" disabled={checkingSourceChanges} title={sourceChangesError} on:click={() => { void source.retry(); }}>Retry check</button>
            {/if}
            <button type="button" class="toolbar-utility file-status-reload" disabled={sourceRequestBusy || saving || loading} on:click={requestSourceReload} title="Reload the entire package from disk">
              <span class="i-tabler-refresh w-3 h-3" aria-hidden="true"></span>
              {sourceRequestBusy ? 'Reloading…' : 'Reload source'}
            </button>
          {/if}
        </div>
      </div>
      <div class="shrink-0 flex items-center gap-3">
        <div class="flex items-center gap-1.5" role="group" aria-label="File actions">
          <button
            class="toolbar-download h-9 px-3 text-sm font-medium inline-flex items-center gap-2"
            class:has-changes={hasUnexportedChanges}
            title={sourceDiff || pendingSource ? `Download the loaded package with your edits; pending disk updates are excluded (${saveShortcutLabel})` : `Download (${saveShortcutLabel})`}
            aria-keyshortcuts={saveShortcutLabel === '⌘S' ? 'Meta+S' : 'Control+S'}
            disabled={saving || loading}
            on:click={save}
          >
            <span class="i-tabler-download w-5 h-5 shrink-0" aria-hidden="true"></span>
            {saving ? 'Preparing…' : 'Download'}
          </button>
          <button class="toolbar-utility hero-transition h-9 w-9 p-0 text-sm inline-flex items-center justify-center" title="Close file" aria-label="Close file" disabled={loading || saving} on:click={newFile}>
            <span class="i-tabler-x w-5 h-5" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </header>
    <div class="flex-1 flex min-h-0 overflow-hidden bg-bg-base">
      <div
        class="flex flex-col h-full shrink-0 border-r border-border-base bg-bg-base overflow-hidden"
        style="width: {sidebarWidth}px"
      >
        <FileTree
          bind:this={fileTree}
          entries={packageIndex.treeEntries}
          selectedPath={sourceDiff?.change.path ?? selectedPath}
          sourceChanges={pendingSourceChanges ?? []}
          on:sourceSelect={openSourceDiff}
          fileName={fileName}
          {modifiedPaths}
          on:select={onFileSelect}
        >
          <div slot="footer" class="shrink-0 flex items-center h-12 box-border px-3 border-t border-border-base">
            <button
              type="button"
              class="toolbar-utility h-9 w-9 p-0 inline-flex items-center justify-center"
              aria-label="Settings"
              title="Settings"
              on:click={() => (showSettingsPanel = true)}
            >
              <span class="i-tabler-settings w-5 h-5" aria-hidden="true"></span>
            </button>
          </div>
        </FileTree>
      </div>
      <div
        class="sidebar-resize-handle shrink-0 cursor-col-resize transition-all duration-150 select-none"
        class:resizing={dragging}
        role="button"
        tabindex="0"
        aria-label="Resize sidebar"
        on:mousedown={resizeHandleMousedown}
      ></div>
      <div class="flex-1 min-w-0 min-h-0 overflow-hidden" style:display={sourceDiff ? 'none' : 'flex'} aria-hidden={sourceDiff ? 'true' : undefined}>
      {#key `${sourceRevision}:${selectedPath}`}
        {#if currentEntry?.previewUrl}
          <ImagePreview
            path={selectedPath}
            previewUrl={currentEntry.previewUrl}
            dependencies={currentDependencies}
            referencedBy={currentReferencedBy}
            on:selectPath={onFileSelect}
            on:revealPath={onRevealPath}
          />
        {:else if currentEntry?.isBinary && selectedPath}
          <BinaryPreview
            path={selectedPath}
            dependencies={currentDependencies}
            referencedBy={currentReferencedBy}
            on:selectPath={onFileSelect}
            on:revealPath={onRevealPath}
          />
        {:else}
          <XmlEditor
            bind:this={xmlEditor}
            active={!sourceDiff}
            {restoreView}
            path={selectedPath}
            content={editorContent}
            {searchSession}
            baselineContent={exportedContents.get(selectedPath ?? '') ?? editorContent}
            readOnly={currentEntry?.isBinary ?? true}
            dependencies={currentDependencies}
            referencedBy={currentReferencedBy}
            {packagePaths}
            {relationshipTargets}
            autoCollapseTags={parseAutoCollapseTags(settingsSnapshot.autoCollapseTags)}
            on:contentChange={onContentChange}
            on:selectPath={onFileSelect}
            on:revealPath={onRevealPath}
          />
        {/if}
      {/key}
      </div>
      {#if sourceDiff}
        {#key sourceDiff.change.path}
          <SourceDiffPanel bind:this={sourceDiffPanel} change={sourceDiff.change} before={sourceDiff.before} after={sourceDiff.after} onClose={closeSourceDiff} />
        {/key}
      {/if}
    </div>
  {/if}
</main>
