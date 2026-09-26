import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const sourceDir = resolve(root, "arena", "dist");
const targetDir = resolve(root, "public", "zone");

if (!existsSync(sourceDir)) {
  console.error(`Arena build output not found: ${sourceDir}`);
  process.exit(1);
}

// 1. Copy arena build to public/zone
rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
console.log(`Copied arena build from ${sourceDir} to ${targetDir}`);

// 2. Mirror public/ to root dist/ so Vercel succeeds whether Output Directory is 'public' or 'dist'
const distDir = resolve(root, "dist");
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(resolve(root, "public"), distDir, { recursive: true });
console.log(`Mirrored public/ to root dist/ output directory: ${distDir}`);
