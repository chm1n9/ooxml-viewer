/**
 * Parse OOXML .rels files and build a directed graph of part dependencies.
 * Rels path convention: part "ppt/slides/slide1.xml" has rels "ppt/slides/_rels/slide1.xml.rels".
 * Root package rels: "_rels/.rels" (no single owner part).
 */

export interface RelsEdge {
  from: string;
  to: string;
  type: string;
  typeUri: string;
}

export interface RelsGraph {
  nodes: Set<string>;
  edges: RelsEdge[];
}

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PACKAGE_ROOT = '[Package]';

/** Get .rels path for a part. e.g. "docProps/app.xml" -> "docProps/_rels/app.xml.rels" */
export function getPartRelsPath(partPath: string): string {
  const normalized = partPath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
  const base = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  return dir ? `${dir}/_rels/${base}.rels` : `_rels/${base}.rels`;
}

/** Get owner part path from rels path. e.g. "ppt/slides/_rels/slide1.xml.rels" -> "ppt/slides/slide1.xml" */
export function ownerPartFromRelsPath(relsPath: string): string {
  const parts = relsPath.split('/');
  const relsFile = parts.pop();
  const dir = parts.pop();
  if (dir !== '_rels' || !relsFile?.endsWith('.rels')) return relsPath;
  const ownerDir = parts.join('/');
  const ownerName = relsFile.slice(0, -'.rels'.length);
  return ownerDir ? `${ownerDir}/${ownerName}` : ownerName;
}

/** Resolve Target: OOXML targets are relative to the parent of the _rels folder (owner part dir), not inside _rels. */
export function resolveTarget(relsPath: string, target: string): string {
  const targetTrimmed = target.split('?')[0].trim();
  const baseDir =
    relsPath === '_rels/.rels' ? '' : relsPath.replace(/\/_rels\/[^/]+$/, '');
  const combined = baseDir ? `${baseDir}/${targetTrimmed}` : targetTrimmed;
  const segments = combined.split('/');
  const out: string[] = [];
  for (const s of segments) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
}

/** Shorten relationship type URI to last segment for display. */
function shortType(typeUri: string): string {
  const s = typeUri.split('/').pop() ?? typeUri;
  return s || 'relationship';
}

/** Parse .rels XML content and return { id, type, target }[]. */
function parseRelsXml(xml: string): { id: string; type: string; target: string }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const list: { id: string; type: string; target: string }[] = [];
  const rels = doc.getElementsByTagNameNS(RELS_NS, 'Relationship');
  for (let i = 0; i < rels.length; i++) {
    const r = rels[i];
    const id = r.getAttribute('Id');
    const type = r.getAttribute('Type');
    const target = r.getAttribute('Target');
    if (id && type && target) list.push({ id, type, target });
  }
  if (list.length === 0) {
    const fallback = doc.getElementsByTagName('Relationship');
    for (let i = 0; i < fallback.length; i++) {
      const r = fallback[i];
      const id = r.getAttribute('Id');
      const type = r.getAttribute('Type');
      const target = r.getAttribute('Target');
      if (id && type && target) list.push({ id, type, target });
    }
  }
  return list;
}

/** Build dependency graph from entries (must include all .rels and parts). */
export function buildRelsGraph(entries: { path: string; content: string }[]): RelsGraph {
  const nodes = new Set<string>();
  const edges: RelsEdge[] = [];

  const relsEntries = entries.filter((e) => e.path.replace(/\\/g, '/').endsWith('.rels'));
  for (const entry of relsEntries) {
    const relsPath = entry.path.replace(/\\/g, '/');
    const owner = relsPath === '_rels/.rels' ? PACKAGE_ROOT : ownerPartFromRelsPath(relsPath);
    nodes.add(owner);
    const list = parseRelsXml(entry.content);
    for (const { type, target } of list) {
      const toPath = resolveTarget(relsPath, target);
      nodes.add(toPath);
      edges.push({
        from: owner,
        to: toPath,
        type: shortType(type),
        typeUri: type,
      });
    }
  }

  return { nodes, edges };
}

/** Get display label for a node (short name). */
export function nodeLabel(path: string): string {
  if (path === PACKAGE_ROOT) return PACKAGE_ROOT;
  const name = path.split('/').pop() ?? path;
  return name.length > 36 ? name.slice(0, 33) + '…' : name;
}

/** Get list of part paths that the given part depends on (targets of its .rels), excluding .rels files. */
export function getDependenciesForPart(
  partPath: string,
  entries: { path: string; content: string }[]
): string[] {
  const relsPath = getPartRelsPath(partPath);
  const normalized = partPath.replace(/\\/g, '/');
  const entry = entries.find((e) => e.path.replace(/\\/g, '/') === relsPath);
  if (!entry) return [];
  const list = parseRelsXml(entry.content);
  const out: string[] = [];
  for (const { target } of list) {
    const resolved = resolveTarget(relsPath, target);
    if (!resolved.toLowerCase().endsWith('.rels')) out.push(resolved);
  }
  return out;
}
