declare module '@codemirror/search' {
  import type { Extension } from '@codemirror/state';
  import type { EditorView } from '@codemirror/view';

  export function search(options?: { top?: boolean }): Extension;
  export const searchKeymap: readonly { key: string; run?: (view: EditorView) => boolean; preventDefault?: boolean }[];
  export function openSearchPanel(view: EditorView): void;
  export function closeSearchPanel(view: EditorView): void;
}
