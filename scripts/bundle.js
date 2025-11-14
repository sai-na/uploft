#!/usr/bin/env node

/**
 * Bundle script using esbuild
 * Bundles content script while keeping background as ES module
 */

import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');

async function bundle() {
  try {
    // Bundle content script (needs to be a single file for Chrome extension)
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'dist/content/content.js')],
      bundle: true,
      outfile: path.join(rootDir, 'dist/content/content.bundle.js'),
      format: 'iife', // Immediately Invoked Function Expression - works in content scripts
      platform: 'browser',
      target: 'es2021',
      sourcemap: true,
    });

    console.log('✓ Bundled content script');

    // Bundle background service worker
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'dist/background/background.js')],
      bundle: true,
      outfile: path.join(rootDir, 'dist/background/background.bundle.js'),
      format: 'esm', // ES modules format for service workers
      platform: 'browser',
      target: 'es2021',
      sourcemap: true,
    });

    console.log('✓ Bundled background service worker');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

bundle();
