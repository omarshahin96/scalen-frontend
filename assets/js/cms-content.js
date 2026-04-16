/**
 * cms-content.js — Fetches CMS content and injects it into every page.
 * Falls back silently to hardcoded HTML if CMS is offline.
 * Also provides an Elementor-like inline editing mode.
 */
(function () {
  'use strict';
  const CMS_BASE = (typeof window !== 'undefined' && window.CMS_BASE) ? window.CMS_BASE.replace(/\/$/, '') : 'http://localhost:3000';
  const SVC_ICON_CLASSES = ['si-1','si-2','si-3','si-4','si-5','si-6'];

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function page() { return window.location.pathname; }

  // Stamp data- attributes on an element for inline editing
  function stamp(el, section, path, raw, type) {
    if (!el) return;
    el.dataset.section = section;
    el.dataset.path    = path;
    el.dataset.raw     = String(raw == null ? '' : raw);
    if (type) el.dataset.type = type;
  }
  function stampId(el, table, id, path, raw) {
    if (!el) return;
    el.dataset.section = 'db:' + table;
    el.dataset.id      = id;
    el.dataset.path    = path;
    el.dataset.raw     = String(raw == null ? '' : raw);
  }

  function pfFilterKey(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('seo'))    return 'seo';
    if (c.includes('social')) return 'social';
    if (c.includes('web'))    return 'web';
    if (c.includes('ppc'))    return 'ppc';
    return c.replace(/[^a-z0-9]/g, '-');
  }

  // ─── Theme: inject CSS vars + Google Fonts ───────────────────────────────────
  // ─── Tracking: GTM / GA4 / Meta Pixel ──────────────────────────────────────
  function applyTracking(tracking) {
    if (!tracking) return;

    // GTM head code (replaces placeholder script in <head>)
    if (tracking.gtm_head) {
      const placeholder = document.getElementById('gtm-head-code');
      const frag = document.createRange().createContextualFragment(tracking.gtm_head);
      if (placeholder) { placeholder.replaceWith(frag); }
      else { document.head.insertAdjacentHTML('beforeend', tracking.gtm_head); }
    }

    // GTM body noscript (replaces placeholder noscript after <body>)
    if (tracking.gtm_body) {
      const placeholder = document.getElementById('gtm-body-code');
      const frag = document.createRange().createContextualFragment(tracking.gtm_body);
      if (placeholder) { placeholder.replaceWith(frag); }
      else { document.body.insertAdjacentHTML('afterbegin', tracking.gtm_body); }
    }

    // Meta Pixel (injected into <head>)
    if (tracking.meta_pixel) {
      document.head.insertAdjacentHTML('beforeend', tracking.meta_pixel);
    }

    // Any custom head snippet
    if (tracking.custom_head) {
      document.head.insertAdjacentHTML('beforeend', tracking.custom_head);
    }
  }

  function applyTheme(theme) {
    if (!theme) return;
    const hf = theme.heading_font || '';
    const bf = theme.body_font    || '';
    if (hf || bf) {
      const families = [];
      if (hf) families.push(encodeURIComponent(hf) + ':wght@400;600;700;800');
      if (bf) families.push(encodeURIComponent(bf) + ':wght@300;400;500;600;700;800;900');
      if (!document.getElementById('cms-fonts-link')) {
        const link = document.createElement('link');
        link.id = 'cms-fonts-link'; link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + families.join('&family=') + '&display=swap';
        document.head.appendChild(link);
      }
    }
    const vars = [
      theme.color_bg       && `--bg:${theme.color_bg}`,
      theme.color_bg_card  && `--bg-card:${theme.color_bg_card}`,
      theme.color_bg_card  && `--bg-dark:${theme.color_bg_card}`,
      theme.color_blue     && `--blue:${theme.color_blue}`,
      theme.color_blue_lt  && `--blue-lt:${theme.color_blue_lt}`,
      theme.color_green    && `--green:${theme.color_green}`,
      theme.color_pink     && `--pink:${theme.color_pink}`,
      theme.color_orange   && `--orange:${theme.color_orange}`,
      theme.color_purple   && `--purple:${theme.color_purple}`,
      theme.color_grey     && `--grey:${theme.color_grey}`,
      theme.color_grey_lt  && `--grey-lt:${theme.color_grey_lt}`,
      theme.border_opacity && `--border:rgba(255,255,255,${theme.border_opacity})`,
      hf && `--font-h:'${hf}',sans-serif`,
      bf && `--font-b:'${bf}',sans-serif`,
    ].filter(Boolean).join(';');
    if (vars) {
      let el = document.getElementById('cms-theme-vars');
      if (!el) { el = document.createElement('style'); el.id = 'cms-theme-vars'; document.head.appendChild(el); }
      el.textContent = `:root{${vars}}`;
    }
  }

  // ─── Site: logo + nav CTA + title + footer ─────────────────────────────────
  function applySite(site) {
    if (!site) return;
    const name = site.site_name || '';

    // Logo image
    if (site.logo) {
      document.querySelectorAll('.logo img').forEach(img => { img.src = site.logo; if (name) img.alt = name; });
    }
    // Logo text fallback (if no img)
    if (name) {
      document.querySelectorAll('.logo-text,.logo span').forEach(el => { el.textContent = name; });
    }

    // Nav CTA button
    if (site.nav_cta_text) {
      document.querySelectorAll('a.nav-cta').forEach(a => { a.textContent = site.nav_cta_text; if (site.nav_cta_url) a.href = site.nav_cta_url; });
      document.querySelectorAll('.mob-nav .btn-blue').forEach(a => { a.textContent = site.nav_cta_text; if (site.nav_cta_url) a.href = site.nav_cta_url; });
    }

    // Page <title> — keep a data-brand attribute so we can update it when name changes
    if (name) {
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const stored = titleEl.getAttribute('data-brand');
        if (stored && stored !== name) {
          document.title = document.title.split(stored).join(name);
        }
        titleEl.setAttribute('data-brand', name);
      }
    }

    // Footer copyright — update only the first <p> in .footer-bottom
    if (name) {
      const yr = new Date().getFullYear();
      const fb = document.querySelector('.footer-bottom');
      if (fb) {
        const cp = fb.querySelector('p');
        if (cp) cp.innerHTML = `&copy; ${yr} <a href="index.html" style="color:inherit">${name}</a>. All rights reserved.`;
      }
      // Also handle any .footer-copy or .copyright elements
      document.querySelectorAll('.footer-copy, .copyright').forEach(el => {
        el.textContent = `© ${yr} ${name}. All rights reserved.`;
      });
    }

    // Footer logo text
    if (name) {
      document.querySelectorAll('.footer-logo-text, .foot-brand').forEach(el => { el.textContent = name + '.'; });
    }
  }

  // ─── Shared (every page) ────────────────────────────────────────────────────
  function applyShared(hp) {
    // Marquee
    if (Array.isArray(hp.marquee) && hp.marquee.length) {
      const track = document.querySelector('.marquee-track');
      if (track) {
        const doubled = [...hp.marquee, ...hp.marquee];
        const useSpan = track.querySelector('span') && !track.querySelector('.marquee-item');
        track.innerHTML = doubled.map(item =>
          useSpan
            ? `<span>${esc(item)} <span class="mdiamond">◆</span></span>`
            : `<div class="marquee-item">${esc(item)} <span class="dot">◆</span></div>`
        ).join('');
      }
    }
    // Footer tagline + copyright
    if (hp.footer) {
      const brandP = document.querySelector('.footer-brand > p');
      if (brandP && hp.footer.tagline) { brandP.textContent = hp.footer.tagline; stamp(brandP,'footer','tagline',hp.footer.tagline); }
      const copy = document.querySelector('.footer-bottom p:first-child');
      if (copy && hp.footer.copyright) { copy.innerHTML = hp.footer.copyright; stamp(copy,'footer','copyright',hp.footer.copyright); }
    }
    // Footer contact column
    if (hp.contact) {
      const c = hp.contact;
      const ul = document.querySelector('#footer .footer-col:last-child ul');
      if (ul) {
        ul.innerHTML = [
          c.address ? `<li><a href="contact.html">${esc(c.address)}</a></li>` : '',
          c.phone   ? `<li><a href="tel:${esc(c.phone.replace(/[^+\d]/g,''))}">${esc(c.phone)}</a></li>` : '',
          c.email   ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : '',
          c.hours   ? `<li><a href="contact.html">${esc(c.hours)}</a></li>` : ''
        ].filter(Boolean).join('');
      }
    }
  }

  // ─── Homepage (index.html) ──────────────────────────────────────────────────
  function applyHomepage(hp, services, blog, portfolio, testimonials, team) {
    if (hp.hero) {
      const h = hp.hero;
      const badge = document.querySelector('#hero .hero-badge');
      if (badge && h.badge) { badge.innerHTML = `<i class="fas fa-circle-dot"></i> ${esc(h.badge)}`; stamp(badge,'hero','badge',h.badge); }
      const title = document.querySelector('#hero .hero-title');
      if (title && h.headline) { title.textContent = h.headline; stamp(title,'hero','headline',h.headline); }
      const sub = document.querySelector('#hero .hero-sub');
      if (sub && h.subtitle) { sub.textContent = h.subtitle; stamp(sub,'hero','subtitle',h.subtitle); }
      const btn1 = document.querySelector('#hero .hero-btns a:first-child');
      if (btn1 && h.btn1_text) { btn1.innerHTML = `<i class="fas fa-rocket"></i> ${esc(h.btn1_text)}`; btn1.href = h.btn1_url || '#'; stamp(btn1,'hero','btn1_text',h.btn1_text); }
      const btn2 = document.querySelector('#hero .hero-btns a:last-child');
      if (btn2 && h.btn2_text) { btn2.innerHTML = `<i class="fas fa-play-circle"></i> ${esc(h.btn2_text)}`; btn2.href = h.btn2_url || '#'; stamp(btn2,'hero','btn2_text',h.btn2_text); }
      const clientTxt = document.querySelector('#hero .client-txt strong');
      if (clientTxt && h.clients_text) { clientTxt.textContent = h.clients_text; stamp(clientTxt,'hero','clients_text',h.clients_text); }
      if (h.image) { const img = document.querySelector('.hero-img-wrap img'); if (img) { img.src = h.image; stamp(img,'hero','image',h.image,'image'); } }

      // Floating UI cards
      if (h.card1) {
        const lbl = document.querySelector('.fl-card-1 .fc-lbl');
        if (lbl && h.card1.label) { lbl.textContent = h.card1.label; stamp(lbl,'hero','card1.label',h.card1.label); }
        const ttl = document.querySelector('.fl-card-1 .fc-ttl');
        if (ttl && h.card1.title) { ttl.textContent = h.card1.title; stamp(ttl,'hero','card1.title',h.card1.title); }
        const score = document.querySelector('.fl-card-1 .fc-num');
        if (score && h.card1.score) { score.textContent = h.card1.score; stamp(score,'hero','card1.score',h.card1.score); }
        const scoreSub = document.querySelector('.fl-card-1 .fc-sub');
        if (scoreSub && h.card1.score_sub) { scoreSub.innerHTML = esc(h.card1.score_sub).replace(/\\n/g,'<br>'); stamp(scoreSub,'hero','card1.score_sub',h.card1.score_sub); }
      }
      if (h.card2) {
        const icon = document.querySelector('.fl-card-2 .fc-icon i');
        if (icon && h.card2.icon) icon.className = 'fas ' + h.card2.icon;
        const ttl2 = document.querySelector('.fl-card-2 .fc-ttl');
        if (ttl2 && h.card2.title) { ttl2.textContent = h.card2.title; stamp(ttl2,'hero','card2.title',h.card2.title); }
      }
    }

    if (Array.isArray(hp.stats)) applyStats(hp.stats);

    if (hp.about) {
      const a = hp.about;
      const titleEl = document.querySelector('#about .about-text .sec-title');
      if (titleEl && a.headline) { titleEl.innerHTML = esc(a.headline).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(titleEl,'about','headline',a.headline); }
      if (a.body) {
        const aboutText = document.querySelector('#about .about-text');
        if (aboutText) {
          aboutText.querySelectorAll('p').forEach(p => p.remove());
          const skillList = aboutText.querySelector('.skill-list');
          a.body.split('\n\n').filter(l => l.trim()).forEach(line => {
            const p = document.createElement('p');
            p.innerHTML = line;
            if (skillList) aboutText.insertBefore(p, skillList); else aboutText.appendChild(p);
          });
        }
      }
      const yrs = document.querySelector('.ab-badge-n');
      if (yrs && a.years_badge) { yrs.textContent = a.years_badge; stamp(yrs,'about','years_badge',a.years_badge); }
      const btn = document.querySelector('#about .about-text .btn');
      if (btn && a.btn_text) { btn.textContent = a.btn_text; btn.href = a.btn_url || '#'; stamp(btn,'about','btn_text',a.btn_text); }
      if (a.image1) { const img = document.querySelector('.ab-main img'); if (img) { img.src = a.image1; stamp(img,'about','image1',a.image1,'image'); } }
      if (a.image2) { const img = document.querySelector('.ab-sub img'); if (img) { img.src = a.image2; stamp(img,'about','image2',a.image2,'image'); } }
    }

    if (Array.isArray(hp.skills)) applySkills(hp.skills);
    if (Array.isArray(services) && services.length) applyServicesGrid(services, 9);
    if (Array.isArray(portfolio) && portfolio.length) applyPortfolioGrid(portfolio, 6);
    if (Array.isArray(testimonials) && testimonials.length) applyTestimonials(testimonials);
    if (Array.isArray(team) && team.length) applyTeamGrid(team);
    if (Array.isArray(blog) && blog.length) applyBlogGrid(blog, 3);

    if (hp.contact) {
      const vals = document.querySelectorAll('.cinfo-item .cinfo-val');
      const c = hp.contact;
      if (vals[0] && c.address) vals[0].textContent = c.address;
      if (vals[1] && c.phone)   vals[1].textContent = c.phone;
      if (vals[2] && c.email)   vals[2].textContent = c.email;
      if (vals[3] && c.hours)   vals[3].textContent = c.hours;
    }
  }

  // ─── about.html ─────────────────────────────────────────────────────────────
  function applyAboutPage(hp, team) {
    if (hp.about_page) {
      const h1 = document.querySelector('.page-hero h1, .page-hero-inner h1');
      if (h1 && hp.about_page.title) { h1.innerHTML = esc(hp.about_page.title).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h1,'about_page','title',hp.about_page.title); }
      const p = document.querySelector('.page-hero p, .page-hero-inner p');
      if (p && hp.about_page.description) { p.textContent = hp.about_page.description; stamp(p,'about_page','description',hp.about_page.description); }
    }
    if (hp.about_story) {
      const st = hp.about_story;
      const h2 = document.querySelector('.story-text h2');
      if (h2 && st.heading) { h2.innerHTML = esc(st.heading).replace(/\*(.+?)\*/g,'<span>$1</span>').replace(/,\s*/g,',<br>'); stamp(h2,'about_story','heading',st.heading); }
      if (st.body1 || st.body2) {
        const storyText = document.querySelector('.story-text');
        if (storyText) {
          storyText.querySelectorAll('p').forEach(p => p.remove());
          const storyList = storyText.querySelector('.story-list');
          [st.body1, st.body2].filter(Boolean).forEach(txt => {
            const p = document.createElement('p'); p.textContent = txt;
            if (storyList) storyText.insertBefore(p, storyList); else storyText.appendChild(p);
          });
        }
      }
      if (st.image) { const img = document.querySelector('.story-img img'); if (img) { img.src = st.image; stamp(img,'about_story','image',st.image,'image'); } }
      if (Array.isArray(st.items) && st.items.length) {
        const list = document.querySelector('.story-list');
        if (list) list.innerHTML = st.items.map(item => `<div class="story-li"><i class="fas fa-check-circle"></i> ${esc(item)}</div>`).join('');
      }
      const btn = document.querySelector('.story-text .btn');
      if (btn && st.btn_text) { btn.innerHTML = `<i class="fas fa-arrow-right"></i> ${esc(st.btn_text)}`; btn.href = st.btn_url || '#'; stamp(btn,'about_story','btn_text',st.btn_text); }
    }
    if (Array.isArray(hp.stats)) applyStats(hp.stats);
    if (Array.isArray(hp.about_values) && hp.about_values.length) {
      const grid = document.querySelector('.values-grid');
      if (grid) {
        const delays = ['d1','d2','d3','d1','d2','d3'];
        const icons  = ['si-1','si-2','si-3','si-4','si-5','si-6'];
        grid.innerHTML = hp.about_values.map((v, i) =>
          `<div class="val-card reveal ${delays[i]}">
            <div class="val-icon ${icons[i]}"><i class="${esc(v.icon||'fas fa-star')}"></i></div>
            <h3 data-section="about_values" data-path="${i}.title" data-raw="${esc(v.title)}">${esc(v.title)}</h3>
            <p data-section="about_values" data-path="${i}.description" data-raw="${esc(v.description)}">${esc(v.description)}</p>
          </div>`
        ).join('');
      }
    }
    if (Array.isArray(team) && team.length) applyTeamGrid(team);
    if (hp.about_cta) {
      const cta = hp.about_cta;
      const h2 = document.querySelector('.cta-inner h2');
      if (h2 && cta.heading) { h2.innerHTML = esc(cta.heading).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h2,'about_cta','heading',cta.heading); }
      const p = document.querySelector('.cta-inner > p');
      if (p && cta.description) { p.textContent = cta.description; stamp(p,'about_cta','description',cta.description); }
      const btns = document.querySelectorAll('.cta-btns a');
      if (btns[0] && cta.btn1_text) { btns[0].innerHTML = `<i class="fas fa-rocket"></i> ${esc(cta.btn1_text)}`; btns[0].href = cta.btn1_url||'#'; stamp(btns[0],'about_cta','btn1_text',cta.btn1_text); }
      if (btns[1] && cta.btn2_text) { btns[1].innerHTML = `<i class="fas fa-eye"></i> ${esc(cta.btn2_text)}`; btns[1].href = cta.btn2_url||'#'; stamp(btns[1],'about_cta','btn2_text',cta.btn2_text); }
    }
  }

  // ─── services.html ───────────────────────────────────────────────────────────
  function applyServicesPage(hp, services) {
    if (hp.services_page) {
      const h1 = document.querySelector('.page-hero h1, .page-hero-inner h1');
      if (h1 && hp.services_page.title) { h1.innerHTML = esc(hp.services_page.title).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h1,'services_page','title',hp.services_page.title); }
      const p = document.querySelector('.page-hero p, .page-hero-inner p');
      if (p && hp.services_page.description) { p.textContent = hp.services_page.description; stamp(p,'services_page','description',hp.services_page.description); }
    }
    if (Array.isArray(services) && services.length) applyServicesGrid(services, 9);
    if (Array.isArray(hp.services_featured) && hp.services_featured.length) {
      const grids = document.querySelectorAll('.svc-feature .sf-grid');
      hp.services_featured.forEach((f, i) => {
        const grid = grids[i]; if (!grid) return;
        const lbl = grid.querySelector('.label-tag'); if (lbl && f.label) { lbl.textContent = f.label; stamp(lbl,'services_featured',`${i}.label`,f.label); }
        const h3 = grid.querySelector('.sf-text h3'); if (h3 && f.heading) { h3.innerHTML = esc(f.heading).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h3,'services_featured',`${i}.heading`,f.heading); }
        const p = grid.querySelector('.sf-text > p'); if (p && f.body) { p.textContent = f.body; stamp(p,'services_featured',`${i}.body`,f.body); }
        if (f.image) { const img = grid.querySelector('.sf-img img'); if (img) { img.src = f.image; stamp(img,'services_featured',`${i}.image`,f.image,'image'); } }
        if (Array.isArray(f.features) && f.features.length) {
          const list = grid.querySelector('.sf-list');
          if (list) list.innerHTML = f.features.map(feat => `<div class="sf-li"><i class="fas fa-check-circle"></i> ${esc(feat)}</div>`).join('');
        }
        const btn = grid.querySelector('.sf-text .btn'); if (btn && f.btn_text) { btn.innerHTML = `<i class="fas fa-rocket"></i> ${esc(f.btn_text)}`; btn.href = f.btn_url||'#'; stamp(btn,'services_featured',`${i}.btn_text`,f.btn_text); }
      });
    }
    if (hp.services_pricing && Array.isArray(hp.services_pricing.plans)) {
      const pr = hp.services_pricing;
      const st = document.querySelector('.pricing-sec .sec-title');
      if (st && pr.heading) { st.innerHTML = esc(pr.heading).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(st,'services_pricing','heading',pr.heading); }
      const sp = document.querySelector('.pricing-sec .sec-head p');
      if (sp && pr.description) { sp.textContent = pr.description; stamp(sp,'services_pricing','description',pr.description); }
      const grid = document.querySelector('.pricing-grid');
      if (grid) {
        const delays = ['d1','d2','d3'];
        grid.innerHTML = pr.plans.map((plan, i) => {
          const priceHtml = plan.price === 'Custom'
            ? `<div class="price-amt" style="font-size:36px;padding-top:8px;">Custom</div>`
            : `<div class="price-amt"><span>$</span>${esc(plan.price)}</div>`;
          const feats = (plan.features||[]).map(f =>
            `<div class="price-li${f.included?'':' off'}"><i class="fas fa-${f.included?'check':'times'}"></i> ${esc(f.text)}</div>`
          ).join('');
          return `<div class="price-card${plan.popular?' popular':''} reveal ${delays[i]}">
            <div class="price-plan" data-section="services_pricing" data-path="plans.${i}.name" data-raw="${esc(plan.name)}">${esc(plan.name)}</div>
            ${priceHtml}
            <div class="price-per" data-section="services_pricing" data-path="plans.${i}.period" data-raw="${esc(plan.period)}">${esc(plan.period)}</div>
            <div class="price-list">${feats}</div>
            <a href="${esc(plan.btn_url||'#')}" class="btn ${plan.popular?'btn-blue':'btn-ghost'}" style="width:100%;justify-content:center;"
               data-section="services_pricing" data-path="plans.${i}.btn_text" data-raw="${esc(plan.btn_text)}">${esc(plan.btn_text)}</a>
          </div>`;
        }).join('');
      }
    }
    if (hp.services_cta) {
      const cta = hp.services_cta;
      const h2 = document.querySelector('.cta-inner h2');
      if (h2 && cta.heading) { h2.innerHTML = esc(cta.heading).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h2,'services_cta','heading',cta.heading); }
      const p = document.querySelector('.cta-inner > p');
      if (p && cta.description) { p.textContent = cta.description; stamp(p,'services_cta','description',cta.description); }
      const btns = document.querySelectorAll('.cta-btns a');
      if (btns[0] && cta.btn1_text) { btns[0].innerHTML = `<i class="fas fa-calendar-check"></i> ${esc(cta.btn1_text)}`; btns[0].href = cta.btn1_url||'#'; stamp(btns[0],'services_cta','btn1_text',cta.btn1_text); }
      if (btns[1] && cta.btn2_text) { btns[1].innerHTML = `<i class="fas fa-eye"></i> ${esc(cta.btn2_text)}`; btns[1].href = cta.btn2_url||'#'; stamp(btns[1],'services_cta','btn2_text',cta.btn2_text); }
    }
  }

  // ─── contact.html ─────────────────────────────────────────────────────────────
  function applyContactPage(hp) {
    if (hp.contact_page) {
      const cp = hp.contact_page;
      const lbl = document.querySelector('.page-hero .page-label, .page-label');
      if (lbl && cp.label) { lbl.textContent = cp.label; stamp(lbl,'contact_page','label',cp.label); }
      const h1 = document.querySelector('.page-hero h1');
      if (h1 && cp.title) { h1.innerHTML = esc(cp.title).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h1,'contact_page','title',cp.title); }
      const introP = document.querySelector('.contact-info > p');
      if (introP && cp.intro) { introP.textContent = cp.intro; stamp(introP,'contact_page','intro',cp.intro); }
      const fh = document.querySelector('.contact-form-wrap h3');
      if (fh && cp.form_heading) { fh.textContent = cp.form_heading; stamp(fh,'contact_page','form_heading',cp.form_heading); }
      const fp = document.querySelector('.contact-form-wrap > p');
      if (fp && cp.form_subheading) { fp.textContent = cp.form_subheading; stamp(fp,'contact_page','form_subheading',cp.form_subheading); }
      const mh = document.querySelector('.map-placeholder h3');
      if (mh && cp.map_heading) { mh.textContent = cp.map_heading; stamp(mh,'contact_page','map_heading',cp.map_heading); }
      const mp = document.querySelector('.map-placeholder p');
      if (mp && cp.map_address) { mp.textContent = cp.map_address; stamp(mp,'contact_page','map_address',cp.map_address); }
    }
    if (hp.contact_office) {
      const o = hp.contact_office;
      const cards = document.querySelectorAll('.info-card .info-card-body');
      if (cards[0] && o.address) { const p = cards[0].querySelector('p'); if (p) p.innerHTML = esc(o.address).replace(/\n/g,'<br>'); }
      if (cards[1] && (o.phone1||o.phone2)) {
        const p = cards[1].querySelector('p');
        if (p) p.innerHTML = [o.phone1?`<a href="tel:${esc(o.phone1.replace(/[^+\d]/g,''))}">${esc(o.phone1)}</a>`:'', o.phone2?`<a href="tel:${esc(o.phone2.replace(/[^+\d]/g,''))}">${esc(o.phone2)}</a>`:''].filter(Boolean).join('<br>');
      }
      if (cards[2] && (o.email1||o.email2)) {
        const p = cards[2].querySelector('p');
        if (p) p.innerHTML = [o.email1?`<a href="mailto:${esc(o.email1)}">${esc(o.email1)}</a>`:'', o.email2?`<a href="mailto:${esc(o.email2)}">${esc(o.email2)}</a>`:''].filter(Boolean).join('<br>');
      }
      if (cards[3] && (o.hours1||o.hours2)) { const p = cards[3].querySelector('p'); if (p) p.innerHTML = [esc(o.hours1||''), esc(o.hours2||'')].filter(Boolean).join('<br>'); }
    }
    if (Array.isArray(hp.contact_faqs) && hp.contact_faqs.length) {
      const wrap = document.querySelector('.faq-wrap');
      if (wrap) {
        wrap.innerHTML = hp.contact_faqs.map((faq, i) =>
          `<div class="faq-item reveal">
            <div class="faq-q" data-section="contact_faqs" data-path="${i}.question" data-raw="${esc(faq.question)}">${esc(faq.question)}<span class="faq-icon"><i class="fa fa-plus"></i></span></div>
            <div class="faq-a" data-section="contact_faqs" data-path="${i}.answer" data-raw="${esc(faq.answer)}">${esc(faq.answer)}</div>
          </div>`
        ).join('');
        wrap.querySelectorAll('.faq-q').forEach(q => {
          q.addEventListener('click', () => {
            const item = q.parentElement;
            const open = item.classList.contains('open');
            document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
            if (!open) item.classList.add('open');
          });
        });
      }
    }
    if (hp.contact_social) {
      const cs = hp.contact_social;
      const h3 = document.querySelector('.social-strip h3'); if (h3 && cs.heading) { h3.textContent = cs.heading; stamp(h3,'contact_social','heading',cs.heading); }
      const p  = document.querySelector('.social-strip p');  if (p && cs.subheading) { p.textContent = cs.subheading; stamp(p,'contact_social','subheading',cs.subheading); }
      const li = document.querySelector('.soc-link.li'); if (li && cs.linkedin)  li.href = cs.linkedin;
      const tw = document.querySelector('.soc-link.tw'); if (tw && cs.twitter)   tw.href = cs.twitter;
      const ig = document.querySelector('.soc-link.ig'); if (ig && cs.instagram) ig.href = cs.instagram;
      const fb = document.querySelector('.soc-link.fb'); if (fb && cs.facebook)  fb.href = cs.facebook;
      const fsocs = document.querySelectorAll('.footer-socs a');
      const links = [cs.linkedin, cs.twitter, cs.instagram, cs.facebook];
      fsocs.forEach((a, i) => { if (links[i] && links[i] !== '#') a.href = links[i]; });
    }
  }

  // ─── portfolio.html ──────────────────────────────────────────────────────────
  function applyPortfolioPage(hp, portfolio) {
    const pp = hp.portfolio_page || {};

    // Page hero
    if (pp.hero) {
      const h1 = document.querySelector('.page-hero h1, .page-hero-inner h1');
      if (h1 && pp.hero.title) { h1.innerHTML = esc(pp.hero.title).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h1,'portfolio_page','hero.title',pp.hero.title); }
      const p = document.querySelector('.page-hero p, .page-hero-inner p');
      if (p && pp.hero.description) { p.textContent = pp.hero.description; stamp(p,'portfolio_page','hero.description',pp.hero.description); }
    }

    // Full portfolio grid (no slice limit on portfolio page)
    if (Array.isArray(portfolio) && portfolio.length) {
      applyPortfolioGrid(portfolio);
      initPortfolioFilter();
    }

    // Case studies section header
    const rl = document.querySelector('.results-sec .label-tag');
    if (rl && pp.results_label) { rl.textContent = pp.results_label; stamp(rl,'portfolio_page','results_label',pp.results_label); }
    const rh = document.querySelector('.results-sec .sec-title');
    if (rh && pp.results_heading) { rh.innerHTML = esc(pp.results_heading).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(rh,'portfolio_page','results_heading',pp.results_heading); }
    const rd = document.querySelector('.results-sec .sec-head > p');
    if (rd && pp.results_description) { rd.textContent = pp.results_description; stamp(rd,'portfolio_page','results_description',pp.results_description); }

    // Case studies grid
    if (Array.isArray(pp.case_studies) && pp.case_studies.length) {
      const grid = document.querySelector('.results-grid');
      if (grid) {
        const delays = ['d1','d2','d3'];
        grid.innerHTML = pp.case_studies.map((c, i) => {
          const stats = (c.stats||[]).map((s, si) =>
            `<div class="rs-item">
              <div class="rs-num" data-section="portfolio_page" data-path="case_studies.${i}.stats.${si}.num" data-raw="${esc(s.num)}">${esc(s.num)}</div>
              <div class="rs-lbl" data-section="portfolio_page" data-path="case_studies.${i}.stats.${si}.label" data-raw="${esc(s.label)}">${esc(s.label)}</div>
            </div>`
          ).join('');
          return `<div class="result-card reveal ${delays[i%3]}">
            <div class="result-img">${c.image?`<img src="${esc(c.image)}" alt="" data-section="portfolio_page" data-path="case_studies.${i}.image" data-raw="${esc(c.image)}" data-type="image">`:'<div style="width:100%;height:100%;background:linear-gradient(135deg,#1a1b3a,#244cc9)"></div>'}</div>
            <div class="result-tag" data-section="portfolio_page" data-path="case_studies.${i}.tag" data-raw="${esc(c.tag)}">${esc(c.tag)}</div>
            <div class="result-ttl" data-section="portfolio_page" data-path="case_studies.${i}.title" data-raw="${esc(c.title)}">${esc(c.title)}</div>
            <div class="result-desc" data-section="portfolio_page" data-path="case_studies.${i}.description" data-raw="${esc(c.description)}">${esc(c.description)}</div>
            <div class="result-stats">${stats}</div>
            <a href="${c.slug ? 'case-study.html?slug='+esc(c.slug) : esc(c.btn_url||'#')}" class="btn btn-blue" style="margin-top:22px;width:100%;justify-content:center;"
               data-section="portfolio_page" data-path="case_studies.${i}.btn_text" data-raw="${esc(c.btn_text)}">${esc(c.btn_text)} <i class="fas fa-arrow-right"></i></a>
          </div>`;
        }).join('');
      }
    }

    // CTA
    if (pp.cta) {
      const cta = pp.cta;
      const h2 = document.querySelector('.cta-inner h2');
      if (h2 && cta.heading) { h2.innerHTML = esc(cta.heading).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h2,'portfolio_page','cta.heading',cta.heading); }
      const p = document.querySelector('.cta-inner > p');
      if (p && cta.description) { p.textContent = cta.description; stamp(p,'portfolio_page','cta.description',cta.description); }
      const btns = document.querySelectorAll('.cta-btns a');
      if (btns[0] && cta.btn1_text) { btns[0].innerHTML = `<i class="fas fa-rocket"></i> ${esc(cta.btn1_text)}`; btns[0].href = cta.btn1_url||'#'; stamp(btns[0],'portfolio_page','cta.btn1_text',cta.btn1_text); }
      if (btns[1] && cta.btn2_text) { btns[1].innerHTML = `<i class="fas fa-list"></i> ${esc(cta.btn2_text)}`; btns[1].href = cta.btn2_url||'#'; stamp(btns[1],'portfolio_page','cta.btn2_text',cta.btn2_text); }
    }
  }

  // ─── blog.html ───────────────────────────────────────────────────────────────
  function applyBlogPage(hp, posts, categories) {
    const bp = hp.blog_page || {};

    // Page hero
    if (bp.hero) {
      const h1 = document.querySelector('.page-hero h1, .page-hero-inner h1');
      if (h1 && bp.hero.title) { h1.innerHTML = esc(bp.hero.title).replace(/\*(.+?)\*/g,'<span>$1</span>'); stamp(h1,'blog_page','hero.title',bp.hero.title); }
      const p = document.querySelector('.page-hero p, .page-hero-inner p');
      if (p && bp.hero.description) { p.textContent = bp.hero.description; stamp(p,'blog_page','hero.description',bp.hero.description); }
    }

    // Blog posts grid — all published posts
    if (Array.isArray(posts) && posts.length) {
      const grid = document.querySelector('.blog-grid');
      if (grid) {
        grid.innerHTML = posts.map(p => {
          const date = p.published_at ? new Date(p.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
          const cat  = p.category_name || 'Blog';
          return `<div class="blog-card reveal">
            ${p.image?`<div class="blog-img"><img src="${esc(p.image)}" alt="${esc(p.title)}"></div>`:''}
            <div class="blog-body">
              <div class="blog-meta">
                <span class="blog-cat">${esc(cat)}</span>
                ${date?`<span class="blog-date"><i class="far fa-calendar-alt"></i> ${date}</span>`:''}
              </div>
              <h3 class="blog-ttl" data-section="db:blog_posts" data-id="${p.id}" data-path="title" data-raw="${esc(p.title)}">${esc(p.title)}</h3>
              <p class="blog-exc" data-section="db:blog_posts" data-id="${p.id}" data-path="excerpt" data-raw="${esc(p.excerpt||'')}">${esc(p.excerpt||'')}</p>
              <a href="${esc(p.slug?'post-'+p.slug+'.html':'#')}" class="blog-lnk">Read More <i class="fas fa-arrow-right"></i></a>
            </div>
          </div>`;
        }).join('');
      }
    }

    // Sidebar categories
    if (Array.isArray(categories) && categories.length) {
      const catList = document.querySelector('.cat-list');
      if (catList) catList.innerHTML = categories.map(c => `<div class="cat-item">${esc(c.name)} <span>${c.post_count||0}</span></div>`).join('');
      const tagCloud = document.querySelector('.tag-cloud');
      if (tagCloud) tagCloud.innerHTML = categories.map(c => `<span class="tag-pill">${esc(c.name)}</span>`).join('');
    }

    // Sidebar: recent posts (first 4)
    if (Array.isArray(posts) && posts.length) {
      const recentList = document.querySelector('.recent-list');
      if (recentList) {
        recentList.innerHTML = posts.slice(0,4).map(p => {
          const date = p.published_at ? new Date(p.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
          return `<div class="recent-item">
            <div class="recent-thumb">${p.image?`<img src="${esc(p.image)}" alt="">`:'<div style="width:100%;height:100%;background:linear-gradient(135deg,#244cc9,#8215FF)"></div>'}</div>
            <div>
              <a href="${esc(p.slug?'post-'+p.slug+'.html':'#')}" class="recent-ttl">${esc(p.title)}</a>
              <div class="recent-date">${date}</div>
            </div>
          </div>`;
        }).join('');
      }
    }

    // Sidebar CTA box (the blue sidebar-box with style="background:var(--blue)")
    if (bp.sidebar_cta) {
      const cta   = bp.sidebar_cta;
      const ctaEl = document.querySelector('.sidebar-box[style*="--blue"]');
      if (ctaEl) {
        const h3 = ctaEl.querySelector('h3');
        const p  = ctaEl.querySelector('p');
        const a  = ctaEl.querySelector('a');
        if (h3 && cta.heading)     { h3.textContent = cta.heading;     stamp(h3, 'blog_page', 'sidebar_cta.heading',     cta.heading); }
        if (p  && cta.description) { p.textContent  = cta.description; stamp(p,  'blog_page', 'sidebar_cta.description', cta.description); }
        if (a  && cta.btn_text)    { a.textContent  = cta.btn_text;    stamp(a,  'blog_page', 'sidebar_cta.btn_text',    cta.btn_text); }
        if (a  && cta.btn_url)     { a.href = cta.btn_url; }
      }
    }

    // Re-initialize blog filter with fresh elements
    setupBlogFilter();
  }

  // ─── Grid builders ───────────────────────────────────────────────────────────
  function applyStats(stats) {
    const counters = document.querySelectorAll('.counter[data-target]');
    stats.forEach((s, i) => {
      if (!counters[i]) return;
      const numEl = counters[i].closest('.stat-num');
      counters[i].dataset.target = s.number;
      counters[i].textContent = '0';
      if (numEl) {
        Array.from(numEl.childNodes).forEach(n => {
          if (n !== counters[i] && (n.nodeType === 3 || (n.nodeType === 1 && n.classList.contains('sfx')))) n.remove();
        });
        if (s.suffix) { const sfx = document.createElement('span'); sfx.className = 'sfx'; sfx.textContent = s.suffix; numEl.appendChild(sfx); }
      }
      const box = counters[i].closest('.stat-box');
      const lbl = box && box.querySelector('.stat-lbl');
      if (lbl && s.label) { lbl.textContent = s.label; stamp(lbl,'stats',`${i}.label`,s.label); }
    });
    initCounters();
  }

  function applySkills(skills) {
    const skillList = document.querySelector('.skill-list');
    if (!skillList) return;
    skillList.innerHTML = skills.map((sk, i) =>
      `<div class="skill-item">
        <div class="skill-top">
          <span class="skill-name" data-section="skills" data-path="${i}.name" data-raw="${esc(sk.name)}">${esc(sk.name)}</span>
          <span class="skill-pct" data-section="skills" data-path="${i}.percent" data-raw="${esc(sk.percent)}">${esc(sk.percent)}%</span>
        </div>
        <div class="skill-bg"><div class="skill-fill" style="--w:${esc(sk.percent)}%" data-w="${esc(sk.percent)}%"></div></div>
      </div>`
    ).join('');
    initSkillBars();
  }

  function applyServicesGrid(services, max) {
    const grid = document.querySelector('.svc-grid');
    if (!grid) return;
    const items = max ? services.slice(0, max) : services;
    const delays = ['d1','d2','d3'];
    grid.innerHTML = items.map((s, i) =>
      `<div class="svc-card reveal ${delays[i%3]}">
        <div class="svc-icon ${SVC_ICON_CLASSES[i%6]}"><i class="fas ${esc(s.icon||'fa-star')}"></i></div>
        <h3 data-section="db:services" data-id="${s.id}" data-path="title" data-raw="${esc(s.title)}">${esc(s.title)}</h3>
        <p data-section="db:services" data-id="${s.id}" data-path="description" data-raw="${esc(s.description||'')}">${esc(s.description||'')}</p>
        <a href="services.html" class="svc-link">Learn More <i class="fas fa-arrow-right"></i></a>
      </div>`
    ).join('');
  }

  function applyPortfolioGrid(projects, max) {
    const grid = document.querySelector('.pf-grid');
    if (!grid) return;
    const items  = (typeof max === 'number') ? projects.slice(0, max) : projects;
    const delays = ['d1','d2','d3'];
    grid.innerHTML = items.map((p, i) =>
      `<a href="project.html?id=${p.id}" class="pf-card reveal ${delays[i%3]}" data-filter="${pfFilterKey(p.category)}">
        <div class="pf-img">
          ${p.image?`<img src="${esc(p.image.startsWith('/')?CMS_BASE+p.image:p.image)}" alt="${esc(p.title)}">`:'<div style="width:100%;height:270px;background:linear-gradient(135deg,#1a1b3a,#244cc9)"></div>'}
          <div class="pf-overlay"><div class="pf-view"><i class="fas fa-arrow-right"></i></div><span>View Project</span></div>
        </div>
        <div class="pf-info">
          <div class="pf-tag" data-section="db:portfolio" data-id="${p.id}" data-path="category" data-raw="${esc(p.category||'')}">${esc(p.category||'')}</div>
          <div class="pf-name" data-section="db:portfolio" data-id="${p.id}" data-path="title" data-raw="${esc(p.title)}">${esc(p.title)}</div>
        </div>
      </a>`
    ).join('');
  }

  function applyBlogGrid(posts, max) {
    const grid = document.querySelector('.blog-grid');
    if (!grid) return;
    const items  = (typeof max === 'number') ? posts.slice(0, max) : posts;
    const delays = ['d1','d2','d3'];
    grid.innerHTML = items.map((p, i) => {
      const date = p.published_at ? new Date(p.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      return `<div class="blog-card reveal ${delays[i%3]}">
        ${p.image?`<div class="blog-img"><img src="${esc(p.image)}" alt="${esc(p.title)}"></div>`:''}
        <div class="blog-body">
          <div class="blog-meta">
            <span class="blog-cat">${esc(p.category_name||'Blog')}</span>
            ${date?`<span class="blog-date"><i class="far fa-calendar-alt"></i> ${date}</span>`:''}
          </div>
          <h3 class="blog-ttl" data-section="db:blog_posts" data-id="${p.id}" data-path="title" data-raw="${esc(p.title)}">${esc(p.title)}</h3>
          <p class="blog-exc" data-section="db:blog_posts" data-id="${p.id}" data-path="excerpt" data-raw="${esc(p.excerpt||'')}">${esc(p.excerpt||'')}</p>
          <a href="${esc(p.slug?'post-'+p.slug+'.html':'#')}" class="blog-lnk">Read More <i class="fas fa-arrow-right"></i></a>
        </div>
      </div>`;
    }).join('');
  }

  function applyTestimonials(testimonials) {
    const wrapper = document.querySelector('.swiper-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = testimonials.map(t => {
      const stars = '<i class="fas fa-star"></i>'.repeat(Math.min(5, t.rating||5));
      return `<div class="swiper-slide">
        <div class="tst-card">
          <div class="tst-q">"</div>
          <div class="tst-stars">${stars}</div>
          <p class="tst-txt" data-section="db:testimonials" data-id="${t.id}" data-path="quote" data-raw="${esc(t.quote)}">"${esc(t.quote)}"</p>
          <div class="tst-auth">
            <div class="tst-av">${t.avatar?`<img src="${esc(t.avatar)}" alt="${esc(t.name)}">`:`<div style="width:100%;height:100%;background:linear-gradient(135deg,#244cc9,#8215FF);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff">${esc(t.name[0])}</div>`}</div>
            <div>
              <div class="tst-name" data-section="db:testimonials" data-id="${t.id}" data-path="name" data-raw="${esc(t.name)}">${esc(t.name)}</div>
              <div class="tst-role" data-section="db:testimonials" data-id="${t.id}" data-path="role" data-raw="${esc(t.role||'')}">${esc(t.role||'')}${t.company?', '+esc(t.company):''}</div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function applyTeamGrid(team) {
    const grid = document.querySelector('.team-grid');
    if (!grid) return;
    const delays = ['d1','d2','d3','d4'];
    grid.innerHTML = team.map((m, i) =>
      `<div class="team-card reveal ${delays[i%4]}">
        <div class="team-photo">${m.photo?`<img src="${esc(m.photo)}" alt="${esc(m.name)}">`:`<div style="width:100%;height:100%;background:linear-gradient(135deg,#244cc9,#8215FF);display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:800;color:#fff">${esc(m.name[0])}</div>`}</div>
        <div class="team-info">
          <div class="team-name" data-section="db:team" data-id="${m.id}" data-path="name" data-raw="${esc(m.name)}">${esc(m.name)}</div>
          <div class="team-role" data-section="db:team" data-id="${m.id}" data-path="role" data-raw="${esc(m.role||'')}">${esc(m.role||'')}</div>
          <div class="team-socs">
            ${m.linkedin?`<a href="${esc(m.linkedin)}" class="tsoc"><i class="fab fa-linkedin-in"></i></a>`:''}
            ${m.twitter ?`<a href="${esc(m.twitter)}"  class="tsoc"><i class="fab fa-twitter"></i></a>`:''}
            ${m.instagram?`<a href="${esc(m.instagram)}"class="tsoc"><i class="fab fa-instagram"></i></a>`:''}
          </div>
        </div>
      </div>`
    ).join('');
  }

  // ─── Animation re-init ───────────────────────────────────────────────────────
  function initCounters() {
    const counters = document.querySelectorAll('.counter[data-target]');
    if (!counters.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target, target = parseFloat(el.dataset.target), step = target / (2000/16);
        let cur = 0;
        const t = setInterval(() => { cur += step; if (cur >= target) { cur = target; clearInterval(t); } el.textContent = Number.isInteger(target) ? Math.floor(cur) : cur.toFixed(1); }, 16);
        obs.unobserve(el);
      });
    }, { threshold: 0.3 });
    counters.forEach(c => obs.observe(c));
  }

  function initSkillBars() {
    document.querySelectorAll('.skill-fill').forEach(el => { const w = el.style.getPropertyValue('--w')||el.dataset.w||'0%'; el.dataset.w = w; el.style.setProperty('--w','0%'); });
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (!e.isIntersecting) return; e.target.style.setProperty('--w', e.target.dataset.w); obs.unobserve(e.target); });
    }, { threshold: 0.2 });
    document.querySelectorAll('.skill-fill').forEach(el => obs.observe(el));
  }

  // Re-initialize portfolio filter after CMS injection (clones buttons to clear stale refs)
  function initPortfolioFilter() {
    const container = document.querySelector('.pf-filters');
    if (!container) return;
    const fresh = container.cloneNode(true);
    container.parentNode.replaceChild(fresh, container);
    fresh.querySelectorAll('.pf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        fresh.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        document.querySelectorAll('.pf-card').forEach(card => {
          const cf = (card.dataset.filter || '').toLowerCase();
          const show = f === 'all' || cf === f;
          card.style.transition = 'opacity .35s ease, transform .35s ease';
          if (show) { card.style.display = ''; setTimeout(() => { card.style.opacity='1'; card.style.transform=''; }, 10); }
          else { card.style.opacity='0'; card.style.transform='translateY(20px)'; setTimeout(() => { card.style.display='none'; }, 360); }
        });
      });
    });
  }

  // Blog filter (re-initialized after CMS injection)
  function setupBlogFilter() {
    function norm(str) {
      str = (str||'').trim().toLowerCase();
      if (str.includes('content'))   return 'content marketing';
      if (str.includes('ppc')||str.includes('google ads')||str.includes('advertising')) return 'ppc';
      if (str.includes('brand'))     return 'brand strategy';
      if (str.includes('social'))    return 'social media';
      if (str.includes('seo'))       return 'seo';
      if (str.includes('analytics')) return 'analytics';
      return str;
    }
    let active = null;
    function applyFilter(cat) {
      active = cat;
      document.querySelectorAll('.blog-grid .blog-card').forEach(card => {
        const cardCat = norm(card.querySelector('.blog-cat')?.textContent||'');
        const show = !cat || cardCat === norm(cat);
        card.style.transition = 'opacity .3s, transform .3s';
        if (show) { card.style.display=''; setTimeout(()=>{card.style.opacity='1';card.style.transform='';},10); }
        else { card.style.opacity='0'; card.style.transform='translateY(10px)'; setTimeout(()=>{card.style.display='none';},320); }
      });
      document.querySelectorAll('.tag-pill, .cat-item').forEach(el => {
        const name = el.firstChild?.textContent?.trim() || el.textContent.trim();
        if (cat && norm(name) === norm(cat)) el.classList.add('active'); else el.classList.remove('active');
      });
    }
    document.querySelectorAll('.tag-pill, .cat-item').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.firstChild?.textContent?.trim() || el.textContent.trim();
        if (active && norm(name) === norm(active)) applyFilter(null);
        else applyFilter(name);
      });
    });
    const si = document.querySelector('.search-box input');
    const sb = document.querySelector('.search-box button');
    if (si && sb) {
      function doSearch() {
        const q = si.value.toLowerCase();
        document.querySelectorAll('.blog-grid .blog-card').forEach(card => {
          const txt = ((card.querySelector('.blog-ttl')?.textContent||'') + ' ' + (card.querySelector('.blog-exc')?.textContent||'')).toLowerCase();
          card.style.display = (!q || txt.includes(q)) ? '' : 'none';
        });
      }
      sb.addEventListener('click', doSearch);
      si.addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INLINE EDITING — Elementor-style direct-page editing
  // ═══════════════════════════════════════════════════════════════════════════
  let editMode  = false;
  let editToken = null;
  const savedChanges = [];

  function setupInlineEditor() {
    // Only show if CMS API was reachable (check if we injected anything)
    editToken = localStorage.getItem('cms_edit_token') || null;
    const trigger = document.createElement('button');
    trigger.id = 'cms-trigger';
    trigger.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Page';
    trigger.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9000;background:#244cc9;color:#fff;border:none;padding:11px 18px;border-radius:50px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(36,76,201,.5);display:flex;align-items:center;gap:8px;font-family:Urbanist,sans-serif;letter-spacing:.01em;transition:transform .2s,box-shadow .2s;';
    trigger.addEventListener('mouseenter', () => { trigger.style.transform='translateY(-2px)'; trigger.style.boxShadow='0 8px 28px rgba(36,76,201,.6)'; });
    trigger.addEventListener('mouseleave', () => { trigger.style.transform=''; trigger.style.boxShadow='0 4px 20px rgba(36,76,201,.5)'; });
    document.body.appendChild(trigger);
    trigger.addEventListener('click', () => {
      if (editMode) { disableEditMode(); return; }
      if (editToken) { enableEditMode(); } else { showAuthModal(); }
    });
  }

  function showAuthModal() {
    const overlay = document.createElement('div');
    overlay.id = 'cms-auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
    overlay.innerHTML = `
      <div style="background:#0f1128;border:1px solid rgba(36,76,201,.3);border-radius:20px;padding:40px;width:380px;max-width:90vw;font-family:Urbanist,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.6);">
        <div style="font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#3a62e8;margin-bottom:10px;">CMS INLINE EDITOR</div>
        <h2 style="font-family:Syne,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px;">Unlock Edit Mode</h2>
        <p style="color:#9fa3b8;font-size:14px;line-height:1.6;margin-bottom:24px;">Enter your CMS admin password to edit this page directly.</p>
        <input type="password" id="cms-pw" placeholder="Admin password…" style="width:100%;background:rgba(255,255,255,.06);border:1.5px solid rgba(36,76,201,.3);border-radius:12px;padding:13px 16px;color:#fff;font-size:15px;outline:none;margin-bottom:8px;font-family:Urbanist,sans-serif;transition:border-color .2s;">
        <div id="cms-pw-err" style="color:#FF4A68;font-size:13px;margin-bottom:14px;display:none;min-height:18px;"></div>
        <div style="display:flex;gap:10px;">
          <button id="cms-pw-ok"  style="flex:1;background:#244cc9;color:#fff;border:none;padding:13px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:Urbanist,sans-serif;transition:background .2s;">Unlock</button>
          <button id="cms-pw-no"  style="background:rgba(255,255,255,.06);color:#9fa3b8;border:1.5px solid rgba(255,255,255,.08);padding:13px 18px;border-radius:12px;font-size:14px;cursor:pointer;font-family:Urbanist,sans-serif;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const pw = overlay.querySelector('#cms-pw');
    pw.focus();
    pw.addEventListener('focus', () => pw.style.borderColor = '#244cc9');
    pw.addEventListener('blur',  () => pw.style.borderColor = 'rgba(36,76,201,.3)');
    overlay.querySelector('#cms-pw-no').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    async function tryAuth() {
      const errEl = overlay.querySelector('#cms-pw-err');
      const btn   = overlay.querySelector('#cms-pw-ok');
      btn.textContent = 'Checking…'; btn.disabled = true;
      try {
        const r = await fetch(CMS_BASE + '/api/inline-auth', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pw.value })
        });
        const d = await r.json();
        if (d.token) {
          localStorage.setItem('cms_edit_token', d.token);
          editToken = d.token;
          overlay.remove();
          enableEditMode();
        } else {
          errEl.textContent = d.error || 'Invalid password'; errEl.style.display='block';
          btn.textContent='Unlock'; btn.disabled=false; pw.focus();
        }
      } catch {
        errEl.textContent = 'Could not reach CMS. Is it running on localhost:3000?'; errEl.style.display='block';
        btn.textContent='Unlock'; btn.disabled=false;
      }
    }
    overlay.querySelector('#cms-pw-ok').addEventListener('click', tryAuth);
    pw.addEventListener('keydown', e => { if (e.key==='Enter') tryAuth(); });
  }

  function enableEditMode() {
    editMode = true;
    const trigger = document.getElementById('cms-trigger');
    if (trigger) { trigger.style.background='#FF4A68'; trigger.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Exit Edit'; }

    // Top notification bar
    const bar = document.createElement('div');
    bar.id = 'cms-edit-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9800;background:linear-gradient(90deg,#244cc9,#3a62e8);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:14px;font-size:13px;font-weight:600;font-family:Urbanist,sans-serif;box-shadow:0 2px 20px rgba(36,76,201,.4);';
    bar.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Edit Mode — click any <strong style="color:#85EE00">highlighted element</strong> to edit it</span><span style="flex:1"></span><button id="cms-save-all" style="background:#85EE00;color:#000;border:none;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:Urbanist,sans-serif;">Save All</button><button id="cms-exit-bar" style="background:rgba(255,255,255,.18);color:#fff;border:none;padding:7px 12px;border-radius:8px;font-size:13px;cursor:pointer;font-family:Urbanist,sans-serif;">Exit</button>`;
    document.body.prepend(bar);
    document.body.style.paddingTop = '42px';
    bar.querySelector('#cms-exit-bar').addEventListener('click', disableEditMode);
    bar.querySelector('#cms-save-all').addEventListener('click', saveAllChanges);

    // Inject edit styles
    const style = document.createElement('style');
    style.id = 'cms-edit-styles';
    style.textContent = `
      [data-section]{outline:2px dashed rgba(36,76,201,.35)!important;outline-offset:3px;cursor:pointer!important;transition:outline-color .2s,background .2s!important;position:relative;}
      [data-section]:hover{outline-color:#3a62e8!important;background:rgba(36,76,201,.06)!important;}
      [data-section][data-type="image"]:hover::after{content:"📷 Click to change image";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;pointer-events:none;z-index:999;font-family:Urbanist,sans-serif;}
    `;
    document.head.appendChild(style);

    // Attach click handler on document
    document.addEventListener('click', editClickHandler, true);
  }

  function disableEditMode() {
    editMode = false;
    const trigger = document.getElementById('cms-trigger');
    if (trigger) { trigger.style.background='#244cc9'; trigger.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Page'; }
    const bar = document.getElementById('cms-edit-bar');
    if (bar) { bar.remove(); document.body.style.paddingTop = ''; }
    const style = document.getElementById('cms-edit-styles');
    if (style) style.remove();
    document.removeEventListener('click', editClickHandler, true);
    // Close any open floating editor
    document.querySelectorAll('.cms-float-editor').forEach(e => e.remove());
  }

  function editClickHandler(e) {
    if (!editMode) return;
    // If clicking inside a floating editor, let it through
    if (e.target.closest('.cms-float-editor, #cms-auth-overlay, #cms-edit-bar')) return;

    const el = e.target.closest('[data-section]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();

    // Close existing editors
    document.querySelectorAll('.cms-float-editor').forEach(f => f.remove());

    const type = el.dataset.type || 'text';
    if (type === 'image') { showImageEditor(el); return; }

    const raw = el.dataset.raw || el.textContent.trim();
    showFloatingEditor(el, raw, newVal => {
      // Update DOM
      if (type === 'html') el.innerHTML = esc(newVal).replace(/\*(.+?)\*/g,'<span>$1</span>');
      else el.textContent = newVal;
      el.dataset.raw = newVal;
      el.style.outline = '2px solid #FC9C44';
      // Save
      doSave(el, newVal);
    });
  }

  function showFloatingEditor(anchor, currentValue, onSave) {
    const rect = anchor.getBoundingClientRect();
    const isLong = currentValue.length > 80;
    const editor = document.createElement('div');
    editor.className = 'cms-float-editor';
    const topPos = Math.max(48, rect.top + window.scrollY - (isLong ? 120 : 60));
    editor.style.cssText = `position:absolute;top:${topPos}px;left:${Math.max(8, rect.left)}px;z-index:99999;background:#0f1128;border:1.5px solid #244cc9;border-radius:12px;padding:10px;display:flex;gap:8px;box-shadow:0 12px 40px rgba(0,0,0,.7);min-width:300px;max-width:500px;font-family:Urbanist,sans-serif;`;
    const input = document.createElement(isLong ? 'textarea' : 'input');
    input.value = currentValue;
    input.style.cssText = `flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(36,76,201,.3);border-radius:8px;padding:9px 12px;color:#fff;font-size:13px;font-family:Urbanist,sans-serif;outline:none;${isLong?'height:90px;resize:vertical;':''}`;
    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    saveBtn.style.cssText = 'background:#85EE00;color:#000;border:none;width:36px;border-radius:8px;font-size:16px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
    editor.appendChild(input); editor.appendChild(saveBtn);
    document.body.appendChild(editor);
    input.focus(); if (input.select) input.select();
    function commit() { const v = input.value; if (v !== currentValue) onSave(v); editor.remove(); }
    saveBtn.addEventListener('click', commit);
    input.addEventListener('keydown', e => { if (e.key==='Enter' && !isLong) { e.preventDefault(); commit(); } if (e.key==='Escape') editor.remove(); });
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!editor.contains(e.target) && e.target !== anchor) { editor.remove(); document.removeEventListener('click', outside); }
      });
    }, 150);
  }

  function showImageEditor(el) {
    const currentSrc = el.tagName==='IMG' ? el.src : (el.querySelector('img')?.src||'');
    const modal = document.createElement('div');
    modal.className = 'cms-float-editor';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;font-family:Urbanist,sans-serif;';
    modal.innerHTML = `<div style="background:#0f1128;border:1px solid rgba(36,76,201,.3);border-radius:18px;padding:32px;width:460px;max-width:92vw;box-shadow:0 24px 60px rgba(0,0,0,.7);">
      <div style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#fff;margin-bottom:16px;">Change Image</div>
      ${currentSrc?`<img src="${esc(currentSrc)}" id="img-preview" style="width:100%;height:140px;object-fit:cover;border-radius:10px;margin-bottom:14px;border:1px solid rgba(36,76,201,.2);">`:''}
      <input type="url" id="img-url" placeholder="Paste image URL…" value="${esc(currentSrc)}" style="width:100%;background:rgba(255,255,255,.06);border:1.5px solid rgba(36,76,201,.3);border-radius:10px;padding:12px;color:#fff;font-size:14px;outline:none;margin-bottom:14px;font-family:Urbanist,sans-serif;">
      <div style="display:flex;gap:10px;">
        <button id="img-save" style="flex:1;background:#244cc9;color:#fff;border:none;padding:12px;border-radius:10px;font-weight:700;cursor:pointer;font-family:Urbanist,sans-serif;">Save</button>
        <button id="img-cancel" style="background:rgba(255,255,255,.06);color:#9fa3b8;border:1.5px solid rgba(255,255,255,.08);padding:12px 18px;border-radius:10px;cursor:pointer;font-family:Urbanist,sans-serif;">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    const urlInput = modal.querySelector('#img-url');
    urlInput.focus();
    urlInput.addEventListener('input', () => { const prev = modal.querySelector('#img-preview'); if (prev) prev.src = urlInput.value; });
    modal.querySelector('#img-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#img-save').addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        if (el.tagName==='IMG') el.src = url; else { const img = el.querySelector('img'); if (img) img.src = url; }
        el.dataset.raw = url;
        el.style.outline = '2px solid #FC9C44';
        doSave(el, url);
      }
      modal.remove();
    });
  }

  async function doSave(el, value) {
    if (!editToken) return;
    const change = { section: el.dataset.section, path: el.dataset.path, value };
    if (el.dataset.id) change.id = parseInt(el.dataset.id, 10);
    savedChanges.push(change);
    try {
      const r = await fetch(CMS_BASE + '/api/inline-save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: editToken, changes: [change] })
      });
      const d = await r.json();
      if (d.ok) { showToast('Saved ✓', '#85EE00'); }
      else if (d.error && d.error.includes('token')) {
        localStorage.removeItem('cms_edit_token'); editToken = null;
        showToast('Session expired — re-enter edit mode', '#FF4A68');
        disableEditMode();
      } else { showToast('Save failed: ' + d.error, '#FF4A68'); }
    } catch { showToast('CMS offline — change not saved', '#FC9C44'); }
  }

  async function saveAllChanges() {
    if (!editToken || !savedChanges.length) { showToast('Nothing to save', '#9fa3b8'); return; }
    try {
      const r = await fetch(CMS_BASE + '/api/inline-save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: editToken, changes: savedChanges })
      });
      const d = await r.json();
      if (d.ok) { savedChanges.length = 0; showToast(`${d.saved} changes saved!`, '#85EE00'); }
      else showToast('Error: ' + d.error, '#FF4A68');
    } catch { showToast('CMS offline', '#FC9C44'); }
  }

  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:140px;right:20px;z-index:99999;background:${color};color:${color==='#85EE00'?'#000':'#fff'};padding:11px 18px;border-radius:12px;font-size:13px;font-weight:700;font-family:Urbanist,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:fadeInToast .3s ease;pointer-events:none;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ─── Main ───────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const pg         = page();
      const isHome     = pg.endsWith('index.html') || pg.endsWith('/') || pg === '';
      const isAbout    = pg.includes('about.html');
      const isServices = pg.includes('services.html');
      const isContact  = pg.includes('contact.html');
      const isPortfolio= pg.includes('portfolio.html');
      const isBlog     = pg.includes('blog.html');

      // Parallel fetch — blog.html needs categories too
      const fetches = [
        fetch(CMS_BASE + '/api/homepage').then(r => r.json()),
        fetch(CMS_BASE + '/api/services').then(r => r.json()),
        fetch(CMS_BASE + '/api/blog' + (isHome ? '?limit=3' : '')).then(r => r.json()),
        fetch(CMS_BASE + '/api/portfolio').then(r => r.json()),
        fetch(CMS_BASE + '/api/testimonials').then(r => r.json()),
        fetch(CMS_BASE + '/api/team').then(r => r.json()),
        isBlog ? fetch(CMS_BASE + '/api/blog/categories').then(r => r.json()) : Promise.resolve([])
      ];

      const [hpR, svcR, blogR, pfR, tstR, teamR, catR] = await Promise.allSettled(fetches);

      const hp          = hpR.status   === 'fulfilled' ? hpR.value   : {};
      const services    = svcR.status  === 'fulfilled' ? svcR.value  : [];
      const blog        = blogR.status === 'fulfilled' ? blogR.value : [];
      const portfolio   = pfR.status   === 'fulfilled' ? pfR.value   : [];
      const testimonials= tstR.status  === 'fulfilled' ? tstR.value  : [];
      const team        = teamR.status === 'fulfilled' ? teamR.value : [];
      const categories  = catR.status  === 'fulfilled' ? catR.value  : [];

      applyTheme(hp.theme);
      applySite(hp.site);
      applyTracking(hp.tracking);
      applyShared(hp);

      if (isHome)      applyHomepage(hp, services, blog, portfolio, testimonials, team);
      if (isAbout)     applyAboutPage(hp, team);
      if (isServices)  applyServicesPage(hp, services);
      if (isContact)   applyContactPage(hp);
      if (isPortfolio) applyPortfolioPage(hp, portfolio);
      if (isBlog)      applyBlogPage(hp, blog, categories);

      // Show inline editor trigger if CMS was reachable
      if (hpR.status === 'fulfilled') setupInlineEditor();

    } catch (_) {
      // CMS offline — hardcoded HTML stays
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
