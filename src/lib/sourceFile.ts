import { ACCEPT_OFFICE_EXTENSIONS } from './constants';

export interface SourceFileHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
}
export interface OpenedSource { file: File; handle?: SourceFileHandle }
interface FilePickerWindow {
  showOpenFilePicker?: (options: { multiple: boolean; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SourceFileHandle[]>;
}

export async function pickSourceFile(): Promise<OpenedSource | null | undefined> {
  const picker = (window as unknown as FilePickerWindow).showOpenFilePicker;
  if (!picker) return undefined; // Use the ordinary file input.
  try {
    const [handle] = await picker.call(window, {
      multiple: false,
      types: [{ description: 'Office Open XML files', accept: { 'application/octet-stream': ACCEPT_OFFICE_EXTENSIONS } }],
    });
    if (!handle || handle.kind !== 'file') return null;
    return { file: await handle.getFile(), handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    // Embedded browsers may expose the picker while blocking access to it.
    return undefined;
  }
}

/** Call synchronously in the drop handler, before DataTransfer access expires. */
export async function droppedSource(data: DataTransfer): Promise<OpenedSource | null> {
  const file = data.files[0];
  const item = Array.from(data.items).find(item => item.kind === 'file') as
    (DataTransferItem & { getAsFileSystemHandle?: () => Promise<SourceFileHandle | { kind: 'directory' } | null> }) | undefined;
  try {
    const handle = await item?.getAsFileSystemHandle?.();
    if (handle?.kind === 'file') return { file: await handle.getFile(), handle };
  } catch {
    // Ordinary drag-and-drop still works when handle access is unsupported.
  }
  return file ? { file } : null;
}

export type SourceWatchState = 'watching' | 'retrying' | 'unavailable';
export function fileVersion(file: File): string { return `${file.lastModified}:${file.size}`; }

interface SourceObserver {
  observe(handle: SourceFileHandle): Promise<void>;
  disconnect(): void;
}
type SourceObserverConstructor = new (callback: (records: readonly { type: string }[]) => void) => SourceObserver;

/** Prefer native events; poll only as a fallback or briefly to confirm a changed file. */
export function watchSourceFile(
  handle: SourceFileHandle,
  initial: File,
  changed: (file: File) => Promise<boolean>,
  status: (state: SourceWatchState) => void,
  interval = 1500,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: SourceObserver | null = null;
  let polling = true;
  let reading = false;
  let queued = false;
  let accepted = fileVersion(initial);
  let candidate: string | null = null;

  function disconnect() {
    const previous = observer;
    observer = null;
    try { previous?.disconnect(); } catch { /* Polling remains available. */ }
  }

  function schedule(delay: number) {
    if (stopped) return;
    if (reading) { queued = true; return; }
    clearTimeout(timer);
    timer = setTimeout(() => { void check(); }, delay);
  }

  function fallBackToPolling() {
    if (stopped) return;
    disconnect();
    polling = true;
    schedule(interval);
  }

  async function check() {
    if (stopped || reading) return;
    reading = true;
    queued = false;
    let confirm = false;
    try {
      const file = await handle.getFile();
      if (stopped) return;
      const version = fileVersion(file);
      if (version === accepted) { candidate = null; status('watching'); }
      else if (candidate !== version) { candidate = version; confirm = true; }
      else if (await changed(file)) {
        if (stopped) return;
        accepted = version;
        candidate = null;
        status('watching');
      } else if (!stopped) { status('retrying'); confirm = true; }
    } catch (error) {
      if (stopped) return;
      if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) {
        stopped = true;
        disconnect();
        clearTimeout(timer);
        status('unavailable');
      } else {
        status('retrying');
        fallBackToPolling(); // Office may temporarily replace or lock the file.
      }
    } finally {
      reading = false;
      if (!stopped && (polling || confirm || queued)) schedule(polling ? interval : Math.min(interval, 350));
    }
  }

  status('watching');
  schedule(interval);
  const Observer = (globalThis as unknown as { FileSystemObserver?: SourceObserverConstructor }).FileSystemObserver;
  if (typeof Observer === 'function') {
    try {
      const nativeObserver = new Observer(records => {
        if (stopped) return;
        if (records.some(record => record.type === 'errored' || record.type === 'disappeared')) {
          fallBackToPolling();
        } else if (records.length) schedule(Math.min(interval, 150));
      });
      observer = nativeObserver;
      void nativeObserver.observe(handle).then(() => {
        if (stopped || observer !== nativeObserver) {
          try { nativeObserver.disconnect(); } catch { /* Already closed. */ }
          return;
        }
        polling = false;
        // Cover changes between acquiring the initial file and establishing observation.
        schedule(0);
      }).catch(() => {
        if (!stopped && observer === nativeObserver) fallBackToPolling();
      });
    } catch {
      fallBackToPolling();
    }
  }
  return () => { stopped = true; clearTimeout(timer); disconnect(); };
}
