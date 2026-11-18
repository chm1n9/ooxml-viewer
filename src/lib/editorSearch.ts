import { SearchQuery } from '@codemirror/search';

/** In-memory state shared by XML editors in the currently open package. */
export interface EditorSearchSession {
  open: boolean;
  replaceOpen: boolean;
  query: SearchQuery;
}

export function createEditorSearchSession(): EditorSearchSession {
  return { open: false, replaceOpen: false, query: new SearchQuery({ search: '' }) };
}
