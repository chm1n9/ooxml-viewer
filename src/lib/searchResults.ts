import type { EditorState } from '@codemirror/state';
import type { SearchQuery } from '@codemirror/search';

export interface SearchResults { ranges: { from: number; to: number }[]; truncated: boolean }

/** Bound panel bookkeeping for very large XML; native search navigation remains unrestricted. */
export function collectSearchResults(state: EditorState, query: SearchQuery, limit = 10000): SearchResults {
  const ranges: SearchResults['ranges'] = [];
  if (!query.valid) return { ranges, truncated: false };
  const cursor = query.getCursor(state);
  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    if (ranges.length === limit) return { ranges, truncated: true };
    ranges.push({ from: match.value.from, to: match.value.to });
  }
  return { ranges, truncated: false };
}

export function searchResultLabel(results: SearchResults, selection: { from: number; to: number }): string {
  const total = `${results.ranges.length}${results.truncated ? '+' : ''}`;
  const current = results.ranges.findIndex(range => range.from === selection.from && range.to === selection.to);
  return current < 0 ? `${total} results` : `${current + 1} / ${total}`;
}
