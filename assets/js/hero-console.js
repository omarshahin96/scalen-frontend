/* Homepage hero "campaign console".
   - Counts the cost-per-lead figure down from $17.00 to $3.80 while the chart line draws.
   - Cycles the lead feed: a new lead slides in on top, the oldest leaves.
   The page is complete without this file (the HTML holds the final frame); everything here
   is skipped for reduced motion, and the feed only runs while the hero is on screen. */
(function () {
  const root = document.getElementById('heroConsole');
  if (!root) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // ── Count down, in step with the line (CSS: .45s delay, 1.5s draw) ──
  const num = document.getElementById('hcNum');
  if (num) {
    const final = num.textContent;
    const from = 17, to = 3.8, delay = 450, dur = 1500;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const fmt = v => '$' + v.toFixed(2);
    num.textContent = fmt(from);
    const t0 = performance.now() + delay;
    const tick = now => {
      const t = Math.min(1, Math.max(0, (now - t0) / dur));
      num.textContent = t >= 1 ? final : fmt(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Lead feed ──
  const feed = document.getElementById('hcFeed');
  const tpl = document.getElementById('hcMore');
  if (!feed || !tpl) return;
  const pool = [...tpl.children];
  let i = 0, timer = null, visible = true;

  function next() {
    const item = pool[i++ % pool.length].cloneNode(true);
    item.classList.add('is-new');
    const last = feed.lastElementChild;
    if (last && feed.children.length >= 2) {
      last.classList.add('is-out');
      last.addEventListener('animationend', () => last.remove(), { once: true });
      setTimeout(() => last.remove(), 600);   // in case animationend never fires
    }
    feed.prepend(item);
  }
  function start() { if (!timer && visible && !document.hidden) timer = setInterval(next, 3400); }
  function stop() { clearInterval(timer); timer = null; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0.2 }).observe(root);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  // first new lead after the intro has finished
  setTimeout(start, 3200);
})();
