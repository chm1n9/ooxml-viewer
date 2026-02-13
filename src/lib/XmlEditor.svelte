<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { EditorView, lineNumbers, keymap, ViewPlugin } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import {
    syntaxHighlighting,
    defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentUnit,
    foldEffect,
    syntaxTree,
  } from '@codemirror/language';
  import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
  import { xml } from '@codemirror/lang-xml';
  import { searchStore } from './shortcuts';
  import format from 'xml-formatter';
  import Popover from './Popover.svelte';

  const dispatch = createEventDispatcher<{ contentChange: { value: string }; selectPath: { path: string } }>();

  const FORMAT_OPTIONS = { indentation: '  ', collapseContent: true };

  function formatContent(raw: string): string {
    try {
      return format(raw, FORMAT_OPTIONS);
    } catch {
      return raw;
    }
  }

  export let path: string | null = null;
  export let content: string = '';
  export let readOnly: boolean = false;
  export let dependencies: string[] = [];
  /** Tag names to auto-fold when opening a file (e.g. ['w:p', 'w:t']). */
  export let autoCollapseTags: string[] = [];

  const DEPENDS_INLINE_MAX = 3;
  let popoverVisible = false;
  let popoverHover = false;
  let hidePopoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let popoverAnchor: HTMLButtonElement | null = null;

  function showPopover() {
    if (hidePopoverTimeout) clearTimeout(hidePopoverTimeout);
    hidePopoverTimeout = null;
    popoverVisible = true;
  }
  function scheduleHidePopover() {
    if (popoverHover) return;
    hidePopoverTimeout = setTimeout(() => (popoverVisible = false), 300);
  }
  function onPopoverMouseEnter() {
    popoverHover = true;
    if (hidePopoverTimeout) clearTimeout(hidePopoverTimeout);
    hidePopoverTimeout = null;
  }
  function onPopoverMouseLeave() {
    popoverHover = false;
    scheduleHidePopover();
  }

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
            ? 'i-carbon-chevron-down'
            : 'i-carbon-chevron-right';
          return marker;
        },
      }),
      keymap.of([...foldKeymap, ...searchKeymap]),
      search(),
      xml(),
      syntaxHighlighting(defaultHighlightStyle),
      indentUnit.of('  '),
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
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
          // Carbon close icon SVG
          mask: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Cpath fill=\'currentColor\' d=\'M24 9.4L22.6 8L16 14.6L9.4 8L8 9.4l6.6 6.6L8 22.6L9.4 24l6.6-6.6l6.6 6.6l1.4-1.4l-6.6-6.6z\'/%3E%3C/svg%3E") center/contain no-repeat',
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
        '.cm-searchMatch': { backgroundColor: 'rgba(254, 134, 0, 0.2)' },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(254, 134, 0, 0.35)' },
      }),
    ];
    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });
    editorView = new EditorView({
      state,
      parent: editorContainer,
    });
    if (initialContent !== content) {
      dispatch('contentChange', { value: initialContent });
    }
  }

  $: if (
    $searchStore.open &&
    $searchStore.mode === 'currentFile' &&
    editorView
  ) {
    openSearchPanel(editorView);
  }

  onDestroy(() => {
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
    <div class="shrink-0 flex items-center gap-2 py-2 px-4 text-xs border-b border-border-base bg-bg-secondary">
      <span class="truncate shrink-0 text-text-secondary max-w-64" title={path}>{path}</span>
      <div class="flex-1 min-w-0 grid grid-flow-col auto-cols-max gap-1.5 overflow-hidden items-center">
        {#if dependencies.length > 0}
          <span class="text-text-secondary">Depends on:</span>
          {#each dependencies.slice(0, DEPENDS_INLINE_MAX) as dep}
            <button
              type="button"
              class="dep-btn px-1.5 py-0.5 rounded bg-bg-element text-text-primary truncate max-w-[140px] hover:bg-bg-hover"
              title={dep}
              on:click={() => dispatch('selectPath', { path: dep })}
            >
              {dep.split('/').pop() ?? dep}
            </button>
          {/each}
          {#if dependencies.length > DEPENDS_INLINE_MAX}
            <button
              bind:this={popoverAnchor}
              type="button"
              class="dep-btn px-1.5 py-0.5 rounded bg-bg-element text-text-primary hover:bg-bg-hover inline-flex items-center justify-center"
              title="Show all"
              on:mouseenter={showPopover}
              on:mouseleave={scheduleHidePopover}
            >
              <span class="i-carbon-overflow-menu-horizontal w-3.5 h-3.5" aria-hidden="true"></span>
            </button>
          {/if}
        {/if}
      </div>
      {#if !readOnly}
        <button
          type="button"
          class="shrink-0 py-1 px-2 text-sm"
          on:click={formatXml}
        >
          Format
        </button>
      {/if}
    </div>
    <div
      class="flex-1 min-h-0 min-w-0 overflow-hidden font-mono text-text-primary codemirror-wrapper"
      bind:this={editorContainer}
      data-path={path}
    ></div>
  {:else}
    <div class="flex-1 flex items-center justify-center text-text-secondary text-sm">
      Select file to view content
    </div>
  {/if}
</div>

<Popover
  visible={popoverVisible}
  anchor={popoverAnchor}
  on:mouseenter={onPopoverMouseEnter}
  on:mouseleave={onPopoverMouseLeave}
>
<div class="flex flex-col gap-2">
  {#each dependencies as dep}
    <button
      type="button"
      class="dep-btn block w-full text-left px-1.5 py-1 rounded bg-[#eeeee9] hover:bg-bg-hover text-text-primary truncate"
      title={dep}
      on:click={() => dispatch('selectPath', { path: dep })}
    >
      {dep}
    </button>
  {/each}
</div>
</Popover>

<style>
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
