import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const outFile = path.join(publicDir, '__dev_pptx_list.json');

try {
  const files = fs.readdirSync(publicDir);
  const pptx = files.filter((f) => /\.pptx$/i.test(f)).sort();
  fs.writeFileSync(outFile, JSON.stringify(pptx), 'utf8');
  console.log('[list-pptx]', pptx.length, 'file(s):', pptx.join(', ') || '(none)');
} catch (err) {
  console.error('[list-pptx]', err.message);
  fs.writeFileSync(outFile, '[]', 'utf8');
}
