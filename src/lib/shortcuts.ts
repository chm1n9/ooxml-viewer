import { get, writable } from 'svelte/store';

/** Set by XmlEditor when mounted; Ctrl+F calls this to open CodeMirror search panel. */
export const openSearchStore = writable<(() => void) | null>(null);

export function initShortcuts(): () => void {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      get(openSearchStore)?.();
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
