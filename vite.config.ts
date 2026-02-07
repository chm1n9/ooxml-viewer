// @ts-nocheck — remove after running: pnpm install
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

function devFirstPptxPlugin() {
  return {
    name: 'dev-first-pptx',
    configureServer(server: import('vite').ViteDevServer) {
      const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url?.split('?')[0] !== '/__dev_first_pptx' || req.method !== 'GET') return next();
        const publicDir = path.join(process.cwd(), 'public');
        fs.readdir(publicDir, (err: Error | null, files: string[] | undefined) => {
          if (err || !files?.length) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const name = files.filter((f: string) => /\.pptx$/i.test(f)).sort()[0];
          if (!name) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const filePath = path.join(publicDir, name);
          fs.readFile(filePath, (readErr: Error | null, data: Buffer | undefined) => {
            if (readErr || data === undefined) {
              res.statusCode = 500;
              res.end();
              return;
            }
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            res.setHeader('Content-Disposition', `inline; filename="${name}"`);
            res.end(data);
          });
        });
      };
      (server.middlewares as any).stack.unshift({ route: '', handle: handler });
    },
  };
}

import UnoCSS from 'unocss/vite';

// GitHub Pages: site is at https://<user>.github.io/<repo>/, so base must be '/<repo>/'
const base =
  process.env.GITHUB_REPOSITORY != null
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/';

export default defineConfig({
  base,
  resolve: {
    conditions: ['browser', 'default'],
    mainFields: ['browser', 'module', 'main'],
  },
  plugins: [
    UnoCSS(),
    devFirstPptxPlugin(),
    svelte({
      compilerOptions: {
        dev: true,
        generate: 'dom', // Force client-side rendering
      },
      hot: {
        preserveLocalState: false,
      },
      emitCss: true,
    }),
    {
      name: 'copy-404-for-github-pages',
      closeBundle() {
        const out = path.join(process.cwd(), 'dist');
        const index = path.join(out, 'index.html');
        const fallback = path.join(out, '404.html');
        if (fs.existsSync(index)) fs.copyFileSync(index, fallback);
      },
    },
  ],
  optimizeDeps: {
    exclude: ['svelte-codemirror-editor', '@codemirror/view', '@codemirror/state', '@codemirror/lang-xml'],
  },
  server: {
    port: 8800,
    hmr: true,
    watch: {
      // Set to true if HMR doesn't trigger (e.g. on network drive / WSL / Docker)
      usePolling: false,
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
