/**
 * History API route: pathname = base + 'f/' + path (path keeps literal /). File name is not in URL.
 * When no match, use initial file (first entry).
 */

const ROUTE_PREFIX = 'f/';

function getBase(): string {
  const raw = (import.meta.env.BASE_URL ?? '/').replace(/\/*$/, '') || '';
  return raw ? (raw.endsWith('/') ? raw : raw + '/') : '/';
}

/** Parse current location.pathname into { path } or null if not a file route. Path is normalized (no leading/trailing slash). */
export function getRoute(): { path: string } | null {
  const base = getBase();
  const pathname = location.pathname;
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length);
  if (!rest.startsWith(ROUTE_PREFIX)) return null;
  const raw = rest.slice(ROUTE_PREFIX.length);
  const path = raw.replace(/^\/+|\/+$/g, '');
  return path || null;
}

/** Build pathname for part path. */
export function buildPathname(path: string): string {
  const base = getBase();
  return base + ROUTE_PREFIX + path;
}

const HISTORY_STATE_KEY = 'path';

/** Push state and update URL (for tree/dependency click). State holds path for reliable back/forward. */
export function pushRoute(path: string): void {
  const pathname = buildPathname(path);
  if (location.pathname !== pathname) history.pushState({ [HISTORY_STATE_KEY]: path }, '', pathname);
}

/** Replace state and URL (for new file open or initial load). */
export function replaceRoute(path: string): void {
  const pathname = buildPathname(path);
  if (location.pathname !== pathname) history.replaceState({ [HISTORY_STATE_KEY]: path }, '', pathname);
}

/** Get path from current history state (for popstate). */
export function getPathFromState(state: unknown): string | null {
  if (state && typeof state === 'object' && HISTORY_STATE_KEY in state) {
    const v = (state as Record<string, unknown>)[HISTORY_STATE_KEY];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

/** Replace to base only (no file). */
export function replaceToBase(): void {
  const base = getBase();
  if (location.pathname !== base && location.pathname !== base.replace(/\/$/, '')) {
    history.replaceState(null, '', base);
  }
}
