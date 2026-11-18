import JSZip from 'jszip';
import { isTextPart, decodePart } from './partContent.ts';

export type SourceSnapshot = Map<string, string>;
export interface SourceChange { path: string; kind: 'modified' | 'added' | 'removed' }
export interface SourcePreviewChange { path: string; kind: SourceChange['kind'] | 'unchanged' }

/** Keep the preview on the same part even when a later save restores or removes an addition. */
export function sourcePreviewChange(path: string, changes: SourceChange[]): SourcePreviewChange {
  return changes.find(change => change.path === path) ?? { path, kind: 'unchanged' };
}

/** Prefer the part being previewed, then the existing editor part if it survives. */
export function sourceReloadPath(paths: Iterable<string>, editorPath: string | null, previewPath: string | null): string | null {
  const existing = new Set(paths);
  if (previewPath && existing.has(previewPath)) return previewPath;
  return editorPath && existing.has(editorPath) ? editorPath : null;
}

/** Hash decompressed bytes, ignoring ZIP order, compression and timestamps. */
export async function snapshotSource(zip: JSZip): Promise<SourceSnapshot> {
  const snapshot: SourceSnapshot = new Map();
  // Process sequentially to avoid holding every decompressed file in memory at once.
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const bytes = await entry.async('arraybuffer');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    snapshot.set(path, Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''));
  }
  return snapshot;
}

export function compareSourceSnapshots(before: SourceSnapshot, after: SourceSnapshot): SourceChange[] {
  const changes: SourceChange[] = [];
  for (const [path, digest] of after) {
    if (!before.has(path)) changes.push({ path, kind: 'added' });
    else if (before.get(path) !== digest) changes.push({ path, kind: 'modified' });
  }
  for (const path of before.keys()) if (!after.has(path)) changes.push({ path, kind: 'removed' });
  return changes.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export async function compareSourceFile(baseline: SourceSnapshot, file: File): Promise<SourceChange[]> {
  return (await readSourceComparison(baseline, file)).changes;
}

export async function readSourceComparison(baseline: SourceSnapshot, file: File): Promise<{ zip: JSZip; changes: SourceChange[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
  return { zip, changes: compareSourceSnapshots(baseline, await snapshotSource(zip)) };
}

export async function readSourceDiff(before: JSZip, after: JSZip, change: SourcePreviewChange) {
  const oldPart = before.file(change.path);
  const newPart = after.file(change.path);
  if (change.kind !== 'unchanged' && ((change.kind !== 'added' && !oldPart) || (change.kind !== 'removed' && !newPart)
    || (change.kind === 'added' && oldPart) || (change.kind === 'removed' && newPart))) {
    throw new Error('Source comparison is unavailable.');
  }
  const [oldBytes, newBytes] = await Promise.all([
    oldPart ? oldPart.async('uint8array') : Promise.resolve(new Uint8Array()),
    newPart ? newPart.async('uint8array') : Promise.resolve(new Uint8Array()),
  ]);
  const binary = !isTextPart(change.path);
  return {
    binary,
    before: binary ? '' : decodePart(oldBytes),
    after: binary ? '' : decodePart(newBytes),
    beforeBytes: oldBytes.length,
    afterBytes: newBytes.length,
  };
}
