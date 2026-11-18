import { unifiedMergeView } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';

/** Display-only diff: the original text never becomes part of the editable document. */
export function inlineDiff(original: string, revert = true) {
  return [
    unifiedMergeView({
      original,
      highlightChanges: true,
      gutter: true,
      mergeControls: !revert ? false : (type, action) => {
        if (type === 'accept') {
          const placeholder = document.createElement('span');
          placeholder.hidden = true;
          return placeholder;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cm-revert-change';
        const icon = document.createElement('span');
        icon.className = 'i-tabler-arrow-back-up';
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        button.title = 'Revert this change (Cmd/Ctrl + Z to undo)';
        button.setAttribute('aria-label', 'Revert this change');
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', event => {
          const editor = button.closest('.cm-editor')?.querySelector<HTMLElement>('.cm-content');
          action(event);
          editor?.focus({ preventScroll: true });
        });
        return button;
      },
      allowInlineDiffs: false,
      diffConfig: { scanLimit: 500 },
    }),
    EditorView.theme({
      '.cm-chunkButtons .cm-revert-change': {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '24px', height: '24px', boxSizing: 'border-box', padding: '0',
        border: '1px solid var(--color-border-base)', borderRadius: '4px',
        backgroundColor: 'var(--color-bg-white)', color: 'var(--color-text-secondary)',
        fontFamily: 'inherit', fontSize: '11px', lineHeight: '18px', cursor: 'pointer',
      },
      '.cm-revert-change span': { display: 'inline-block', width: '14px', height: '14px' },
      '.cm-chunkButtons .cm-revert-change:hover': { backgroundColor: 'var(--color-bg-element)', color: 'var(--color-text-primary)' },
      '.cm-chunkButtons .cm-revert-change:focus-visible': { outline: '2px solid var(--color-primary)', outlineOffset: '2px' },
      '&.cm-merge-b .cm-changedLine': { backgroundColor: '#edf5ed' },
      '.cm-deletedChunk': { backgroundColor: '#fbefed', paddingLeft: '1rem', paddingRight: '1rem' },
      '&.cm-merge-b .cm-changedText': { backgroundColor: '#cce6cf' },
      '.cm-deletedChunk .cm-deletedText': { backgroundColor: '#f3d3cd' },
      '.cm-deletedLine': { textDecoration: 'line-through', textDecorationColor: '#bc8278' },
      '&.cm-merge-b .cm-changedLineGutter': { backgroundColor: '#80ad86' },
      '.cm-deletedLineGutter': { backgroundColor: '#d59a90' },
    }),
  ];
}
