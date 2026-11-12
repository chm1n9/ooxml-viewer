import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip, ViewPlugin } from '@codemirror/view';
import { getPartRelsPath, resolveTarget } from './relsGraph';

interface LinkContext {
  path: string;
  paths: Set<string>;
  targets: Map<string, string>;
}

/** Resolve internal XML attribute links without opening arbitrary URLs. */
export function resolveXmlLink(name: string, value: string, context: LinkContext): string | null {
  if (/^(?:[^:]+:)?(?:id|embed|link)$/i.test(name) && context.targets.has(value)) {
    return context.targets.get(value)!;
  }
  if (!value || value.length > 4096 || /^[a-z][a-z\d+.-]*:|^\/\//i.test(value)) return null;
  // A path must look like a file reference, rather than a generic XML attribute.
  if (!/[/.]/.test(value)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(value.split(/[?#]/)[0]); } catch { return null; }
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(decoded)) return null;
  const relsPath = context.path.endsWith('.rels') ? context.path : getPartRelsPath(context.path);
  const relative = resolveTarget(relsPath, decoded);
  if (context.paths.has(relative)) return relative;
  return context.paths.has(decoded) ? decoded : null;
}

export function xmlLinks(getContext: () => LinkContext, open: (path: string) => void) {
  function linkAt(view: EditorView, position: number) {
    let node = syntaxTree(view.state).resolveInner(position, -1);
    while (node.parent && node.name !== 'AttributeValue') node = node.parent;
    if (node.name !== 'AttributeValue' || position <= node.from || position >= node.to) return null;
    const attribute = node.parent;
    const name = attribute?.getChild('AttributeName');
    if (!name) return null;
    if (getContext().path.endsWith('.rels') && view.state.sliceDoc(name.from, name.to) === 'Target') {
      const external = attribute?.parent?.getChildren('Attribute').some(sibling => {
        const key = sibling.getChild('AttributeName');
        const value = sibling.getChild('AttributeValue');
        return key && value && view.state.sliceDoc(key.from, key.to) === 'TargetMode'
          && /^(["'])External\1$/.test(view.state.sliceDoc(value.from, value.to));
      });
      if (external) return null;
    }
    const raw = view.state.sliceDoc(node.from, node.to);
    if (!/^(["']).*\1$/s.test(raw)) return null;
    // DOMParser decodes XML entities; text never enters an HTML sink.
    const parsed = new DOMParser().parseFromString(`<link value=${raw}/>`, 'application/xml');
    if (parsed.getElementsByTagName('parsererror').length) return null;
    const target = resolveXmlLink(view.state.sliceDoc(name.from, name.to), parsed.documentElement.getAttribute('value') ?? '', getContext());
    return target ? { from: node.from + 1, to: node.to - 1, target } : null;
  }
  const highlight = StateEffect.define<{ from: number; to: number } | null>();
  const activeLink = StateField.define<{ from: number; to: number } | null>({
    create: () => null,
    update(value, transaction) {
      if (transaction.docChanged) value = null;
      for (const effect of transaction.effects) if (effect.is(highlight)) value = effect.value;
      return value;
    },
    provide: field => EditorView.decorations.from(field, range => range
      ? Decoration.set([Decoration.mark({ class: 'cm-part-link-active' }).range(range.from, range.to)])
      : Decoration.none),
  });
  let pointer: { x: number; y: number } | null = null;
  function updateCursor(view: EditorView, modified: boolean) {
    const pos = pointer ? view.posAtCoords(pointer) : null;
    const link = modified && pos !== null ? linkAt(view, pos) : null;
    view.contentDOM.style.cursor = link ? 'pointer' : '';
    const previous = view.state.field(activeLink);
    if (previous?.from !== link?.from || previous?.to !== link?.to) {
      view.dispatch({ effects: highlight.of(link ? { from: link.from, to: link.to } : null) });
    }
  }
  return [
    activeLink,
    ViewPlugin.define(view => {
      const onModifier = (event: KeyboardEvent) => updateCursor(view, event.metaKey || event.ctrlKey);
      const onBlur = () => updateCursor(view, false);
      window.addEventListener('keydown', onModifier);
      window.addEventListener('keyup', onModifier);
      window.addEventListener('blur', onBlur);
      return {
        destroy() {
          window.removeEventListener('keydown', onModifier);
          window.removeEventListener('keyup', onModifier);
          window.removeEventListener('blur', onBlur);
        },
      };
    }),
    EditorView.domEventHandlers({
      mousemove(event, view) {
        pointer = { x: event.clientX, y: event.clientY };
        updateCursor(view, event.metaKey || event.ctrlKey);
      },
      mouseleave(_event, view) { pointer = null; updateCursor(view, false); },
      mousedown(event, view) {
        if (event.button !== 0 || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const link = pos === null ? null : linkAt(view, pos);
        if (!link) return false;
        event.preventDefault();
        open(link.target);
        return true;
      },
    }),
    hoverTooltip((view, pos) => {
      const link = linkAt(view, pos);
      if (!link) return null;
      return {
        pos: link.from, end: link.to, above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-part-link-tooltip';
          const target = document.createElement('button');
          target.type = 'button';
          target.className = 'cm-part-link-target';
          target.title = link.target;
          target.setAttribute('aria-label', `Open ${link.target}`);
          const separator = link.target.lastIndexOf('/');
          const directory = document.createElement('span');
          directory.className = 'cm-part-link-directory';
          directory.textContent = link.target.slice(0, separator + 1);
          const filename = document.createElement('span');
          filename.className = 'cm-part-link-filename';
          filename.textContent = link.target.slice(separator + 1);
          target.append(directory, filename);
          target.addEventListener('click', () => open(link.target));
          const hint = document.createElement('div');
          hint.className = 'cm-part-link-hint';
          const shortcut = document.createElement('kbd');
          shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
          const instruction = document.createElement('span');
          instruction.textContent = '+ click to open';
          hint.append(shortcut, instruction);
          dom.append(target, hint);
          return { dom };
        },
      };
    }, { hideOnChange: true }),
    EditorView.baseTheme({
      '.cm-part-link-active': { textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer' },
      '.cm-tooltip:has(.cm-part-link-tooltip)': {
        backgroundColor: 'var(--color-bg-white)', border: '1px solid var(--color-border-base)',
        borderRadius: '8px', boxShadow: '0 4px 16px rgba(48, 48, 44, 0.12)', overflow: 'hidden',
      },
      '.cm-part-link-tooltip': {
        padding: '4px', minWidth: '200px', maxWidth: 'min(420px, 80vw)',
        boxSizing: 'border-box', color: 'var(--color-text-secondary)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '11px',
      },
      '.cm-part-link-target': {
        display: 'flex', alignItems: 'baseline', width: '100%', minWidth: '0',
        padding: '7px 8px', border: '0', borderRadius: '4px', backgroundColor: 'transparent',
        color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer',
        fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '18px',
      },
      '.cm-part-link-target:hover': { backgroundColor: 'var(--color-bg-element)' },
      '.cm-part-link-target:focus-visible': { outline: '2px solid var(--color-primary)', outlineOffset: '-2px' },
      '.cm-part-link-directory': { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' },
      '.cm-part-link-filename': { flex: '0 0 auto', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' },
      '.cm-part-link-hint': { display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px 6px', color: 'var(--color-text-muted)', lineHeight: '16px' },
      '.cm-part-link-hint kbd': { padding: '0 4px', border: '1px solid var(--color-border-base)', borderRadius: '3px', fontFamily: 'inherit', fontSize: '10px', color: 'var(--color-text-secondary)' },
    }),
  ];
}
