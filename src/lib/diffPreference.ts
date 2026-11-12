import { writable } from 'svelte/store';

const STORAGE_KEY = 'ooxml-viewer-inline-diff';

function loadPreference(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'false' ? false : true;
  } catch {
    // Storage may be disabled; retain the preference in memory for this session.
    return true;
  }
}

export const inlineDiffEnabled = writable(loadPreference());

export function setInlineDiffEnabled(enabled: boolean): void {
  inlineDiffEnabled.set(enabled);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The shared store still preserves the choice when navigating between files.
  }
}
