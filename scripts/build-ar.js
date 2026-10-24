#!/usr/bin/env node
/**
 * Builds the Arabic site (/ar/*.html) from the English pages.
 *
 *   node scripts/build-ar.js            → writes ar/*.html (used by the Dockerfile)
 *   node scripts/build-ar.js --check    → lists English text with no Arabic translation, exits 1 if any
 *   node scripts/build-ar.js --extract  → writes i18n/_strings.json (every translatable unit, for translators)
 *   node scripts/build-ar.js --pseudo   → like build, but untranslated text becomes Arabic filler (RTL layout testing)
 *
 * Translations live in i18n/ar.json: { "<English text or inline HTML>": "<Arabic>" }.
 * A "unit" is a block whose content is text plus inline tags (a, strong, span, i, br…),
 * so sentences are translated whole and inline markup is kept in the Arabic.
 * Whitespace inside keys is collapsed to single spaces.
 *
 * Text filled in at runtime from the CMS is translated in the CMS (Arabic fields);
 * the static text here is only the fallback shown before/without the CMS.
 *
 * SEO: the English heads (written by scripts/seo-heads.js) are carried over with Arabic titles and
 * descriptions, canonical/og:url pointing at /ar/, the Arabic share image and translated JSON-LD.
 * A build also writes sitemap.xml (English + Arabic URLs with hreflang, plus the CMS project pages).
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const rtlcss = require('rtlcss');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'ar');
const DICT_FILE = path.join(ROOT, 'i18n', 'ar.json');
const SCRIPT_DICT_FILE = path.join(ROOT, 'i18n', 'ar-scripts.json');
const SITE = 'https://scalen.marketing';
const SEO = loadJSONSync(path.join(ROOT, 'i18n', 'seo.json'));
function loadJSONSync(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { _noindex: [], _dynamic: [] }; } }
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--extract') ? 'extract' : 'build';
// --pseudo: fill untranslated text with Arabic-looking filler of similar length (layout testing only)
const PSEUDO = process.argv.includes('--pseudo');

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
  return PSEUDO ? pseudo(key) : null;
}

const FILL = 'هذا نص تجريبي عربي يملأ المساحة لاختبار اتجاه الصفحة من اليمين إلى اليسار في التصميم الجديد للموقع '.split(' ');
function pseudoText(t) {
  const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0], core = t.trim();
  if (!LATIN.test(core)) return t;
  let out = '', i = 0;
  while (out.length < core.length * 0.9) out += (out ? ' ' : '') + FILL[i++ % FILL.length];
  return lead + out + trail;
}
// keep inline tags, replace only the text between them
const pseudo = key => key.split(/(<[^>]+>)/).map(p => p.startsWith('<') ? p : pseudoText(p)).join('');

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
    // Unit = the block's own text continues inside inline tags (<p>We help <strong>brands</strong> grow</p>).
    // Containers of links/spans with no text of their own (nav menus) and text + icon (<a><i></i> Go</a>) are walked instead.
    const kids = $(n).children().toArray();
    const ownText = $(n).contents().toArray().some(c => c.type === 'text' && LATIN.test(c.data));
    const textyKids = kids.filter(k => LATIN.test($(k).text()));
    if (ownText && textyKids.length && isInlineOnly($, n)) {
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

// Mirror left/right in page CSS: <style> blocks and style="" attributes (rtlcss also flips
// margins, paddings, borders, radii, positions and translateX). Add /*rtl:ignore*/ before a
// declaration in the English source to keep it as-is.
function flipDecls(decls) {
  const out = rtlcss.process('x{' + decls + '}');
  return out.slice(out.indexOf('{') + 1, out.lastIndexOf('}'));
}
function mirrorStyles($) {
  $('style').each((_, s) => { const css = $(s).html(); if (css && css.trim()) $(s).html(rtlcss.process(css)); });
  $('[style]').each((_, e) => {
    const v = $(e).attr('style');
    if (/left|right|translate|margin|padding|border|radius|float|clear|text-align/i.test(v)) $(e).attr('style', flipDecls(v));
  });
}

