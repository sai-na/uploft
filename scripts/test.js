#!/usr/bin/env node

/**
 * Test runner: bundles test/*.test.ts with esbuild, then runs them with node:test
 */

import * as esbuild from 'esbuild';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const testDir = path.join(rootDir, 'test');
const outDir = path.join(rootDir, 'node_modules', '.cache', 'tests');

const entryPoints = fs
  .readdirSync(testDir)
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => path.join(testDir, name));

fs.rmSync(outDir, { recursive: true, force: true });

await esbuild.build({
  entryPoints,
  bundle: true,
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'warning',
});

const files = fs
  .readdirSync(outDir)
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => path.join(outDir, name));

const result = spawnSync(process.execPath, ['--test', '--enable-source-maps', ...files], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
