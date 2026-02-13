import { defineConfig, presetUno, presetIcons } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(), // 默认预设，提供所有工具类
    presetIcons({
      collections: {
        tabler: () => import('@iconify-json/tabler/icons.json').then((i) => i.default),
      },
    }),
  ],
  content: {
    filesystem: ['index.html', 'src/**/*.svelte', 'src/**/*.ts'],
  },
  theme: {
    fontFamily: {
      sans: 'ui-sans-serif, system-ui, sans-serif',
      mono: 'ui-monospace, monospace',
    },
    colors: {
      // 主题色
      primary: '#fe8600',
      'primary-light': '#fff9f5',

      // 背景色 (4个层级：主背景 -> 次级背景 -> 元素背景 -> 交互状态)
      'bg-base': '#f7f7f4',        // 主背景
      'bg-secondary': '#fafafa',    // 次级背景（面板、header）
      'bg-white': '#ffffff',        // 白色（卡片、输入框）
      'bg-element': '#eeeee9',      // 元素背景（标签、按钮）
      'bg-hover': '#e0e0e0',        // hover/active 统一状态

      // 边框色 (2个层级)
      'border-base': '#e5e5e0',     // 主边框
      'border-hover': '#d0d0cc',    // hover 边框

      // 文本色 (3个层级 + 特殊场景)
      'text-primary': '#26251e',    // 主要文本
      'text-secondary': '#7a7974',  // 次要文本（说明、标签）
      'text-muted': '#999999',      // 弱化文本（提示）
    },
  },
  preflights: [
    {
      getCSS: () => `
        :root {
          /* 主题色 */
          --color-primary: #fe8600;
          --color-primary-light: #fff9f5;
          --color-primary-hover-light: rgba(254, 134, 0, 0.4);
          --color-primary-active: rgba(254, 134, 0, 0.6);

          /* 背景色 (4个层级：主背景 -> 次级背景 -> 元素背景 -> 交互状态) */
          --color-bg-base: #f7f7f4;
          --color-bg-secondary: #fafafa;
          --color-bg-white: #ffffff;
          --color-bg-element: #eeeee9;
          --color-bg-hover: #e0e0e0;

          /* 边框色 (2个层级) */
          --color-border-base: #e5e5e0;
          --color-border-hover: #d0d0cc;

          /* 文本色 (3个层级 + 特殊场景) */
          --color-text-primary: #26251e;
          --color-text-secondary: #7a7974;
          --color-text-muted: #999999;

          /* 滚动条色 (复用其他颜色) */
          --color-scrollbar-thumb: #c0c0c0;
          --color-scrollbar-track: var(--color-bg-element);
          --color-scrollbar-hover: #a0a0a0;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: var(--color-scrollbar-track);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--color-scrollbar-thumb);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--color-scrollbar-hover);
        }
      `,
    },
  ],
});
