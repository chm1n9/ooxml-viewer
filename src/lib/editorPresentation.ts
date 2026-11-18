import { createSearchPanel } from './searchPanel';
import type { EditorSearchSession } from './editorSearch';
import { EditorView, lineNumbers } from '@codemirror/view';
import { xml } from '@codemirror/lang-xml';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { search, getSearchQuery, setSearchQuery, searchPanelOpen, openSearchPanel } from '@codemirror/search';

/** Shared presentation only: edit history, validation and diff lifetimes remain in their owning views. */
const editorTheme = EditorView.theme({
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
  '.viewer-search': { display: 'grid', gridTemplateColumns: 'minmax(50px, 1fr) auto', columnGap: '4px', rowGap: '4px', padding: '6px 8px', backgroundColor: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-border-base)', fontFamily: 'inherit', fontSize: '12px' },
  '.viewer-search-row': { display: 'contents' },
  '.viewer-search-actions': { gridColumn: '2', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' },
  '.viewer-search-row[hidden]': { display: 'none' },
  '.viewer-search-field': { gridColumn: '1', display: 'flex', alignItems: 'center', minWidth: '0', height: '30px', padding: '0 3px', boxSizing: 'border-box', border: '1px solid var(--color-border-base)', borderRadius: '5px', background: 'var(--color-bg-white)' },
  '.viewer-search-field:focus-within': { borderColor: 'var(--color-primary)' },
  '.viewer-search-field.viewer-search-invalid': { borderColor: '#a33d32' },
  '.viewer-search .cm-textfield': { flex: '1', margin: '0', minWidth: '0', width: '100%', height: '28px', boxSizing: 'border-box', padding: '3px 5px', border: '0', borderRadius: '0', background: 'transparent', outline: 'none', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '12px' },
  '.viewer-search .cm-textfield:focus': { outline: 'none' },
  '.viewer-replace-actions': { justifyContent: 'flex-start' },
  '.viewer-search-count': { flex: '0 0 14ch', width: '14ch', minWidth: '14ch', maxWidth: '14ch', textAlign: 'center', color: 'var(--color-text-secondary)', fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.viewer-search-button': { margin: '0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', minWidth: '24px', height: '26px', padding: '0 4px', background: 'transparent', border: '1px solid transparent', borderRadius: '4px', color: 'var(--color-text-secondary)', fontFamily: 'inherit', fontSize: '11px', cursor: 'pointer' },
  '.viewer-search-button span': { display: 'inline-block', width: '14px', height: '14px' },
  '.viewer-search-button:hover': { background: 'var(--color-bg-hover)' },
  '.viewer-search-button[aria-pressed="true"]': { background: 'transparent', color: 'var(--color-primary)' },
  '.viewer-search-button[aria-pressed="true"]:hover': { background: 'var(--color-bg-hover)' },
  '.viewer-search-button:focus-visible': { outline: '2px solid var(--color-primary)', outlineOffset: '-2px' },
  '@media (max-width: 600px)': { '.viewer-search-actions': { flexWrap: 'wrap', maxWidth: '180px' } },
  '.cm-searchMatch': {
    backgroundColor: '#ffe4a3',
    color: '#302719',
    borderRadius: '2px',
    boxShadow: 'inset 0 0 0 1px #d6ad50',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#f4b85c',
    color: '#241b10',
    boxShadow: 'inset 0 0 0 1px #a45c40',
    outline: '1px solid #a45c40',
    outlineOffset: '0',
  },
});

export function editorPresentation(session?: EditorSearchSession) {
  return [xml(), lineNumbers(), syntaxHighlighting(defaultHighlightStyle), search({ createPanel: view => createSearchPanel(view, session) }), EditorView.lineWrapping, editorTheme];
}

export interface EditorPosition { top: number; left: number; anchor: number; head: number }

export function capturePosition(view: EditorView): EditorPosition {
  const { anchor, head } = view.state.selection.main;
  return { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft, anchor, head };
}

export function restorePosition(view: EditorView, position: EditorPosition, isCurrent: () => boolean) {
  view.dispatch({ selection: { anchor: Math.min(position.anchor, view.state.doc.length), head: Math.min(position.head, view.state.doc.length) } });
  requestAnimationFrame(() => {
    if (!isCurrent()) return;
    view.scrollDOM.scrollTop = position.top;
    view.scrollDOM.scrollLeft = position.left;
  });
}

export function captureReadingState(view: EditorView) {
  return { ...capturePosition(view), query: getSearchQuery(view.state), searchOpen: searchPanelOpen(view.state), focused: view.hasFocus };
}

export function restoreReadingState(view: EditorView, position: ReturnType<typeof captureReadingState>, isCurrent: () => boolean) {
  view.dispatch({ effects: setSearchQuery.of(position.query) });
  if (position.searchOpen) openSearchPanel(view);
  if (position.focused) view.focus();
  restorePosition(view, position, isCurrent);
}
