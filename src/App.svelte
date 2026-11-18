<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { droppedSource, pickSourceFile, watchSourceFile, fileVersion, type SourceFileHandle, type SourceWatchState } from './lib/sourceFile';
  import DropZone from './lib/DropZone.svelte';
  import FileTree from './lib/FileTree.svelte';
  import XmlEditor from './lib/XmlEditor.svelte';
  import BinaryPreview from './lib/BinaryPreview.svelte';
  import ImagePreview from './lib/ImagePreview.svelte';
  import RelsGraph from './lib/RelsGraph.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import GitHubLink from './lib/GitHubLink.svelte';
  import DiscardChangesDialog from './lib/DiscardChangesDialog.svelte';
  import { createEditorSearchSession } from './lib/editorSearch';
  import { initShortcuts } from './lib/shortcuts';
  import { loadSettings, parseAutoCollapseTags } from './lib/settings';
  import { ACCEPT_OFFICE } from './lib/constants';
  import { buildRelationsIndex, getRelationshipTargets } from './lib/relsGraph';
  import { getRoute, getPathFromState, pushRoute, replaceToBase } from './lib/routeHistory';
  import { isImagePath, loadOfficeFile, repackAndDownload, type FileEntry } from './lib/ooxml';
  import type JSZip from 'jszip';

  let teardownShortcuts: (() => void) | null = null;
  let fileTree: FileTree | null = null;
  let saveShortcutLabel = 'Ctrl+S';

  let zip: JSZip | null = null;
  let entries: FileEntry[] = [];
  let fileName = '';
  let searchSession = createEditorSearchSession();
  let stopSourceWatch: (() => void) | null = null;
  let sourceSession = 0;
  let sourceStatus: SourceWatchState | 'unsupported' = 'unsupported';
  let pendingSource: File | null = null;
  let sourceNotice = '';
  let sourceNoticeTimeout: ReturnType<typeof setTimeout> | undefined;

  function showSourceNotice(message: string) {
    sourceNotice = message;
    clearTimeout(sourceNoticeTimeout);
    sourceNoticeTimeout = setTimeout(() => { sourceNotice = ''; }, 4000);
  }
  let sourceHandle: SourceFileHandle | null = null;
  let loadedSourceVersion = '';
  let showSourceConfirm = false;
  let sourceRequestBusy = false;
  let sourceRevision = 0;
  let sourceReloading = false;
  let editGeneration = 0;
  let xmlEditor: XmlEditor | null = null;
  let restoreView: { top: number; left: number; anchor: number; head: number } | null = null;

  function stopWatchingSource() {
    sourceSession++;
    stopSourceWatch?.();
    stopSourceWatch = null;
    pendingSource = null;
    sourceNotice = '';
    clearTimeout(sourceNoticeTimeout);
    sourceHandle = null;
    loadedSourceVersion = '';
    showSourceConfirm = false;
    sourceStatus = 'unsupported';
  }

  async function reloadSource(file: File, session: number, discard = false): Promise<boolean> {
    if (session !== sourceSession || sourceReloading || saving || loading || discardResolver || showSettingsPanel || document.querySelector('dialog[open]')) return false;
    if (!discard && hasUnexportedChanges) return false;
    const editsAtStart = editGeneration;
    sourceReloading = true;
    try {
      const result = await loadOfficeFile(file);
      if (session !== sourceSession) { revokePreviewUrls(result.entries); return false; }
      if (saving || loading || editGeneration !== editsAtStart || (!discard && hasUnexportedChanges)) {
        revokePreviewUrls(result.entries);
        return false;
      }
      restoreView = xmlEditor?.captureView() ?? null;
      revokePreviewUrls(entries);
      zip = result.zip;
      entries = result.entries;
      exportedContents = snapshotContents(entries);
      fileName = result.fileName;
      if (selectedPath && !entries.some(entry => entry.path === selectedPath)) {
        selectedPath = null;
        replaceToBase();
      }
      sourceRevision++;
      loadedSourceVersion = fileVersion(file);
      return true;
    } catch {
      // A saving application may leave an incomplete ZIP briefly; retry later.
      return false;
    } finally {
      sourceReloading = false;
    }
  }

  function watchOpenedSource(handle: SourceFileHandle | undefined, file: File) {
    sourceHandle = handle ?? null;
    loadedSourceVersion = fileVersion(file);
    if (!handle) return;
    const session = sourceSession;
    stopSourceWatch = watchSourceFile(handle, file, async changed => {
      if (session !== sourceSession) return false;
      if (fileVersion(changed) !== loadedSourceVersion) {
        pendingSource = changed;
        sourceNotice = '';
        clearTimeout(sourceNoticeTimeout);
      }
      return true;
    }, state => { if (session === sourceSession) sourceStatus = state; });
  }

  function requestSourceReload() {
    if (!pendingSource || sourceRequestBusy || loading || saving) return;
    if (hasUnexportedChanges) showSourceConfirm = true;
    else void reloadPendingSource(false);
  }

  async function reloadPendingSource(discard: boolean) {
    const pendingAtStart = pendingSource;
    if (!pendingAtStart || sourceRequestBusy) return;
    const session = sourceSession;
    sourceRequestBusy = true;
    try {
      // Fetch a fresh snapshot; Office may have saved again since the notice.
      const latest = sourceHandle ? await sourceHandle.getFile() : pendingAtStart;
      if (session !== sourceSession) return;
      const applied = await reloadSource(latest, session, discard);
      if (session !== sourceSession) return;
      if (applied) {
        if (pendingSource === pendingAtStart || (pendingSource && fileVersion(pendingSource) === loadedSourceVersion)) pendingSource = null;
        if (!pendingSource) showSourceNotice('Source file reloaded.');
      } else showSourceNotice('Unable to reload right now. Your edits are preserved; try again shortly.');
    } catch {
      if (session === sourceSession) showSourceNotice('Source is unavailable. Your edits are preserved; try again shortly.');
    } finally {
      sourceRequestBusy = false;
    }
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
  let showRelsGraph = false;
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
    : pendingSource ? (sourceNotice || 'Source changed')
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
    entries = initialData.entries;
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
    if (route && ent.some((e) => e.path === route.path)) {
      selectedPath = route.path;
    } else {
      selectedPath = null;
    }
  }

  function onPopState(event: PopStateEvent) {
    restoreView = null;
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

  $: packagePaths = new Set(entries.map(entry => entry.path));
  $: relationshipTargets = selectedPath ? getRelationshipTargets(selectedPath, entries) : new Map<string, string>();
  $: relationsIndex = buildRelationsIndex(entries);
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
        entries = result.entries;
        exportedContents = snapshotContents(entries);
        fileName = result.fileName;
        selectedPath = null;
        watchOpenedSource(event.detail.handle, file);
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to open file';
    } finally {
      loading = false;
    }
  }

  function onFileSelect(event: CustomEvent<{ path: string }>) {
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
        entries = [];
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
      color: var(--color-primary) !important;
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
    /* Unified flat button: higher specificity so we override CM and others */
    #app button:not(.settings-overlay-backdrop):not(:where(.dependency-item, .part-path, .dependency-trigger, .cm-part-link-target, .cm-revert-change)),
    #app .app-button,
    #app .cm-button,
    #app main button:not(.settings-overlay-backdrop):not(:where(.dependency-item, .part-path, .dependency-trigger, .cm-part-link-target, .cm-revert-change)) {
      box-shadow: none !important;
      background-image: none !important;
      background-color: var(--color-bg-secondary) !important;
      border: 1px solid var(--color-border-base) !important;
      border-radius: 6px !important;
      color: var(--color-text-secondary) !important;
      font: inherit;
      cursor: pointer;
    }
    #app button:not(.settings-overlay-backdrop):not(:where(.dependency-item, .part-path, .dependency-trigger, .cm-part-link-target, .cm-revert-change)):hover,
    #app .app-button:hover,
    #app .cm-button:hover {
      background-color: var(--color-bg-hover) !important;
    }
    #app button:not(.settings-overlay-backdrop):not(:where(.dependency-item, .part-path, .dependency-trigger, .cm-part-link-target, .cm-revert-change)):active,
    #app .app-button:active,
    #app .cm-button:active {
      background-color: var(--color-bg-hover) !important;
    }
    #app button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    #app main button.toolbar-utility,
    #app main a.toolbar-utility {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    #app main .toolbar-utility:hover,
    #app main .toolbar-utility:active {
      background-color: var(--color-bg-hover) !important;
    }
    #app main button.inline-diff-toggle[aria-pressed="true"] {
      background-color: var(--color-bg-element) !important;
      color: var(--color-text-primary) !important;
    }
    #app main button.toolbar-download.has-changes {
      background-color: #1f1e1b !important;
      border-color: #1f1e1b !important;
      color: var(--color-bg-white) !important;
    }
    #app main button.toolbar-download.has-changes:hover,
    #app main button.toolbar-download.has-changes:active {
      background-color: #3b3933 !important;
      border-color: #3b3933 !important;
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

