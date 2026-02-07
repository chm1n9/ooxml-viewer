import 'normalize.css/normalize.css';
import 'virtual:uno.css';
import App from './App.svelte';
import { loadOfficeFile } from './lib/ooxml';

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/*$/, '') || '';

/** Dev-only: resolve first file to open from __dev_first_pptx or list config. */
async function loadDevAutoOpenFile(): Promise<File | null> {
  const getList = async (): Promise<string[]> => {
    const listRes = await fetch(`${base}/__dev_pptx_list.json`).catch(() => null);
    if (listRes?.ok) return listRes.json();
    const autoRes = await fetch(`${base}/__auto_open.json`).catch(() => null);
    return autoRes?.ok ? autoRes.json() : [];
  };

  const fetchFirstFromList = async (list: string[]): Promise<File | null> => {
    const name = list?.[0];
    if (!name) return null;
    const res = await fetch(`${base}/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return new File([await res.blob()], name);
  };

  const devRes = await fetch(`${base}/__dev_first_pptx`).catch(() => null);
  if (devRes?.ok) {
    const blob = await devRes.blob();
    if (blob.size > 0) {
      const name =
        devRes.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? 'auto.pptx';
      return new File([blob], name);
    }
  }
  return fetchFirstFromList(await getList());
}

/** Dev: load file first then mount so App receives initialData in props and onMount sees it. Prod: mount immediately. */
async function bootstrap() {
  const target = document.getElementById('app')!;
  let initialData: Awaited<ReturnType<typeof loadOfficeFile>> | null = null;
  if (import.meta.env.DEV) {
    const file = await loadDevAutoOpenFile();
    if (file) {
      try {
        initialData = await loadOfficeFile(file);
      } catch {
        /* ignore */
      }
    }
  }
  const app = new App({
    target,
    props: { initialData },
  });
  return app;
}

const app = await bootstrap();
export default app;
