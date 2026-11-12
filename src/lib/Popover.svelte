<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';

  export let visible: boolean = false;
  export let anchor: HTMLElement | null = null;

  let popoverElement: HTMLDivElement;
  let mounted = false;

  const VIEWPORT_PADDING = 24;
  const SPACING = 4;

  function portal(node: HTMLDivElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function updatePosition() {
    if (!anchor || !popoverElement || !visible) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popoverElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Align the panel's right edge with the trigger, then clamp to the viewport.
    const rightAligned = anchorRect.right - popoverRect.width;
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - popoverRect.width - VIEWPORT_PADDING);
    const left = Math.min(Math.max(VIEWPORT_PADDING, rightAligned), maxLeft);
    let top = anchorRect.bottom + SPACING;

    // 检查底部边界
    if (top + popoverRect.height > viewportHeight - VIEWPORT_PADDING) {
      // 尝试显示在上方
      top = anchorRect.top - popoverRect.height - SPACING;
      // 如果上方也放不下，贴着底部边界
      if (top < VIEWPORT_PADDING) {
        top = viewportHeight - popoverRect.height - VIEWPORT_PADDING;
      }
    }

    // 检查顶部边界（防止向上溢出）
    if (top < VIEWPORT_PADDING) {
      top = VIEWPORT_PADDING;
    }

    popoverElement.style.position = 'fixed';
    popoverElement.style.left = `${left}px`;
    popoverElement.style.top = `${top}px`;
    popoverElement.style.zIndex = '1000';
    popoverElement.style.visibility = 'visible';
  }

  $: if (visible && mounted && anchor) {
    void tick().then(updatePosition);
  }

  onMount(() => {
    mounted = true;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
  });

  onDestroy(() => {
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
  });
</script>

{#if visible}
  <div
    bind:this={popoverElement}
    use:portal
    class="popover-container custom-scrollbar"
    role="region"
    aria-label="Relations"
    tabindex="-1"
    on:mouseenter
    on:mouseleave
  >
    <slot />
  </div>
{/if}

<style>
  .popover-container {
    position: fixed;
    z-index: 1000;
    visibility: hidden;
    width: min(28rem, calc(100vw - 48px));
    min-width: min(12rem, calc(100vw - 48px));
    max-width: min(28rem, calc(100vw - 48px));
    max-height: min(36rem, calc(100vh - 48px));
    box-sizing: border-box;
    overflow-y: auto;
    padding: 6px;
    background: var(--color-bg-white);
    border: 1px solid var(--color-border-base);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(48, 48, 44, 0.1), 0 2px 6px rgba(48, 48, 44, 0.04);
    scrollbar-width: thin;
    scrollbar-color: var(--color-scrollbar-thumb) var(--color-scrollbar-track);
    font-size: 0.75rem;
    line-height: 1rem;
  }
  .popover-container > :not(:last-child) {
    margin-bottom: 6px;
  }
</style>
