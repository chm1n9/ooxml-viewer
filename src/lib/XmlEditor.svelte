<script lang="ts">
  import DiscardChangesDialog from './DiscardChangesDialog.svelte';
  import { validateXml, type XmlIssue } from './xmlValidation';
  import EmptyFileState from './EmptyFileState.svelte';
  import { onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { EditorView, lineNumbers, keymap, ViewPlugin } from '@codemirror/view';
  import { inlineDiffEnabled, setInlineDiffEnabled } from './diffPreference';
  import { changeNavigation, navigateChange } from './diffNavigation';
  import { inlineDiff } from './inlineDiff';
  import { Compartment, EditorState } from '@codemirror/state';
  import { history, historyKeymap } from '@codemirror/commands';
  import {
    syntaxHighlighting,
    defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentUnit,
    foldEffect,
    foldedRanges,
    unfoldEffect,
    syntaxTree,
  } from '@codemirror/language';
  import { search, searchKeymap, openSearchPanel, getSearchQuery, setSearchQuery, searchPanelOpen } from '@codemirror/search';
  import { xml } from '@codemirror/lang-xml';
  import { createEditorSearchSession, type EditorSearchSession } from './editorSearch';
  import { openSearchStore } from './shortcuts';
  import format from 'xml-formatter';
  import { xmlLinks } from './xmlLinks';
  import PartToolbar from './PartToolbar.svelte';

  const dispatch = createEventDispatcher<{ contentChange: { value: string; initial?: boolean }; selectPath: { path: string } }>();

  const FORMAT_OPTIONS = { indentation: '  ', collapseContent: true, lineSeparator: '\n' };

  function formatContent(raw: string): string {
    try {
      return format(raw, FORMAT_OPTIONS);
    } catch {
      return raw;
    }
  }

  export let path: string | null = null;
  export let content: string = '';
  export let baselineContent: string = '';
  export let searchSession: EditorSearchSession = createEditorSearchSession();
  let editedContent = content;
  const diffCompartment = new Compartment();
  let appliedDiffBaseline: string | null = null;
  let appliedDiffEnabled = false;
  let showRevertFile = false;
  let xmlIssue: XmlIssue | null = null;
  let validationTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleValidation(value: string) {
    clearTimeout(validationTimer);
    if (readOnly || !path || !/\.(xml|rels|vml)$/i.test(path)) { xmlIssue = null; return; }
    xmlIssue = null;
    validationTimer = setTimeout(() => { xmlIssue = validateXml(value); }, 450);
  }

  function revealXmlIssue() {
    if (!editorView || !xmlIssue) return;
    const view = editorView;
    const line = view.state.doc.line(Math.min(xmlIssue.line ?? 1, view.state.doc.lines));
    const position = Math.min(line.to, line.from + (xmlIssue.column ?? 1) - 1);
    const effects = [EditorView.scrollIntoView(position, { y: 'center' })];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      if (from <= position && position <= to) effects.push(unfoldEffect.of({ from, to }));
    });
    view.dispatch({ selection: { anchor: position }, effects });
    view.focus();
  }

  function resolveRevertFile(confirmed: boolean) {
    showRevertFile = false;
    if (!confirmed || !editorView) return;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: baselineContent },
      selection: { anchor: 0 },
      userEvent: 'revert',
      scrollIntoView: true,
    });
    editorView.focus();
  }

  let changeCount = 0;
  let activeChange = -1;

  function updateChangeNavigation(state: EditorState) {
    const { chunks, active } = changeNavigation(state);
    changeCount = chunks.length;
    activeChange = active;
  }

  function goToChange(direction: -1 | 1) {
    if (editorView) navigateChange(editorView, direction);
  }
  $: hasChanges = editedContent !== baselineContent;

  function syncDiff(original: string, enabled: boolean) {
    if (!editorView || (original === appliedDiffBaseline && enabled === appliedDiffEnabled)) return;
    appliedDiffBaseline = original;
    appliedDiffEnabled = enabled;
    editorView.dispatch({ effects: diffCompartment.reconfigure(enabled ? inlineDiff(original) : []) });
  }

  $: if (editorView) syncDiff(baselineContent, $inlineDiffEnabled && !readOnly);
  export let readOnly: boolean = false;
  export let dependencies: string[] = [];
  export let referencedBy: string[] = [];
  export let packagePaths: Set<string> = new Set();
  export let relationshipTargets: Map<string, string> = new Map();
  /** Tag names to auto-fold when opening a file (e.g. ['w:p', 'w:t']). */
  export let autoCollapseTags: string[] = [];

  /** Create a ViewPlugin that applies auto-collapse when syntax tree is ready. */
  function createAutoCollapseExtension(tagSet: Set<string>) {
    return ViewPlugin.fromClass(
      class {
        didFold = false;

        update(update: any) {
          // 已经折叠过，跳过
          if (this.didFold) return;

          const state = update.state;
          const tree = syntaxTree(state);

          // 判断：语法树是否覆盖全文
          if (tree.length !== state.doc.length) return;

          // 延迟应用折叠，避免在更新过程中触发新的更新
          this.didFold = true;
          setTimeout(() => {
            applyAutoCollapseTags(update.view, tagSet);
          }, 0);
        }
      }
    );
  }

  /** Collect fold ranges for all XML elements whose tag name is in tagSet, by walking the syntax tree. */
  function applyAutoCollapseTags(view: EditorView, tagSet: Set<string>): number {
    const state = view.state;
    const tree = syntaxTree(state);
    const foldRanges: Array<{ from: number; to: number; tagName: string }> = [];

    tree.iterate({
      enter: (node) => {
        // 只处理 Element 节点
        if (node.type.name !== 'Element') return;

        // 查找 OpenTag 和 CloseTag
        let openTagEnd = -1;
        let closeTagStart = -1;
        let tagName = '';

        // 创建新的游标来遍历子节点
        const cursor = node.node.cursor();
        if (!cursor.firstChild()) return;

        do {
          if (cursor.type.name === 'OpenTag') {
            // 记录 OpenTag 的结束位置
            openTagEnd = cursor.to;

            // 在 OpenTag 内查找 TagName
            const openCursor = cursor.node.cursor();
            if (openCursor.firstChild()) {
              do {
                if (openCursor.type.name === 'TagName') {
                  tagName = state.sliceDoc(openCursor.from, openCursor.to);
                  break;
                }
              } while (openCursor.nextSibling());
            }
          } else if (cursor.type.name === 'CloseTag') {
            // 记录 CloseTag 的开始位置
            closeTagStart = cursor.from;
          } else if (cursor.type.name === 'SelfClosingTag') {
            // 自闭合标签，不需要折叠
            const selfCursor = cursor.node.cursor();
            if (selfCursor.firstChild()) {
              do {
                if (selfCursor.type.name === 'TagName') {
                  tagName = state.sliceDoc(selfCursor.from, selfCursor.to);
                  break;
                }
              } while (selfCursor.nextSibling());
            }
          }
        } while (cursor.nextSibling());

        // 如果找到了标签名，且在目标集合中，且有有效的折叠范围
        if (tagName && tagSet.has(tagName) && openTagEnd > 0 && closeTagStart > openTagEnd) {
          foldRanges.push({ from: openTagEnd, to: closeTagStart, tagName });
        }
      },
    });

    if (foldRanges.length > 0) {
      // 一次性应用所有折叠效果
      const effects = foldRanges.map(range => foldEffect.of({ from: range.from, to: range.to }));
      view.dispatch({ effects });
      console.log(`Auto-collapsed ${effects.length} tags:`, foldRanges.map(r => r.tagName));
    }

    return foldRanges.length;
  }

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;
  let lastPath: string | null = null;

  $: if (path !== lastPath) {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
    lastPath = path;
  }

  $: initialContent = content ? formatContent(content) : '';

  $: if (path && editorContainer && !editorView) {
    const extensions = [
      lineNumbers(),
      foldGutter({
        markerDOM: (open) => {
          const marker = document.createElement('span');
          marker.className = open
            ? 'i-tabler-chevron-down'
            : 'i-tabler-chevron-right';
          return marker;
        },
      }),
      history(),
      diffCompartment.of([]),
      keymap.of([...historyKeymap, ...foldKeymap, ...searchKeymap]),
      search(),
      xml(),
      xmlLinks(() => ({ path: path ?? '', paths: packagePaths, targets: relationshipTargets }),
        target => dispatch('selectPath', { path: target })),
      syntaxHighlighting(defaultHighlightStyle),
      indentUnit.of('  '),
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((update) => {
        updateChangeNavigation(update.state);
        searchSession.open = searchPanelOpen(update.state);
        searchSession.query = getSearchQuery(update.state);
        if (update.docChanged) {
          editedContent = update.state.doc.toString();
          scheduleValidation(editedContent);
          dispatch('contentChange', { value: update.state.doc.toString() });
        }
      }),
      // 自动折叠标签的扩展
      ...(autoCollapseTags.length > 0 ? [createAutoCollapseExtension(new Set(autoCollapseTags))] : []),
      EditorView.theme({
        '&': { fontSize: '13px' },
        '.cm-content': { fontFamily: 'inherit', padding: '1rem' },
        '&.cm-focused': { outline: 'none' },
        '.cm-gutters': { borderRight: '1px solid var(--color-border-base)', backgroundColor: 'var(--color-bg-secondary)' },
        '.cm-lineNumbers': { minWidth: 'calc(4ch + 16px)' },
        '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '8px', color: 'var(--color-text-secondary)' },
        '.cm-foldGutter .cm-gutterElement': {
          padding: '0 4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '.cm-foldGutter .cm-gutterElement span': {
          width: '14px',
          height: '14px',
          display: 'inline-block',
          color: 'var(--color-text-secondary)',
        },
        '.cm-foldGutter .cm-gutterElement:hover span': {
          color: 'var(--color-primary)',
        },
        /* Search panel: match app style */
        '.cm-panel': {
          backgroundColor: 'var(--color-bg-secondary)',
          borderTop: '1px solid var(--color-border-base)',
          padding: '8px 12px',
          fontFamily: 'inherit',
          fontSize: '13px',
        },
        '.cm-search': {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
        },
        '.cm-search .cm-textfield': {
          padding: '6px 10px',
          border: '1px solid var(--color-border-base)',
          borderRadius: '6px',
          backgroundColor: 'var(--color-bg-white)',
          color: 'var(--color-text-primary)',
          fontSize: '13px',
        },
        '.cm-search .cm-textfield::placeholder': { color: 'var(--color-text-secondary)' },
        /* Flat button via CodeMirror theme (no reliance on global specificity) */
        '.cm-search .cm-button': {
          padding: '6px 12px',
          fontSize: '13px',
          boxShadow: 'none',
          backgroundImage: 'none',
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-base)',
          borderRadius: '6px',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
        },
        '.cm-search .cm-button:hover': { backgroundColor: 'var(--color-bg-hover)' },
        '.cm-search .cm-button:active': { backgroundColor: 'var(--color-bg-hover)' },
        '.cm-search button[name="close"]': {
          marginLeft: 'auto',
          padding: '6px',
          width: '28px',
          height: '28px',
          fontSize: '0', // 隐藏 × 文字
          lineHeight: 0,
          boxShadow: 'none',
          backgroundImage: 'none',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          position: 'relative',
        },
        '.cm-search button[name="close"]::before': {
          content: '""',
          position: 'absolute',
          inset: '6px',
          // Tabler X icon SVG (24x24)
          mask: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\'%3E%3Cpath d=\'M18 6L6 18M6 6l12 12\'/%3E%3C/svg%3E") center/contain no-repeat',
          backgroundColor: 'var(--color-text-secondary)',
        },
        '.cm-search button[name="close"]:hover': {
          backgroundColor: 'var(--color-bg-hover)',
          border: '1px solid var(--color-border-base)',
        },
        '.cm-search button[name="close"]:hover::before': {
          backgroundColor: 'var(--color-primary)',
        },
        '.cm-search button[name="close"]:active': {
          backgroundColor: 'var(--color-bg-hover)',
        },
        '.cm-search label': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--color-text-secondary)',
          fontSize: '12px',
          cursor: 'pointer',
        },
        '.cm-search input[type="checkbox"]': {
          accentColor: 'var(--color-primary)',
        },
        '.cm-searchMatch': { backgroundColor: 'rgba(164, 92, 64, 0.12)' },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(164, 92, 64, 0.24)' },
      }),
    ];
    const savedSearch = { ...searchSession };
    const previousFocus = document.activeElement;
    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });
    editorView = new EditorView({
      state,
      parent: editorContainer,
    });
    editorView.dispatch({ effects: setSearchQuery.of(savedSearch.query) });
    if (savedSearch.open) {
      openSearchPanel(editorView);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus !== document.body) {
        previousFocus.focus({ preventScroll: true });
      }
    }
    editedContent = initialContent;
    scheduleValidation(initialContent);
    if (initialContent !== content) {
      dispatch('contentChange', { value: initialContent, initial: true });
    }
  }

  $: if (editorView) {
    const view = editorView;
    openSearchStore.set(() => openSearchPanel(view));
  }

  onDestroy(() => {
    clearTimeout(validationTimer);
    openSearchStore.set(null);
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
  });

  function formatXml() {
    if (!editorView || readOnly) return;
    try {
      const current = editorView.state.doc.toString();
      const formatted = format(current, FORMAT_OPTIONS);
      editorView.dispatch({
        changes: { from: 0, to: current.length, insert: formatted },
      });
      dispatch('contentChange', { value: formatted });
    } catch {
      alert('Invalid XML');
    }
  }
