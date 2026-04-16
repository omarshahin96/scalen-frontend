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
const ham    = document.getElementById('ham');
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
if (ham) ham.addEventListener('click', () => mobNav.classList.contains('open') ? closeNav() : openNav());
if (mobOv) mobOv.addEventListener('click', closeNav);

/* Expose closeNav globally for onclick in mobile links */
window.closeNav = closeNav;

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

/* --- Contact form --- */
(function () {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn  = form.querySelector('.form-submit');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Message Sent!';
    btn.style.background = '#85EE00';
    btn.style.color = '#000';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = '';
      btn.style.color = '';
      form.reset();
    }, 3000);
  });
})();
