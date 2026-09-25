import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const arenaRoot = path.resolve(__dirname, '..');

// Helper to copy recursively
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

console.log('Copying Pyodide assets to public/pyodide...');
const pyodideSrc = path.join(arenaRoot, 'node_modules', 'pyodide');
const pyodideDest = path.join(arenaRoot, 'public', 'pyodide');
copyDir(pyodideSrc, pyodideDest);

console.log('Copying Monaco Editor assets to public/monaco/vs...');
const monacoSrc = path.join(arenaRoot, 'node_modules', 'monaco-editor', 'min', 'vs');
const monacoDest = path.join(arenaRoot, 'public', 'monaco', 'vs');
copyDir(monacoSrc, monacoDest);

console.log('Offline assets successfully copied to public/!');
