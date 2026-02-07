<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';

  export let visible: boolean = false;
  export let anchor: HTMLElement | null = null;

  let popoverElement: HTMLDivElement;
  let mounted = false;

  const VIEWPORT_PADDING = 24;
  const SPACING = 4;

  function updatePosition() {
    if (!anchor || !popoverElement || !visible) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popoverElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorRect.left;
    let top = anchorRect.bottom + SPACING;

    // 检查右侧边界
    if (left + popoverRect.width > viewportWidth - VIEWPORT_PADDING) {
      // 尝试右对齐
      left = anchorRect.right - popoverRect.width;
      // 如果还是超出，贴着右边界
      if (left < VIEWPORT_PADDING) {
        left = viewportWidth - popoverRect.width - VIEWPORT_PADDING;
      }
    }

    // 检查左侧边界
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

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
  }

  $: if (visible && mounted) {
    void tick().then(updatePosition);
  }

  onMount(() => {
    mounted = true;
    if (popoverElement && document.body) {
      document.body.appendChild(popoverElement);
    }
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
  });

  onDestroy(() => {
    if (popoverElement && document.body.contains(popoverElement)) {
      document.body.removeChild(popoverElement);
    }
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
  });
</script>

{#if visible}
  <div
    bind:this={popoverElement}
    class="popover-container custom-scrollbar"
    role="menu"
    tabindex="-1"
    on:mouseenter
    on:mouseleave
  >
    <slot />
  </div>
{/if}

<style>
  .popover-container {
    min-width: 12rem;
    max-width: 24rem;
    max-height: 30rem;
    overflow-y: auto;
    padding: 12px;
    background: var(--color-bg-white);
    border: 1px solid var(--color-border-base);
    border-radius: 8px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08);
    scrollbar-width: thin;
    scrollbar-color: var(--color-scrollbar-thumb) var(--color-scrollbar-track);
    font-size: 0.75rem;
    line-height: 1rem;
  }
  .popover-container > :not(:last-child) {
    margin-bottom: 6px;
  }
</style>
