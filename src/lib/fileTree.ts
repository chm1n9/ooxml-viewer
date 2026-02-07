import type { FileEntry } from './ooxml';

export interface TreeFile {
  type: 'file';
  name: string;
  path: string;
  isBinary: boolean;
}

export interface TreeFolder {
  type: 'folder';
  name: string;
  key: string;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeFolder;

export function nodeId(n: TreeNode): string {
  return n.type === 'file' ? n.path : n.key;
}

function naturalCompare(a: string, b: string): number {
  const regex = /(\d+)|(\D+)/g;
  const aParts: (string | number)[] = [];
  const bParts: (string | number)[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(a)) !== null) {
    aParts.push(match[1] ? parseInt(match[1], 10) : match[0]);
  }
  regex.lastIndex = 0;
  while ((match = regex.exec(b)) !== null) {
    bParts.push(match[1] ? parseInt(match[1], 10) : match[0]);
  }

  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;

    if (typeof aPart === 'number' && typeof bPart === 'number') {
      if (aPart !== bPart) return aPart - bPart;
    } else {
      const aStr = String(aPart);
      const bStr = String(bPart);
      const cmp = aStr.localeCompare(bStr, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return naturalCompare(a.name, b.name);
  });
  nodes.forEach((n) => {
    if (n.type === 'folder') sortNodes(n.children);
  });
}

export function buildFileTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const e of entries) {
    const parts = e.path.split('/');
    const fileName = parts.pop() ?? e.path;
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const key = parts.slice(0, i + 1).join('/');
      let folder = current.find(
        (n): n is TreeFolder => n.type === 'folder' && n.name === part
      );
      if (!folder) {
        folder = { type: 'folder', name: part, key, children: [] };
        current.push(folder);
      }
      current = folder.children;
    }

    current.push({
      type: 'file',
      name: fileName,
      path: e.path,
      isBinary: e.isBinary,
    });
  }

  sortNodes(root);
  return root;
}
