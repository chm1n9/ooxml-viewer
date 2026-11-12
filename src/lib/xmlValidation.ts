export interface XmlIssue {
  line: number | null;
  column: number | null;
  message: string;
}

/** Native XML parsing checks well-formedness; this is not OOXML schema validation. */
export function validateXml(content: string): XmlIssue | null {
  try {
    const document = new DOMParser().parseFromString(content, 'application/xml');
    const error = Array.from(document.getElementsByTagNameNS('*', 'parsererror')).find(element =>
      element.namespaceURI === 'http://www.mozilla.org/newlayout/xml/parsererror.xml'
      || element.namespaceURI === 'http://www.w3.org/1999/xhtml');
    if (!error) return null;
    const message = (error.textContent ?? 'Invalid XML').replace(/\s+/g, ' ').trim();
    const line = /line(?:\s+number)?\s*:?\s*(\d+)/i.exec(message);
    const column = /column\s*:?\s*(\d+)/i.exec(message);
    return {
      line: line ? Math.max(1, Number(line[1])) : null,
      column: column ? Math.max(1, Number(column[1])) : null,
      message: message.slice(0, 300),
    };
  } catch {
    return { line: null, column: null, message: 'Unable to parse XML.' };
  }
}
