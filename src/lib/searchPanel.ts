import { EditorState } from '@codemirror/state';
import { type EditorView, type Panel, type ViewUpdate, runScopeHandlers } from '@codemirror/view';
import { SearchQuery, getSearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll, closeSearchPanel } from '@codemirror/search';
import { collectSearchResults, searchResultLabel, type SearchResults } from './searchResults.ts';
import type { EditorSearchSession } from './editorSearch';

/** Custom presentation over CodeMirror's query/commands, shared by editable and read-only views. */
export function createSearchPanel(view: EditorView, session?: EditorSearchSession): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-search viewer-search';
  dom.setAttribute('role', 'search');
  dom.setAttribute('aria-label', 'Find in file');
  const row = document.createElement('div');
  row.className = 'viewer-search-row';
  dom.append(row);
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'search';
  input.className = 'cm-textfield';
  input.placeholder = 'Find in file…';
  input.setAttribute('aria-label', 'Find in file');
  input.setAttribute('main-field', 'true');
  input.autocomplete = 'off';
  input.spellcheck = false;
  const replaceInput = input.cloneNode() as HTMLInputElement;
  replaceInput.name = 'replace';
  replaceInput.placeholder = 'Replace with…';
  replaceInput.setAttribute('aria-label', 'Replace with');
  replaceInput.removeAttribute('main-field');
  const status = document.createElement('span');
  status.className = 'viewer-search-count';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const readOnly = view.state.facet(EditorState.readOnly);
  let query = getSearchQuery(view.state);
  let results: SearchResults = { ranges: [], truncated: false };
  let replaceOpen = session?.replaceOpen ?? false;

  function button(label: string, action: () => void, icon?: string) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'viewer-search-button';
    element.title = label;
    element.setAttribute('aria-label', label);
    if (icon) {
      const span = document.createElement('span');
      span.className = icon;
      span.setAttribute('aria-hidden','true');
      element.append(span);
    } else element.textContent = label;
    element.onclick = action;
    return element;
  }
  const replaceRow = document.createElement('div');
  replaceRow.className = 'viewer-search-row viewer-replace-row';
  const toggle = button('Toggle replace', () => {
    replaceOpen = !replaceOpen;
    syncReplace();
    if (replaceOpen) replaceInput.focus();
  }, 'i-tabler-layout-bottombar-expand');
  function syncReplace() {
    if (session) session.replaceOpen = replaceOpen;
    replaceRow.hidden = !replaceOpen;
    toggle.setAttribute('aria-expanded', String(replaceOpen));
    toggle.setAttribute('aria-pressed', String(replaceOpen));
    toggle.title = replaceOpen ? 'Hide replace' : 'Show replace';
    toggle.firstElementChild?.setAttribute('class', replaceOpen ? 'i-tabler-layout-bottombar-collapse' : 'i-tabler-layout-bottombar-expand');
  }
  const actions = document.createElement('div');
  actions.className = 'viewer-search-actions';
  const field = document.createElement('div');
  field.className = 'viewer-search-field';
  field.append(input);
  row.append(field, actions);
  if (!readOnly) actions.append(toggle);
  const previous = button('Previous match (Shift+Enter)', () => { findPrevious(view); }, 'i-tabler-chevron-left');
  const next = button('Next match (Enter)', () => { findNext(view); }, 'i-tabler-chevron-right');
  actions.append(previous, next, status);
  const options = [
    { key: 'caseSensitive', label: 'Match case', icon: 'i-tabler-letter-case' },
    { key: 'wholeWord', label: 'Whole word', icon: 'i-tabler-abc' },
    { key: 'regexp', label: 'Regular expression', icon: 'i-tabler-regex' },
  ] as const;
  const toggles = options.map(option => {
    const control = button(option.label, () => {
      commit({ [option.key]: !query[option.key] });
    }, option.icon);
    field.append(control);
    return control;
  });
  actions.append(button('Close search (Escape)', () => { closeSearchPanel(view); view.focus(); }, 'i-tabler-x'));
  const replace = button('Replace', () => { replaceNext(view); }, 'i-tabler-replace');
  const all = button('Replace all', () => { replaceAll(view); }, 'i-tabler-replace-filled');
  if (!readOnly) {
    const replaceActions = document.createElement('div');
    replaceActions.className = 'viewer-search-actions viewer-replace-actions';
    replaceActions.append(replace, all);
    const replaceField = document.createElement('div');
    replaceField.className = 'viewer-search-field';
    replaceField.append(replaceInput);
    replaceRow.append(replaceField, replaceActions);
    dom.append(replaceRow);
    syncReplace();
  }

  function commit(options: Partial<ConstructorParameters<typeof SearchQuery>[0]> = {}) {
    const next = new SearchQuery({ ...query, search: input.value, replace: replaceInput.value, ...options });
    if (!next.eq(query)) view.dispatch({ effects: setSearchQuery.of(next) });
  }
  input.oninput = () => commit();
  replaceInput.oninput = () => commit();
  dom.onkeydown = event => {
    if (event.isComposing) return;
    if (runScopeHandlers(view, event, 'search-panel')) event.preventDefault();
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.target === replaceInput) replaceNext(view);
      else (event.shiftKey ? findPrevious : findNext)(view);
    }
  };

  function sync(recount: boolean) {
    query = getSearchQuery(view.state);
    if (input.value !== query.search) input.value = query.search;
    if (replaceInput.value !== query.replace) replaceInput.value = query.replace;
    if (recount) results = collectSearchResults(view.state, query);
    const invalid = !!query.search && !query.valid;
    input.setAttribute('aria-invalid', String(invalid));
    field.classList.toggle('viewer-search-invalid', invalid);
    const label = invalid ? 'Invalid expression' : query.search ? searchResultLabel(results, view.state.selection.main) : '';
    if (status.textContent !== label) {
      status.textContent = label;
      status.title = label;
    }
    previous.disabled = next.disabled = replace.disabled = all.disabled = !results.ranges.length || invalid;
    options.forEach((option, i) => toggles[i].setAttribute('aria-pressed', String(query[option.key])));
  }
  sync(true);
  return {
    dom,
    update(update: ViewUpdate) {
      const next = getSearchQuery(update.state);
      const changed = next.search !== query.search || next.caseSensitive !== query.caseSensitive || next.wholeWord !== query.wholeWord || next.regexp !== query.regexp || next.literal !== query.literal;
      if (update.docChanged || update.selectionSet || !query.eq(next)) sync(update.docChanged || changed);
    },
  };
}