<main class="relative m-0 p-0 min-h-screen h-full flex flex-col bg-bg-base" class:select-none={dragging || !hasFile}>
  {#if showSourceConfirm}
    <DiscardChangesDialog
      title="Source file changed"
      description="The file on disk has changed. Reloading replaces your current unexported edits with the source file. Keep editing to preserve your current work."
      confirmLabel="Reload source"
      onResolve={resolveSourceUpdate}
    />
  {/if}
  {#if discardResolver}
    <DiscardChangesDialog onResolve={resolveDiscard} />
  {/if}
  {#if !hasFile}
    <div class="absolute top-3 right-3">
      <GitHubLink />
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
            <button type="button" class="toolbar-utility file-status-reload" disabled={sourceRequestBusy || saving || loading} on:click={requestSourceReload} title="Reload source file">
              <span class="i-tabler-refresh w-3 h-3" aria-hidden="true"></span>
              {sourceRequestBusy ? 'Reloading…' : 'Reload'}
            </button>
          {/if}
        </div>
      </div>
      <div class="shrink-0 flex items-center gap-3">
        <div class="flex items-center gap-1.5" role="group" aria-label="File actions">
          <button
            class="toolbar-download h-9 px-3 text-sm font-medium inline-flex items-center gap-2"
            class:has-changes={hasUnexportedChanges}
            title={`Download (${saveShortcutLabel})`}
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
    <SettingsPanel
      visible={showSettingsPanel}
      onClose={() => (showSettingsPanel = false)}
      onSave={(s) => (settingsSnapshot = s)}
    />
    <div class="flex-1 flex min-h-0 overflow-hidden bg-bg-base">
      <div
        class="flex flex-col h-full shrink-0 border-r border-border-base bg-bg-base overflow-hidden"
        style="width: {sidebarWidth}px"
      >
        <FileTree
          bind:this={fileTree}
          entries={entries}
          selectedPath={selectedPath}
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
      {#key `${sourceRevision}:${selectedPath}`}
        {#if showRelsGraph}
          <RelsGraph entries={entries} />
        {:else if currentEntry?.previewUrl}
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
  {/if}
</main>
