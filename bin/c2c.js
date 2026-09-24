#!/usr/bin/env node
import '../runtime/bootstrap.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'cli', 'index.js');

if (existsSync(dist)) {
  await import(pathToFileURL(dist).href);
} else {
  const entry = path.join(root, 'src', 'cli', 'index.ts');
  const result = spawnSync(process.execPath, [
    '--import', pathToFileURL(path.join(root, 'runtime', 'bootstrap.mjs')).href,
    '--import', 'tsx/esm', entry, ...process.argv.slice(2),
  ], { stdio: 'inherit' });
  if (result.error) {
    process.stderr.write('C2Cの起動に失敗しました。Node.jsとビルド状態を確認してください。\n');
  }
  process.exit(result.status ?? 1);
}
