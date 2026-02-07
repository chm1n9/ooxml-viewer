<script lang="ts">
  import { buildRelsGraph } from './relsGraph';
  import RelsTreeNode from './RelsTreeNode.svelte';

  export let entries: { path: string; content: string }[] = [];

  $: graph = buildRelsGraph(entries);
  $: edgesByFrom = (() => {
    const m = new Map<string, { to: string; type: string }[]>();
    for (const e of graph.edges) {
      let arr = m.get(e.from);
      if (!arr) {
        arr = [];
        m.set(e.from, arr);
      }
      arr.push({ to: e.to, type: e.type });
    }
    return m;
  })();

  const PACKAGE_ROOT = '[Package]';
  $: roots = (() => {
    const targets = new Set(graph.edges.map((e) => e.to));
    const fromRoots = Array.from(graph.nodes).filter((n) => !targets.has(n));
    return fromRoots.length > 0 ? fromRoots : [PACKAGE_ROOT];
  })();

  let expanded = new Set<string>([PACKAGE_ROOT]);
  function toggle(path: string) {
    expanded = new Set(expanded);
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    expanded = expanded;
  }
</script>

<div class="rels-graph flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-l-lg border border-border-base border-l-0">
  <div class="shrink-0 py-2 px-4 text-xs text-text-secondary border-b border-border-base bg-bg-secondary">
    Rels dependency tree
  </div>
  <div class="flex-1 min-h-0 overflow-auto p-4 font-mono text-sm text-text-primary">
    {#each roots as root}
      <RelsTreeNode
        nodePath={root}
        {edgesByFrom}
        {expanded}
        onToggle={toggle}
        depth={0}
      />
    {/each}
  </div>
</div>
