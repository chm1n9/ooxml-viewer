import JSZip from 'jszip';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|bmp|emf|wmf|tiff?|webp)$/i;

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
};

function isTextPath(name: string): boolean {
  return /\.(xml|rels)$/i.test(name);
}

export function isImagePath(name: string): boolean {
  return IMAGE_EXTENSIONS.test(name);
}

function imageMimeType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return IMAGE_MIME[ext] ?? 'application/octet-stream';
}

export interface FileEntry {
  path: string;
  content: string;
  isBinary: boolean;
  /** Object URL for image preview; only set when isBinary and isImagePath(path) */
  previewUrl?: string;
}

export async function loadOfficeFile(file: File): Promise<{
  entries: FileEntry[];
  zip: JSZip;
  fileName: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const fileName = file.name;
  const entries: FileEntry[] = [];

  for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const path = rawPath.replace(/\\/g, '/');
    const isBinary = !isTextPath(path);
    let content = '';
    if (!isBinary) {
      try {
        content = await zipEntry.async('string');
      } catch {
        content = '[Unable to decode as text]';
      }
    } else {
      content = '[Binary file]';
    }
    const entry: FileEntry = { path, content, isBinary };
    const isImage = isImagePath(path) || (isBinary && /\/media\//i.test(path));
    if (isImage) {
      try {
        const buf = await zipEntry.async('arraybuffer');
        const mime = isImagePath(path) ? imageMimeType(path) : 'application/octet-stream';
        entry.previewUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
      } catch {
        /* no preview */
      }
    }
    entries.push(entry);
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { entries, zip, fileName };
}

export async function repackAndDownload(
  zip: JSZip,
  entries: FileEntry[],
  fileName: string
): Promise<void> {
  const newZip = new JSZip();

  const binaryLoads: Promise<void>[] = [];
  for (const entry of entries) {
    if (entry.isBinary) {
      const oldEntry = zip.files[entry.path];
      if (oldEntry && !oldEntry.dir) {
        binaryLoads.push(
          oldEntry.async('arraybuffer').then((buf) => {
            newZip.file(entry.path, buf);
          })
        );
      }
    } else {
      newZip.file(entry.path, entry.content);
    }
  }

  await Promise.all(binaryLoads);

  const blob = await newZip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base = fileName.replace(/\.[^.]+$/, '');
  const ext = (fileName.match(/\.[^.]+$/) || [''])[0];
  a.download = `${base}_edited${ext}` || 'edited.docx';
  a.click();
  URL.revokeObjectURL(url);
}
