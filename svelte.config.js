import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    generate: 'dom', // Explicitly use client-side (DOM) mode, not SSR
  },
};
