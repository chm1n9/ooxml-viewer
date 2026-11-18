import type { FileEntry } from './ooxml';
import { getPartRelsPath, ownerPartFromRelsPath, relationshipTargetsForRels } from './relsGraph.ts';

/** Package structure is fixed during editing; only an edited .rels part invalidates its edges. */
export function createPackageIndex(entries: FileEntry[], parse = relationshipTargetsForRels) {
  const paths = new Set(entries.map(entry => entry.path));
  const treeEntries = entries.map(({ path, isBinary }) => ({ path, isBinary, content: '' }));
  const references = new Map<string, Set<string>>();
  const referencedBy = new Map<string, Set<string>>();
  const byRels = new Map<string, Map<string, string>>();
  const contents = new Map<string, string>();
  const emptyTargets = new Map<string, string>();

  function update(path: string, content: string): boolean {
    if (!path.endsWith('.rels') || contents.get(path) === content) return false;
    const source = path === '_rels/.rels' ? path : ownerPartFromRelsPath(path);
    const targets = parse(path, content, paths);
    contents.set(path, content);
    byRels.set(path, targets);
    for (const target of references.get(source) ?? []) {
      const incoming = referencedBy.get(target);
      incoming?.delete(source);
      if (!incoming?.size) referencedBy.delete(target);
    }
    references.delete(source);
    if (paths.has(source)) {
      const outgoing = new Set(targets.values());
      if (outgoing.size) references.set(source, outgoing);
      for (const target of outgoing) {
        if (!referencedBy.has(target)) referencedBy.set(target, new Set());
        referencedBy.get(target)!.add(source);
      }
    }
    return true;
  }

  for (const entry of entries) update(entry.path, entry.content);
  return {
    paths, treeEntries, references, referencedBy, update,
    targetsFor(path: string) { return byRels.get(path.endsWith('.rels') ? path : getPartRelsPath(path)) ?? emptyTargets; },
  };
}
