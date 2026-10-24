#!/usr/bin/env node
/**
 * Build step (after build-ar.js): adds ?v=<content hash> to the site's own CSS/JS links in every
 * page (English and /ar/), so browsers fetch the new files right after a deploy instead of
 * running a cached copy from the previous version.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const hashes = new Map();
function hashOf(rel) {
  if (!hashes.has(rel)) {
    let h = null;
    try { h = crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 10); } catch {}
    hashes.set(rel, h);
  }
  return hashes.get(rel);
}

const files = [
  ...fs.readdirSync(ROOT).filter(f => f.endsWith('.html')),
  ...(fs.existsSync(path.join(ROOT, 'ar')) ? fs.readdirSync(path.join(ROOT, 'ar')).filter(f => f.endsWith('.html')).map(f => 'ar/' + f) : []),
];
let count = 0;
for (const f of files) {
  const p = path.join(ROOT, f);
  const html = fs.readFileSync(p, 'utf8');
  const out = html.replace(/\b(href|src)="(\/?)(assets\/(?:css|js)\/[^"?#]+\.(?:css|js))(\?v=[^"]*)?"/g, (m, attr, slash, rel) => {
    const h = hashOf(rel);
    if (!h) return m;
    count++;
    return `${attr}="${slash}${rel}?v=${h}"`;
  });
  if (out !== html) fs.writeFileSync(p, out);
}
console.log(`✅ versioned ${count} CSS/JS links in ${files.length} pages`);