// ~155 characters: whole sentences if they fit, else cut at a word boundary
function clipText(text, max = 165) {
  text = norm(text || '');
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?؟]+[.!?؟]+(\s|$)/g) || [];
  let out = '';
  for (const s of sentences) { if ((out + s).trim().length > max) break; out += s; }
  if (out.trim().length >= 80) return out.trim();
  return text.slice(0, 157).replace(/\s+\S*$/, '').replace(/[,،;:—–-]$/, '') + '…';
}

const arUrl = u => u.replace(SITE + '/', SITE + '/ar/');
const isPageUrl = u => typeof u === 'string' && u.startsWith(SITE + '/') && !u.startsWith(SITE + '/assets/') && !u.includes('/#');
const arImage = u => u.replace('/og-en.jpg', '/og-ar.jpg');

// Canonical, og:url, share image, locale and JSON-LD for the Arabic page
function seoHead($, file) {
  $('link[rel="canonical"]').each((_, l) => $(l).attr('href', arUrl($(l).attr('href'))));
  $('meta[property="og:url"]').each((_, m) => $(m).attr('content', arUrl($(m).attr('content'))));
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, m) => $(m).attr('content', arImage($(m).attr('content'))));
  $('meta[property="og:locale"]').attr('content', 'ar_AR');
  $('meta[property="og:locale:alternate"]').attr('content', 'en_US');
  const desc = $('meta[name="description"]').attr('content');
  $('script[type="application/ld+json"]').each((_, s) => {
    let data; try { data = JSON.parse($(s).html()); } catch { return; }
    const fix = o => {
      if (Array.isArray(o)) return o.map(fix);
      if (!o || typeof o !== 'object') return o;
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === 'url' || k === 'mainEntityOfPage') out[k] = (isPageUrl(v) && o['@type'] !== 'Organization' && o['@type'] !== 'ProfessionalService' && o['@type'] !== 'WebSite') ? arUrl(v) : v;
        else if (k === 'image') out[k] = typeof v === 'string' ? arImage(v) : fix(v);
        else if (k === 'inLanguage' && typeof v === 'string') out[k] = 'ar';
        else if (k === 'description' && typeof v === 'string') out[k] = (o['@type'] === 'BlogPosting' ? desc : lookup(norm(v), file)) || v;
        else if (k === 'headline' && typeof v === 'string') out[k] = lookup(norm(v), file) || v;
        else out[k] = fix(v);
      }
      return out;
    };
    $(s).html(JSON.stringify(fix(data)));
  });
}

function buildPage(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });

  $('html').attr('lang', 'ar').attr('dir', 'rtl');
  const isPost = $('.post-body').length > 0;
  const t = $('title');
  if (t.length && LATIN.test(t.text())) { const ar = lookup(norm(t.text()), file); if (ar != null) t.text(ar); }
  // Blog posts: the description is the post's first paragraph, so it is taken from the translated body below
  const descSel = 'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]';
  $('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:image:alt"]' + (isPost ? '' : ', ' + descSel)).each((_, m) => {
    const v = $(m).attr('content'); if (v && LATIN.test(v)) { const ar = lookup(norm(v), file); if (ar != null) $(m).attr('content', ar); }
  });

  walk($, $('body'), file);

  if (isPost) {
    const ar = clipText($('.post-body p').first().text());
    if (ar && !LATIN.test(ar.replace(/\b[A-Z0-9][A-Za-z0-9]*\b/g, ''))) $(descSel).attr('content', ar);
  }
  seoHead($, file);
  if (mode !== 'build') return;

  translateInlineScripts($, file);
  rewriteUrls($);
  mirrorStyles($);

  // Mirrored shared stylesheet + the Arabic additions right after it
  const shared = $('link[href$="shared.css"]').first();
  const rtl = '<link rel="stylesheet" href="/assets/css/rtl.css" />';
  if (shared.length) { shared.attr('href', '/assets/css/shared.rtl.css'); shared.after('\n  ' + rtl); }
  else $('head').append(rtl);
  // Arabic glyph fonts load first on Arabic pages
  $('head').prepend('\n  <link rel="preload" href="/assets/fonts/brand/Alexandria-VF-arabic.woff2" as="font" type="font/woff2" crossorigin />'
    + '\n  <link rel="preload" href="/assets/fonts/brand/Changa-VF-arabic.woff2" as="font" type="font/woff2" crossorigin />');

  // Language switch → English version of this page; hreflang alternates are already in the source head
  $('a[data-lang-switch]').each((_, a) => {
    $(a).attr('href', (file === 'index.html' || file === '404.html') ? '/' : '/' + file).attr('hreflang', 'en').attr('lang', 'en').text('English');
  });
  // Pages served from deeper paths (/services/<slug>) resolve relative links from <base href="/">
  $('base[href="/"]').attr('href', '/ar/');
  // The 404 page is served at any path, so its links are absolute: point them at the Arabic pages
  if (file === '404.html') {
    $('a[href^="/"]:not([data-lang-switch])').each((_, a) => {
      const h = $(a).attr('href');
      if (h === '/') $(a).attr('href', '/ar/');
      else if (/^\/[\w-]+\.html/.test(h)) $(a).attr('href', '/ar' + h);
    });
  }

  fs.writeFileSync(path.join(OUT, file), $.html());
}

