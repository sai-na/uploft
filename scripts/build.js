#!/usr/bin/env node

/**
 * Build script for Chrome extension
 * Copies necessary files to dist/ directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Ensure dist directory exists (don't delete - tsc already compiled there)
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy manifest.json
if (fs.existsSync(path.join(rootDir, 'manifest.json'))) {
  fs.copyFileSync(
    path.join(rootDir, 'manifest.json'),
    path.join(distDir, 'manifest.json')
  );
  console.log('✓ Copied manifest.json');
}

// Copy icons directory
const iconsDir = path.join(rootDir, 'icons');
if (fs.existsSync(iconsDir)) {
  const distIconsDir = path.join(distDir, 'icons');
  fs.mkdirSync(distIconsDir, { recursive: true });
  fs.cpSync(iconsDir, distIconsDir, { recursive: true });
  console.log('✓ Copied icons/');
}

// Copy popup HTML
const popupHtml = path.join(rootDir, 'src', 'popup', 'popup.html');
if (fs.existsSync(popupHtml)) {
  fs.copyFileSync(popupHtml, path.join(distDir, 'popup.html'));
  console.log('✓ Copied popup.html');
}

// Copy popup CSS
const popupCss = path.join(rootDir, 'src', 'popup', 'popup.css');
if (fs.existsSync(popupCss)) {
  fs.copyFileSync(popupCss, path.join(distDir, 'popup.css'));
  console.log('✓ Copied popup.css');
}

// Copy uploader page
for (const file of ['uploader.html', 'uploader.css']) {
  const source = path.join(rootDir, 'src', 'uploader', file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(distDir, file));
    console.log(`✓ Copied ${file}`);
  }
}

// TypeScript compilation already handled by tsc command
// No need to copy JS files - they're already in dist/

console.log('\n✅ Build complete! Extension is ready in dist/');
console.log('Load the dist/ folder in Chrome to test the extension.\n');
