import format from 'xml-formatter';

export const XML_FORMAT_OPTIONS = { indentation: '  ', collapseContent: true, lineSeparator: '\n' };

export function isTextPart(path: string): boolean {
  return /\.(xml|rels|vml)$/i.test(path);
}

/** OOXML XML may be UTF-8 or BOM-marked UTF-16. Use the same decoder in all views. */
export function decodePart(bytes: Uint8Array): string {
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le'
    : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}

/** Keep a UTF-16 XML declaration consistent with the bytes written on export. */
export function encodePart(value: string): Uint8Array {
  const encoding = /^\s*<\?xml\b[^?]*\bencoding\s*=\s*["'](utf-16(?:le|be)?)["']/i.exec(value)?.[1].toLowerCase();
  if (!encoding) return new TextEncoder().encode(value);
  const bigEndian = encoding === 'utf-16be';
  const bytes = new Uint8Array(2 + value.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xfeff, !bigEndian);
  for (let i = 0; i < value.length; i++) view.setUint16(2 + i * 2, value.charCodeAt(i), !bigEndian);
  return bytes;
}

export function formatXml(value: string): string {
  return format(value, XML_FORMAT_OPTIONS);
}

export function displayXml(value: string): string {
  if (!value) return '';
  try { return formatXml(value); } catch { return value; }
}
