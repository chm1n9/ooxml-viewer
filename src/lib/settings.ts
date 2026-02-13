/** LocalStorage key for all viewer settings (single JSON object). */
export const SETTINGS_STORAGE_KEY = 'ooxml-viewer-settings';

export interface ViewerSettings {
  /** Comma-separated tag names to auto-fold when opening a file (e.g. "w:p, w:t"). */
  autoCollapseTags: string;
}

const DEFAULT_SETTINGS: ViewerSettings = {
  autoCollapseTags: '',
};

function loadRaw(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SETTINGS_STORAGE_KEY);
}

/** Load settings from localStorage. Missing keys use defaults. */
export function loadSettings(): ViewerSettings {
  const raw = loadRaw();
  if (raw == null) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<ViewerSettings>;
    return {
      autoCollapseTags: typeof parsed.autoCollapseTags === 'string' ? parsed.autoCollapseTags : DEFAULT_SETTINGS.autoCollapseTags,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist full settings to localStorage. */
export function saveSettings(settings: ViewerSettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** Parse comma-separated auto-collapse tags into trimmed non-empty array. */
export function parseAutoCollapseTags(value: string): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
