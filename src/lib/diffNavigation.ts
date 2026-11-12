import { getChunks } from '@codemirror/merge';
import { foldedRanges, unfoldEffect } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export function changeNavigation(state: EditorState) {
  const chunks = getChunks(state)?.chunks ?? [];
  const head = state.selection.main.head;
  const active = chunks.findIndex(chunk => head >= chunk.fromB
    && (chunk.fromB === chunk.toB ? head === chunk.fromB : head < chunk.toB));
  return { chunks, active };
}

export function changeTarget(state: EditorState, direction: -1 | 1): number | null {
  const { chunks, active } = changeNavigation(state);
  if (!chunks.length) return null;
  const head = state.selection.main.head;
  let index: number;
  if (active >= 0) index = (active + direction + chunks.length) % chunks.length;
  else if (direction === 1) {
    index = chunks.findIndex(chunk => chunk.fromB > head);
    if (index < 0) index = 0;
  } else {
    index = chunks.length - 1;
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].fromB < head) { index = i; break; }
    }
  }
  return Math.min(chunks[index].fromB, state.doc.length);
}

export function navigateChange(view: EditorView, direction: -1 | 1): void {
  const position = changeTarget(view.state, direction);
  if (position === null) return;
  const effects = [EditorView.scrollIntoView(position, { y: 'center' })];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    if (from <= position && position <= to) effects.push(unfoldEffect.of({ from, to }));
  });
  view.dispatch({ selection: { anchor: position }, effects, userEvent: 'select.byChunk' });
  view.focus();
}
