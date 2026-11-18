/** File routes describe the visible package part and optional source-comparison mode. */
const ROUTE_PREFIX = 'f/';
export type FileView = 'editor' | 'source-diff';

function getBase(): string {
  const raw = (import.meta.env?.BASE_URL ?? '/').replace(/\/*$/, '') || '';
  return raw ? raw + '/' : '/';
}

export function getRoute(): { path: string; view: FileView } | null {
  const base = getBase();
  if (!location.pathname.startsWith(base)) return null;
  const rest = location.pathname.slice(base.length);
  if (!rest.startsWith(ROUTE_PREFIX)) return null;
  try {
    const path = rest.slice(ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent).join('/');
    if (!path || path.split('/').some(part => part === '.' || part === '..')) return null;
    return { path, view: new URLSearchParams(location.search).get('view') === 'source-diff' ? 'source-diff' : 'editor' };
  } catch {
    return null;
  }
}

export function buildPathname(path: string): string {
  return getBase() + ROUTE_PREFIX + path.split('/').map(encodeURIComponent).join('/');
}

function routeUrl(path: string, view: FileView): string {
  return buildPathname(path) + (view === 'source-diff' ? '?view=source-diff' : '');
}

/** Compare the full URL so a mode switch on the same file creates a history entry. */
export function pushRoute(path: string, view: FileView = 'editor'): void {
  const url = routeUrl(path, view);
  if (location.pathname + location.search + location.hash !== url) history.pushState({ path, view }, '', url);
}

export function replaceRoute(path: string, view: FileView = 'editor'): void {
  const url = routeUrl(path, view);
  history.replaceState({ path, view }, '', url);
}

export function pushToBase(): void {
  const base = getBase();
  if (location.pathname + location.search + location.hash !== base) history.pushState(null, '', base);
}

export function replaceToBase(): void {
  const base = getBase();
  if (location.pathname + location.search + location.hash !== base) history.replaceState(null, '', base);
}
