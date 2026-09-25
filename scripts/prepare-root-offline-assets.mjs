import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('[Root Offline Assets] Copying Pyodide assets to public/pyodide...');
const pyodideSrc = path.join(root, 'node_modules', 'pyodide');
const pyodideDest = path.join(root, 'public', 'pyodide');
copyDir(pyodideSrc, pyodideDest);

console.log('[Root Offline Assets] Copying CodeMirror assets to public/vendor/codemirror...');
const cmSrc = path.join(root, 'node_modules', 'codemirror');
const cmDest = path.join(root, 'public', 'vendor', 'codemirror');
copyDir(cmSrc, cmDest);

console.log('[Root Offline Assets] Success! All root offline assets prepared in public/');
