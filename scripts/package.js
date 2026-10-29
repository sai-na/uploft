#!/usr/bin/env node

/**
 * Package script: zips the files the extension actually loads from dist/ into
 * release/upload-tracker-for-drive-<version>.zip for the Chrome Web Store.
 *
 * Starts from manifest.json and follows every reference (HTML tags, CSS url(),
 * ES module imports, chrome.runtime.getURL, notification icons), so tsc output
 * the bundles already contain, source maps and .d.ts files are left out.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');

/** Shape of a Google OAuth client ID, to catch a build without config.ts filled in */
const CLIENT_ID_PATTERN = /\d+-[a-z0-9]+\.apps\.googleusercontent\.com/;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** True for URLs that point outside the extension */
function isExternal(ref) {
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
}

/** Resolve a reference to a path relative to dist/, without query or hash */
function resolveRef(fromFile, ref, fromRoot = false) {
  const clean = ref.split(/[?#]/)[0];
  const base = fromRoot || clean.startsWith('/') ? '' : path.dirname(fromFile);
  return path.posix.normalize(path.posix.join(base, clean.replace(/^\//, '')));
}

const manifestPath = path.join(distDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  fail('dist/manifest.json not found. Run npm run build first.');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const files = new Set();
const queue = [];

/** Add a file the extension needs; a missing one stops the package */
function need(file, reason) {
  if (files.has(file)) {
    return;
  }
  if (!fs.existsSync(path.join(distDir, file))) {
    fail(`${file} is missing from dist/ (referenced by ${reason})`);
  }
  files.add(file);
  queue.push(file);
}

function iconPaths(value) {
  if (!value) return [];
  return typeof value === 'string' ? [value] : Object.values(value);
}

need('manifest.json', 'the package');

const manifestRefs = [
  manifest.action?.default_popup,
  ...iconPaths(manifest.action?.default_icon),
  ...iconPaths(manifest.icons),
  manifest.background?.service_worker,
  manifest.options_page,
  manifest.options_ui?.page,
  manifest.side_panel?.default_path,
  manifest.devtools_page,
  ...Object.values(manifest.chrome_url_overrides ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((script) => [
    ...(script.js ?? []),
    ...(script.css ?? []),
  ]),
  ...(manifest.web_accessible_resources ?? []).flatMap(
    (entry) => entry.resources ?? []
  ),
].filter(Boolean);

for (const ref of manifestRefs) {
  if (ref.includes('*')) {
    fail(`Wildcard "${ref}" in manifest.json; list the files instead`);
  }
  need(resolveRef('manifest.json', ref, true), 'manifest.json');
}

if (manifest.default_locale) {
  const localesDir = path.join(distDir, '_locales');
  if (!fs.existsSync(localesDir)) {
    fail('manifest.json sets default_locale but dist/_locales is missing');
  }
  for (const entry of fs.readdirSync(localesDir, { recursive: true })) {
    const file = path.posix.join('_locales', entry.split(path.sep).join('/'));
    if (fs.statSync(path.join(distDir, file)).isFile()) {
      need(file, 'default_locale');
    }
  }
}

/** Follow references inside HTML, CSS and JavaScript files */
while (queue.length) {
  const file = queue.shift();
  const ext = path.extname(file);
  if (!['.html', '.css', '.js'].includes(ext)) {
    continue;
  }
  const text = fs.readFileSync(path.join(distDir, file), 'utf8');
  const refs = [];

  if (ext === '.html') {
    for (const match of text.matchAll(/\s(?:src|href)\s*=\s*"([^"]+)"/g)) {
      refs.push(match[1]);
    }
  }

  if (ext === '.css') {
    for (const match of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      refs.push(match[1]);
    }
    for (const match of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
      refs.push(match[1]);
    }
  }

  if (ext === '.js') {
    const moduleRefs = [
      ...text.matchAll(
        /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g
      ),
      ...text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
      ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);
    for (const ref of moduleRefs) {
      if (ref.startsWith('.') || ref.startsWith('/')) {
        refs.push(ref);
      }
    }
    // Paths resolved against the extension root
    const rootRefs = [
      ...text.matchAll(/getURL\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...text.matchAll(/iconUrl\s*:\s*['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);
    for (const ref of rootRefs) {
      if (!isExternal(ref)) {
        need(resolveRef(file, ref, true), file);
      }
    }
  }

  for (const ref of refs) {
    if (!isExternal(ref) && !ref.startsWith('data:')) {
      need(resolveRef(file, ref), file);
    }
  }
}

// A store build with no Google client ID would only show "isn't set up yet"
const uploaderBundle = [...files].find((file) =>
  file.endsWith('uploader.bundle.js')
);
if (
  uploaderBundle &&
  !CLIENT_ID_PATTERN.test(
    fs.readFileSync(path.join(distDir, uploaderBundle), 'utf8')
  )
) {
  fail(
    'The uploader has no Google OAuth client ID. Fill in src/uploader/config.ts (docs/SETUP.md) and rebuild.'
  );
}

// Copy into a staging folder, dropping sourceMappingURL comments for the
// .map files that aren't shipped
const zipName = `upload-tracker-for-drive-${manifest.version}.zip`;
const zipPath = path.join(releaseDir, zipName);
const stagingDir = path.join(releaseDir, `.staging-${manifest.version}`);
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

const sorted = [...files].sort();
for (const file of sorted) {
  const target = path.join(stagingDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const source = path.join(distDir, file);
  if (file.endsWith('.js') || file.endsWith('.css')) {
    const text = fs
      .readFileSync(source, 'utf8')
      .replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n')
      .replace(/\n?\/\*# sourceMappingURL=\S+ \*\/\s*$/, '\n');
    fs.writeFileSync(target, text);
  } else {
    fs.copyFileSync(source, target);
  }
}

fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-q', '-X', '-r', zipPath, ...sorted], {
  cwd: stagingDir,
  stdio: 'inherit',
});
fs.rmSync(stagingDir, { recursive: true, force: true });

const size = fs.statSync(zipPath).size;
console.log(`Packaged ${sorted.length} files:`);
for (const file of sorted) {
  console.log(`  ${file}`);
}
console.log(
  `\n✅ release/${zipName} (${(size / 1024).toFixed(1)} KB), version ${manifest.version}\n`
);
