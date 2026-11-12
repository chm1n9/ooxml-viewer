/** Accepted Office file extensions for open/drop (input accept attribute and validation). */
export const ACCEPT_OFFICE_EXTENSIONS = [
  '.pptx', '.pptm', '.potx', '.potm', '.ppsx', '.ppsm', '.ppam',
  '.docx', '.docm', '.dotx', '.dotm',
  '.xlsx', '.xlsm', '.xltx', '.xltm', '.xlam',
  '.thmx',
];

export const ACCEPT_OFFICE = ACCEPT_OFFICE_EXTENSIONS.join(',');

export function isSupportedOfficeFile(name: string): boolean {
  const extension = /\.[^.]+$/.exec(name)?.[0].toLowerCase();
  return extension !== undefined && ACCEPT_OFFICE_EXTENSIONS.includes(extension);
}
