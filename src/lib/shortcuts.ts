import { writable } from 'svelte/store';

export type SearchMode = 'currentFile' | 'global';

export interface SearchState {
  open: boolean;
  mode: SearchMode;
  query: string;
}

const initialState: SearchState = {
  open: false,
  mode: 'currentFile',
  query: '',
};

export const searchStore = writable<SearchState>(initialState);

const MOD = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control';

export function initShortcuts(): () => void {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      searchStore.update((s) => ({
        ...s,
        open: true,
        query: s.open ? s.query : '',
      }));
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

export function setSearchMode(mode: SearchMode): void {
  searchStore.update((s) => ({ ...s, mode }));
}

export function setSearchQuery(query: string): void {
  searchStore.update((s) => ({ ...s, query }));
}

export function closeSearch(): void {
  searchStore.update((s) => ({ ...s, open: false }));
}

export function toggleSearchMode(): void {
  searchStore.update((s) => ({
    ...s,
    mode: s.mode === 'currentFile' ? 'global' : 'currentFile',
  }));
}

export { MOD };
