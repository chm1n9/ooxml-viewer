import { get, writable } from 'svelte/store';

/** Set by XmlEditor when mounted; Ctrl+F calls this to open CodeMirror search panel. */
export const openSearchStore = writable<(() => void) | null>(null);

interface ShortcutOptions {
  hasFile?: () => boolean;
  isModalOpen?: () => boolean;
  onSave?: () => void;
}

export function initShortcuts(options: ShortcutOptions = {}): () => void {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      if (!options.hasFile?.()) return;
      e.preventDefault();
      if (e.repeat || options.isModalOpen?.()) return;
      options.onSave?.();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      if (options.isModalOpen?.()) return;
      e.preventDefault();
      get(openSearchStore)?.();
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
