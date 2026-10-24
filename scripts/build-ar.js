#!/usr/bin/env node
/**
 * Builds the Arabic site (/ar/*.html) from the English pages.
 *
 *   node scripts/build-ar.js            → writes ar/*.html (used by the Dockerfile)
 *   node scripts/build-ar.js --check    → lists English text with no Arabic translation, exits 1 if any
 *   node scripts/build-ar.js --extract  → writes i18n/_strings.json (every translatable unit, for translators)
 *
 * Translations live in i18n/ar.json: { "<English text or inline HTML>": "<Arabic>" }.
 * A "unit" is a block whose content is text plus inline tags (a, strong, span, i, br…),
 * so sentences are translated whole and inline markup is kept in the Arabic.
 * Whitespace inside keys is collapsed to single spaces.
 *
 * Text filled in at runtime from the CMS is translated in the CMS (Arabic fields);
 * the static text here is only the fallback shown before/without the CMS.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'ar');
const DICT_FILE = path.join(ROOT, 'i18n', 'ar.json');
const SCRIPT_DICT_FILE = path.join(ROOT, 'i18n', 'ar-scripts.json');
const SITE = 'https://scalen.marketing';
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--extract') ? 'extract' : 'build';

const INLINE = new Set(['a', 'abbr', 'b', 'br', 'code', 'em', 'i', 'mark', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'time']);
const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'code', 'pre']);
const ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];
const LATIN = /[A-Za-z]{2,}/;

const norm = s => s.replace(/\s+/g, ' ').trim();
const loadJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const dict = loadJSON(DICT_FILE, {});
const scriptDict = loadJSON(SCRIPT_DICT_FILE, {});

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
const missing = new Map();   // key -> Set(pages)
const strings = new Map();   // key -> { count, pages:Set }

function note(map, key, page) {
  if (!map.has(key)) map.set(key, { count: 0, pages: new Set() });
  const e = map.get(key); e.count++; e.pages.add(page);
}

function lookup(key, page) {
  note(strings, key, page);
  if (Object.prototype.hasOwnProperty.call(dict, key) && dict[key] !== '') return dict[key];
  if (!missing.has(key)) missing.set(key, new Set());
  missing.get(key).add(page);
  return null;
}

// Is this element made only of text and inline tags (recursively)?
function isInlineOnly($, el) {
  return $(el).contents().toArray().every(n => {
    if (n.type === 'text') return true;
    if (n.type === 'comment') return true;
    if (n.type !== 'tag') return false;
    if (!INLINE.has(n.name)) return false;
    return isInlineOnly($, n);
  });
}
const hasLatinText = ($, el) => LATIN.test($(el).text());

function translateText(node, page) {
  const raw = node.data;
  const key = norm(raw);
  if (!key || !LATIN.test(key)) return;
  const ar = lookup(key, page);
  if (ar == null) return;
  const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
  node.data = lead + ar + trail;
}

function walk($, el, page) {
  for (const n of $(el).contents().toArray()) {
    if (n.type === 'text') { translateText(n, page); continue; }
    if (n.type !== 'tag' || SKIP.has(n.name)) continue;
    if ($(n).attr('translate') === 'no' || $(n).hasClass('notranslate')) continue;
    translateAttrs($, n, page);
    // A block of text + inline tags is translated as one unit (keeps sentences whole)
    const kids = $(n).children().toArray();
    if (kids.length && isInlineOnly($, n) && hasLatinText($, n) && !INLINE.has(n.name)) {
      const key = norm($(n).html());
      const ar = lookup(key, page);
      if (ar != null) { $(n).html(ar); continue; }
      // fall through: still translate attributes of inline children
      $(n).find('*').each((_, c) => translateAttrs($, c, page));
      continue;
    }
    walk($, n, page);
  }
}

function translateAttrs($, el, page) {
  for (const a of ATTRS) {
    const v = $(el).attr(a);
    if (v && LATIN.test(v)) { const ar = lookup(norm(v), page); if (ar != null) $(el).attr(a, ar); }
  }
  if (el.name === 'input' && /^(submit|button)$/i.test($(el).attr('type') || '')) {
    const v = $(el).attr('value');
    if (v && LATIN.test(v)) { const ar = lookup(norm(v), page); if (ar != null) $(el).attr('value', ar); }
  }
}

function translateInlineScripts($, page) {
  $('script:not([src])').each((_, s) => {
    let code = $(s).html();
    if (!code) return;
    for (const [en, ar] of Object.entries(scriptDict)) {
      if (code.includes(en)) code = code.split(en).join(ar);
    }
    $(s).html(code);
  });
}

function rewriteUrls($) {
  // Pages live one level down (/ar/x.html): make asset paths absolute; page links stay relative (→ /ar/…)
  const fix = v => (v && /^(assets\/|favicon|site\.webmanifest)/.test(v)) ? '/' + v : v;
  $('[src]').each((_, e) => $(e).attr('src', fix($(e).attr('src'))));
  $('link[href]').each((_, e) => $(e).attr('href', fix($(e).attr('href'))));
  $('[style*="url("]').each((_, e) => $(e).attr('style', $(e).attr('style').replace(/url\((['"]?)assets\//g, 'url($1/assets/')));
  $('img[srcset], source[srcset]').each((_, e) => $(e).attr('srcset', $(e).attr('srcset').replace(/(^|,\s*)assets\//g, '$1/assets/')));
  $('style').each((_, s) => $(s).html($(s).html().replace(/url\((['"]?)(\.\.\/)?assets\//g, 'url($1/assets/')));
}

function buildPage(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });

  $('html').attr('lang', 'ar').attr('dir', 'rtl');
  const t = $('title');
  if (t.length && LATIN.test(t.text())) { const ar = lookup(norm(t.text()), file); if (ar != null) t.text(ar); }
  $('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]').each((_, m) => {
    const v = $(m).attr('content'); if (v && LATIN.test(v)) { const ar = lookup(norm(v), file); if (ar != null) $(m).attr('content', ar); }
  });
  $('meta[property="og:locale"]').attr('content', 'ar_AR');

  walk($, $('body'), file);
  if (mode !== 'build') return;

  translateInlineScripts($, file);
  rewriteUrls($);

  // RTL stylesheet right after the shared one
  const shared = $('link[href$="shared.css"]').first();
  const rtl = '<link rel="stylesheet" href="/assets/css/rtl.css" />';
  if (shared.length) shared.after('\n  ' + rtl); else $('head').append(rtl);

  // Language switch → English version of this page; hreflang alternates are already in the source head
  $('a[data-lang-switch]').each((_, a) => {
    $(a).attr('href', '/' + file).attr('hreflang', 'en').attr('lang', 'en').text('English');
  });

  fs.writeFileSync(path.join(OUT, file), $.html());
}

if (mode === 'build') fs.mkdirSync(OUT, { recursive: true });
for (const f of pages) buildPage(f);

if (mode === 'extract') {
  const out = {};
  for (const [k, v] of [...strings.entries()].sort((a, b) => b[1].count - a[1].count)) out[k] = { count: v.count, pages: [...v.pages] };
  fs.mkdirSync(path.join(ROOT, 'i18n'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'i18n', '_strings.json'), JSON.stringify(out, null, 1));
  console.log(`${strings.size} unique units across ${pages.length} pages → i18n/_strings.json`);
} else {
  if (missing.size) {
    console.warn(`⚠️  ${missing.size} English strings have no Arabic translation:`);
    for (const [k, p] of [...missing.entries()].slice(0, 40)) console.warn(`   - ${JSON.stringify(k).slice(0, 110)}  (${[...p].slice(0, 3).join(', ')})`);
    if (mode === 'check') process.exit(1);
  } else {
    console.log(mode === 'check' ? '✅ every string has an Arabic translation' : `✅ built ${pages.length} Arabic pages → ar/`);
  }
}
