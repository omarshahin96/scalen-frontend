/* =============================================
   SHARED JS — runs on every page
============================================= */

/* --- Loader --- */
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
  }, 400);
});

/* --- Sticky header --- */
const header = document.getElementById('header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 60);
  });
}

/* --- Scroll to top button --- */
const scrollTopBtn = document.getElementById('scrollTop');
if (scrollTopBtn) {
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('show', window.scrollY > 400);
  });
  scrollTopBtn.addEventListener('click', () => window.scrollTo({ top:0, behavior:'smooth' }));
}

/* --- Mobile nav --- */
// Pages use either <button class="ham" id="ham"> or <button class="hamburger" onclick="openNav()">
const ham    = document.getElementById('ham') || document.querySelector('.hamburger');
const mobNav = document.getElementById('mobNav');
const mobOv  = document.getElementById('mobOverlay');

function openNav()  {
  if (!ham || !mobNav || !mobOv) return;
  ham.classList.add('open');
  mobNav.classList.add('open');
  mobOv.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeNav() {
  if (!ham || !mobNav || !mobOv) return;
  ham.classList.remove('open');
  mobNav.classList.remove('open');
  mobOv.classList.remove('open');
  document.body.style.overflow = '';
}
if (ham && !ham.hasAttribute('onclick')) ham.addEventListener('click', () => mobNav.classList.contains('open') ? closeNav() : openNav());
if (mobOv) mobOv.addEventListener('click', closeNav);

/* Expose closeNav globally for onclick in mobile links */
window.closeNav = closeNav;

/* --- Language switch keeps the current query string (e.g. project.html?id=3) --- */
document.querySelectorAll('a[data-lang-switch]').forEach(a => {
  if (location.search || location.hash) a.href = a.getAttribute('href').split(/[?#]/)[0] + location.search + location.hash;
});

/* --- Set active nav link based on current page --- */
(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-menu a, .mob-nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const hPage = href.split('/').pop();
    if (hPage === page || (page === '' && hPage === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

/* --- Scroll Reveal (IntersectionObserver) — reliable across file:// and http:// --- */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  els.forEach(el => obs.observe(el));

  /* Safety fallback: show everything after 3s in case observer fails */
  setTimeout(() => {
    document.querySelectorAll('.reveal:not(.in-view)').forEach(el => el.classList.add('in-view'));
  }, 3000);
})();

/* --- Counter animation --- */
(function () {
  const counters = document.querySelectorAll('.counter');
  if (!counters.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el     = entry.target;
        const target = +el.dataset.target;
        const dur    = 1800;
        const step   = 16;
        const inc    = target / (dur / step);
        let cur      = 0;
        const timer  = setInterval(() => {
          cur += inc;
          if (cur >= target) { el.textContent = target.toLocaleString(); clearInterval(timer); }
          else               { el.textContent = Math.floor(cur).toLocaleString(); }
        }, step);
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => obs.observe(el));
})();

/* --- Skill bars --- */
(function () {
  const bars = document.querySelectorAll('.skill-fill');
  if (!bars.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.width = entry.target.dataset.w || entry.target.style.getPropertyValue('--w');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  bars.forEach(el => obs.observe(el));
})();

/* --- Portfolio filter (if exists) --- */
(function () {
  const btns  = document.querySelectorAll('.pf-btn');
  const cards = document.querySelectorAll('.pf-card');
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;

      cards.forEach(card => {
        const show = f === 'all' || card.dataset.filter === f;
        card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        if (show) {
          card.style.display = '';
          setTimeout(() => { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }, 10);
        } else {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          setTimeout(() => { card.style.display = 'none'; }, 360);
        }
      });
    });
  });
})();

/* --- Lead form (homepage) — sends to the CMS → Dashboard → Leads ---
   The contact page has its own form script; this one only handles forms marked data-lead-form. */
(function () {
  const form = document.querySelector('form[data-lead-form]');
  if (!form) return;
  const AR = /^ar\b/i.test(document.documentElement.lang || '');
  const T = AR ? {
    sending: 'جارٍ الإرسال…', sent: 'تم إرسال رسالتك. سنتواصل معك خلال 24 ساعة.',
    required: 'يرجى كتابة اسمك وبريدك الإلكتروني.', failed: 'عذرًا، لم نتمكن من إرسال رسالتك. يرجى المحاولة مرة أخرى أو مراسلتنا على hello@scalen.marketing.'
  } : {
    sending: 'Sending…', sent: "Thanks — your message is in. We'll get back to you within 24 hours.",
    required: 'Please enter your name and email.', failed: "Sorry, your message couldn't be sent. Please try again, or email us at hello@scalen.marketing."
  };
  const btn  = form.querySelector('button[type="submit"]');
  const note = form.querySelector('.form-note');
  const val  = n => ((form.elements[n] && form.elements[n].value) || '').trim();
  const say  = (msg, cls) => { if (note) { note.textContent = msg; note.className = 'form-note ' + (cls || ''); } };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = val('name'), email = val('email');
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say(T.required, 'err'); return; }
    const sel = form.elements.service;
    const service = sel && sel.value ? sel.options[sel.selectedIndex].text : '';
    const extra = [service && 'Service: ' + service, AR && 'Language: Arabic'].filter(Boolean).join(' | ');
    const orig = btn.innerHTML;
    btn.disabled = true; btn.textContent = T.sending; say('');
    try {
      const base = (window.CMS_BASE || '').replace(/\/$/, '');
      const r = await fetch(base + '/leads/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone: val('phone'),
          subject: 'Website enquiry (homepage)',
          message: (extra ? extra + '\n\n' : '') + val('message')
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '');
      form.reset();
      say(T.sent, 'ok');
      if (window.dataLayer) window.dataLayer.push({ event: 'generate_lead', form: 'homepage' });
    } catch (err) {
      say(err && err.message && !/fetch/i.test(err.message) ? err.message : T.failed, 'err');
    } finally {
      btn.disabled = false; btn.innerHTML = orig;
    }
  });
})();
