/**
 * Parse OOXML .rels files and build a directed graph of part dependencies.
 * Rels path convention: part "ppt/slides/slide1.xml" has rels "ppt/slides/_rels/slide1.xml.rels".
 * Root package rels: "_rels/.rels" (no single owner part).
 */

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

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
    relsPath === '_rels/.rels' ? '' : relsPath.replace(/(?:^|\/)_rels\/[^/]+$/, '');
  const combined = targetTrimmed.startsWith('/') ? targetTrimmed : baseDir ? `${baseDir}/${targetTrimmed}` : targetTrimmed;
  const segments = combined.split('/');
  const out: string[] = [];
  for (const s of segments) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
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
    if (id && type && target && r.getAttribute('TargetMode') !== 'External' && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(target.trim())) list.push({ id, type, target });
  }
  if (list.length === 0) {
    const fallback = doc.getElementsByTagName('Relationship');
    for (let i = 0; i < fallback.length; i++) {
      const r = fallback[i];
      const id = r.getAttribute('Id');
      const type = r.getAttribute('Type');
      const target = r.getAttribute('Target');
      if (id && type && target && r.getAttribute('TargetMode') !== 'External' && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(target.trim())) list.push({ id, type, target });
    }
  }
  return list;
}

/** Resolve one relationship part against the current package paths. */
export function relationshipTargetsForRels(relsPath: string, content: string, existing: Set<string>): Map<string, string> {
  const targets = new Map<string, string>();
  for (const relationship of parseRelsXml(content)) {
    const target = resolveTarget(relsPath, relationship.target);
    if (existing.has(target)) targets.set(relationship.id, target);
  }
  return targets;
}
