import type JSZip from 'jszip';
import { writable } from 'svelte/store';
import { fileVersion, watchSourceFile, type SourceFileHandle, type SourceWatchState } from './sourceFile.ts';
import { snapshotSource, readSourceComparison, type SourceSnapshot, type SourceChange } from './sourceChanges.ts';

export interface SourceSessionState {
  status: SourceWatchState | 'unsupported';
  pending: File | null;
  baseline: JSZip | null;
  latest: JSZip | null;
  changes: SourceChange[];
  checking: boolean;
  busy: boolean;
  error: string;
  notice: string;
}
const emptyState = (): SourceSessionState => ({ status: 'unsupported', pending: null, baseline: null, latest: null, changes: [], checking: false, busy: false, error: '', notice: '' });

/** Owns disk snapshots and async lifetimes. UI confirmation and applying edits stay with the caller. */
export function createSourceSession(deps = { watch: watchSourceFile, snapshot: snapshotSource, compare: readSourceComparison }) {
  let state = emptyState();
  const store = writable(state);
  let generation = 0;
  let request = 0;
  let handle: SourceFileHandle | undefined;
  let version = '';
  let baselineSnapshot: SourceSnapshot | null = null;
  let unwatch: (() => void) | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const patch = (value: Partial<SourceSessionState>) => { state = { ...state, ...value }; store.set(state); };

  function notify(notice: string) {
    clearTimeout(noticeTimer);
    patch({ notice });
    noticeTimer = setTimeout(() => patch({ notice: '' }), 4000);
  }

  function stop() {
    generation++;
    request++;
    unwatch?.();
    unwatch = undefined;
    handle = undefined;
    baselineSnapshot = null;
    version = '';
    clearTimeout(noticeTimer);
    state = emptyState();
    store.set(state);
  }

  async function inspect(file: File, session: number): Promise<boolean> {
    const baseline = state.baseline;
    if (!baseline || session !== generation) return false;
    const read = ++request;
    const current = () => session === generation && baseline === state.baseline && read === request;
    clearTimeout(noticeTimer);
    patch({ pending: file, checking: true, error: '', notice: '' });
    try {
      const snapshot = baselineSnapshot ?? await deps.snapshot(baseline);
      if (!current()) return false;
      baselineSnapshot = snapshot;
      const result = await deps.compare(snapshot, file);
      if (!current()) return false;
      patch({ latest: result.zip, changes: result.changes, pending: result.changes.length ? file : null });
      if (!result.changes.length) version = fileVersion(file);
      return true;
    } catch {
      if (current()) patch({ error: 'Unable to read the updated source. It may still be saving.' });
      return false;
    } finally {
      if (current()) patch({ checking: false });
    }
  }

  function start(file: File, baseline: JSZip, sourceHandle?: SourceFileHandle) {
    stop();
    handle = sourceHandle;
    version = fileVersion(file);
    patch({ baseline });
    const session = generation;
    if (handle) unwatch = deps.watch(handle, file, changed => {
      if (session !== generation) return Promise.resolve(false);
      return fileVersion(changed) === version ? Promise.resolve(true) : inspect(changed, session);
    }, status => { if (session === generation) patch({ status }); });
  }

  async function retry() {
    if (!state.pending || state.checking || state.busy) return;
    const session = generation;
    const pending = state.pending;
    patch({ checking: true });
    try {
      const file = handle ? await handle.getFile() : pending;
      if (session === generation) await inspect(file, session);
    } catch {
      if (session === generation) patch({ checking: false, error: 'Source is unavailable. Try again shortly.' });
    }
  }

  /** The apply callback must check isCurrent immediately before replacing UI content. */
  async function reload(apply: (file: File, isCurrent: () => boolean) => Promise<JSZip | null>) {
    if (!state.pending || state.busy) return;
    const pending = state.pending;
    const session = generation;
    const current = () => session === generation;
    patch({ busy: true });
    try {
      const file = handle ? await handle.getFile() : pending;
      if (!current()) return;
      const baseline = await apply(file, current);
      if (!current()) return;
      if (!baseline) { notify('Unable to reload right now. Your edits are preserved; try again shortly.'); return; }
      const newer = state.pending && state.pending !== pending && fileVersion(state.pending) !== fileVersion(file) ? state.pending : null;
      request++;
      baselineSnapshot = null;
      version = fileVersion(file);
      patch({ baseline, latest: null, pending: newer, changes: [], checking: false, error: '' });
      if (newer) await inspect(newer, session);
      else notify('Source file reloaded.');
    } catch {
      if (current()) notify('Source is unavailable. Your edits are preserved; try again shortly.');
    } finally {
      if (current()) patch({ busy: false });
    }
  }

  return { subscribe: store.subscribe, start, stop, retry, reload };
}