</script>

<div class="flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-l-lg border border-border-base border-l-0">
  {#if path}
    <PartToolbar {path} {dependencies} {referencedBy} on:selectPath on:revealPath>
      {#if !readOnly}
        <button
          type="button"
          class="shrink-0 h-7 w-7 box-border p-0 inline-flex items-center justify-center"
          title="Format"
          aria-label="Format"
          on:click={formatXml}
        >
          <span class="i-tabler-code w-4 h-4" aria-hidden="true"></span>
        </button>
      {/if}
    </PartToolbar>
    <div
      class="flex-1 min-h-0 min-w-0 overflow-hidden font-mono text-text-primary codemirror-wrapper"
      bind:this={editorContainer}
      data-path={path}
    ></div>
        {#if !readOnly && (hasChanges || xmlIssue)}
        <div class="diff-status-bar" role="group" aria-label="Editor status">
          <div class="status-actions">
          {#if hasChanges}
          <button
            type="button"
            class="toolbar-utility inline-diff-toggle shrink-0 h-7 px-2 py-0 inline-flex items-center gap-1.5"
            aria-label="Show inline diff"
            aria-pressed={$inlineDiffEnabled}
            title={$inlineDiffEnabled ? 'Hide inline diff' : 'Show inline diff'}
            on:click={() => setInlineDiffEnabled(!$inlineDiffEnabled)}
          >
            <span class="i-tabler-git-compare w-3.5 h-3.5" aria-hidden="true"></span>
            Diff
          </button>
          {/if}
          {#if xmlIssue}
            <button type="button" class="toolbar-utility xml-error h-7 px-2 py-0" title={xmlIssue.message} aria-label="Locate XML error" on:click={revealXmlIssue}>
              Invalid XML{xmlIssue.line ? ` · Ln ${xmlIssue.line}${xmlIssue.column ? `:${xmlIssue.column}` : ''}` : ''}
            </button>
          {/if}
          </div>
          <div class="status-actions">
          {#if hasChanges && $inlineDiffEnabled && changeCount > 0}
            <div class="change-navigation" role="group" aria-label="Change navigation">
              <span class="change-position" aria-live="polite" title={`${changeCount} changed blocks in this file`}>
                {activeChange >= 0 ? `Change ${activeChange + 1} of ${changeCount}` : `Changes · ${changeCount}`}
              </span>
              <button type="button" class="toolbar-utility h-7 w-7 p-0 inline-flex items-center justify-center" title="Previous change" aria-label="Previous change" on:click={() => goToChange(-1)}>
                <span class="i-tabler-arrow-up w-3.5 h-3.5" aria-hidden="true"></span>
              </button>
              <button type="button" class="toolbar-utility h-7 w-7 p-0 inline-flex items-center justify-center" title="Next change" aria-label="Next change" on:click={() => goToChange(1)}>
                <span class="i-tabler-arrow-down w-3.5 h-3.5" aria-hidden="true"></span>
              </button>
            </div>
          {/if}
          {#if hasChanges}
            <button type="button" class="toolbar-utility h-7 w-7 p-0 inline-flex items-center justify-center" title="Revert current file" aria-label="Revert current file" on:click={() => { showRevertFile = true; }}>
              <span class="i-tabler-arrow-back-up w-3.5 h-3.5" aria-hidden="true"></span>
            </button>
          {/if}
          </div>
        </div>
        {/if}
  {:else}
    <EmptyFileState />
  {/if}
</div>

{#if showRevertFile}
  <DiscardChangesDialog
    title="Revert current file?"
    description={`Restore ${path} to its last export baseline? Other files are unaffected. You can undo this with Cmd/Ctrl + Z.`}
    confirmLabel="Revert file"
    onResolve={resolveRevertFile}
  />
{/if}

<style>
  .status-actions { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .xml-error { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(#app main button.xml-error) { color: #a33d32 !important; }

  .diff-status-bar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 28px;
    box-sizing: border-box;
    padding: 0 8px;
    border-top: 1px solid var(--color-border-base);
    background: var(--color-bg-secondary);
    font-size: 11px;
  }
  .change-navigation {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 2px;
    height: 28px;
  }
  .change-position {
    padding: 0 4px;
    color: var(--color-text-secondary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .codemirror-wrapper :global(.cm-editor) {
    height: 100%;
    min-height: 100%;
    width: 100%;
  }
  .codemirror-wrapper :global(.cm-scroller) {
    height: 100%;
    min-height: 100%;
    overflow-x: hidden !important;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--color-scrollbar-thumb) var(--color-scrollbar-track);
  }
  .codemirror-wrapper :global(.cm-scroller)::-webkit-scrollbar {
    width: 8px;
    display: block;
  }
  .codemirror-wrapper :global(.cm-scroller)::-webkit-scrollbar-track {
    background: var(--color-scrollbar-track);
  }
  .codemirror-wrapper :global(.cm-scroller)::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 4px;
  }
  .codemirror-wrapper :global(.cm-scroller)::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }
</style>
