import { defineConfig, presetUno, presetIcons } from 'unocss';

export default defineConfig({
  safelist: ['i-tabler-arrow-back-up', 'i-tabler-chevron-left', 'i-tabler-replace', 'i-tabler-letter-case', 'i-tabler-abc', 'i-tabler-regex', 'i-tabler-replace-filled', 'i-tabler-layout-bottombar-expand', 'i-tabler-layout-bottombar-collapse'],
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
      primary: '#a45c40',
      'primary-light': '#f3e8e1',

      // 背景色 (4个层级：主背景 -> 次级背景 -> 元素背景 -> 交互状态)
      'bg-base': '#f5f3ee',        // 主背景
      'bg-secondary': '#faf9f6',    // 次级背景（面板、header）
      'bg-white': '#ffffff',        // 白色（卡片、输入框）
      'bg-element': '#eeece5',      // 元素背景（标签、按钮）
      'bg-hover': '#e6e3db',        // hover/active 统一状态

      // 边框色 (2个层级)
      'border-base': '#e3e0d8',     // 主边框
      'border-hover': '#ccc7bc',    // hover 边框

      // 文本色 (3个层级 + 特殊场景)
      'text-primary': '#30302c',    // 主要文本
      'text-secondary': '#706d65',  // 次要文本（说明、标签）
      'text-muted': '#9a958b',      // 弱化文本（提示）
    },
  },
  preflights: [
    {
      getCSS: () => `
        :root {
          /* 主题色 */
          --color-primary: #a45c40;
          --color-primary-light: #f3e8e1;
          --color-primary-hover: #88492f;
          --color-primary-hover-light: rgba(164, 92, 64, 0.18);
          --color-primary-active: rgba(164, 92, 64, 0.3);

          /* 背景色 (4个层级：主背景 -> 次级背景 -> 元素背景 -> 交互状态) */
          --color-bg-base: #f5f3ee;
          --color-bg-secondary: #faf9f6;
          --color-bg-white: #ffffff;
          --color-bg-element: #eeece5;
          --color-bg-hover: #e6e3db;

          /* 边框色 (2个层级) */
          --color-border-base: #e3e0d8;
          --color-border-hover: #ccc7bc;

          /* 文本色 (3个层级 + 特殊场景) */
          --color-text-primary: #30302c;
          --color-text-secondary: #706d65;
          --color-text-muted: #9a958b;

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
