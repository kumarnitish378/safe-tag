#!/usr/bin/env node
/**
 * Scans docs/hero/ and writes docs/hero/manifest.json — the list the landing
 * page's hero carousel reads. Run it whenever you add or remove hero images:
 *
 *   npm run hero        (or)   node docs/build-hero-manifest.js
 *
 * A browser can't list a folder on a static site, so this manifest is how the
 * carousel "sees" every image — locally and on blog.sftg.in.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'hero');
const EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

const files = fs.readdirSync(dir)
  .filter((f) => EXT.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(files, null, 2) + '\n');

console.log(`Wrote docs/hero/manifest.json — ${files.length} image(s):`);
files.forEach((f) => console.log('  - ' + f));
