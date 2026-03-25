import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const sourceDir = resolve(root, "arena", "dist");
const targetDir = resolve(root, "public", "zone");

if (!existsSync(sourceDir)) {
  console.error(`Arena build output not found: ${sourceDir}`);
  process.exit(1);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Copied arena build from ${sourceDir} to ${targetDir}`);