if (mode === 'build') {
  fs.mkdirSync(OUT, { recursive: true });
  // Mirrored copy of the shared stylesheet for Arabic pages (generated — not committed)
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'shared.css'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'assets', 'css', 'shared.rtl.css'),
    '/* GENERATED by scripts/build-ar.js from shared.css with rtlcss — do not edit */\n' + rtlcss.process(css));
}
for (const f of pages) buildPage(f);

// sitemap.xml — every indexable page in both languages (with hreflang pairs), plus the CMS project
// pages (project.html?id=…). The CMS is asked at build time; if it can't be reached the static pages
// are still listed. Pages in seo.json "_noindex" / "_dynamic" are left out.
async function writeSitemap() {
  const xmlEsc = s => s.replace(/&/g, '&amp;');
  const entries = [];   // [enUrl, arUrl, lastmod?]
  for (const f of pages) {
    if (SEO._noindex.includes(f) || SEO._dynamic.includes(f)) continue;
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/<meta name="robots" content="noindex/.test(html)) continue;
    const date = (html.match(/"datePublished":"(\d{4}-\d{2}-\d{2})"/) || [])[1];
    const p = f === 'index.html' ? '' : f;
    entries.push([SITE + '/' + p, SITE + '/ar/' + p, date]);
  }
  let cms = process.env.CMS_BASE || '';
  if (!cms) try { cms = (fs.readFileSync(path.join(ROOT, 'assets', 'js', 'cms-config.js'), 'utf8').match(/CMS_BASE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || ''; } catch {}
  if (cms) {
    try {
      const r = await fetch(cms.replace(/\/$/, '') + '/api/portfolio', { signal: AbortSignal.timeout(10000) });
      const list = r.ok ? await r.json() : [];
      for (const p of list) if (p && p.id != null) entries.push([SITE + '/project.html?id=' + p.id, SITE + '/ar/project.html?id=' + p.id]);
      console.log(`   sitemap: ${list.length} CMS projects`);
    } catch (e) { console.warn(`⚠️  sitemap: CMS projects skipped (${e.message})`); }
    try {
      const r = await fetch(cms.replace(/\/$/, '') + '/api/services', { signal: AbortSignal.timeout(10000) });
      const list = (r.ok ? await r.json() : []).filter(s => s && s.slug);
      for (const s of list) entries.push([SITE + '/services/' + s.slug, SITE + '/ar/services/' + s.slug]);
      console.log(`   sitemap: ${list.length} service pages`);
    } catch (e) { console.warn(`⚠️  sitemap: service pages skipped (${e.message})`); }
  }
  const url = (loc, en, ar, date) => `  <url>\n    <loc>${xmlEsc(loc)}</loc>\n${date ? `    <lastmod>${date}</lastmod>\n` : ''}`
    + `    <xhtml:link rel="alternate" hreflang="en" href="${xmlEsc(en)}"/>\n`
    + `    <xhtml:link rel="alternate" hreflang="ar" href="${xmlEsc(ar)}"/>\n`
    + `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEsc(en)}"/>\n  </url>`;
  const body = entries.flatMap(([en, ar, d]) => [url(en, en, ar, d), url(ar, en, ar, d)]).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + body + '\n</urlset>\n');
  console.log(`✅ sitemap.xml: ${entries.length * 2} URLs`);
}
if (mode === 'build') writeSitemap();

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
