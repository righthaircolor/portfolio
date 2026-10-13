document.documentElement.classList.add('js');

// «Ещё проекты» / «Свернуть»
document.querySelectorAll('.more').forEach((button) => {
  button.addEventListener('click', () => {
    const section = button.closest('.projects');
    const open = section.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? button.dataset.less : button.dataset.more;
    if (!open) section.scrollIntoView({ block: 'start' });
  });
});

// Case side panels: rows link to #slug; the panel is a <dialog> with that id.
// While a panel is open the page behind it shows its first screen (photo and text about me),
// wherever the list was scrolled to; closing the panel returns to the same place in the list.
let lastTrigger = null;
let savedScroll = null;
function openCase(id, trigger) {
  const dialog = document.getElementById(id);
  if (!dialog || dialog.tagName !== 'DIALOG' || dialog.open) return;
  lastTrigger = trigger || null;
  if (savedScroll === null) savedScroll = window.scrollY;
  document.querySelectorAll('dialog.case-panel[open]').forEach((d) => d.close());
  window.scrollTo({ top: 0, behavior: 'instant' });
  dialog.showModal();
  dialog.querySelector('article')?.focus({ preventScroll: true });
  dialog.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
}
document.querySelectorAll('dialog.case-panel').forEach((dialog) => {
  dialog.addEventListener('close', () => {
    if (document.querySelector('dialog.case-panel[open]')) return; // switched to another case
    document.body.style.overflow = '';
    if (location.hash === '#' + dialog.id) history.replaceState(null, '', location.pathname + location.search);
    if (savedScroll !== null) window.scrollTo({ top: savedScroll, behavior: 'instant' });
    savedScroll = null;
    lastTrigger?.focus({ preventScroll: true });
  });
  dialog.querySelector('.case-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
});
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-case]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openCase(link.dataset.case, link);
});
if (location.hash.length > 1) {
  const id = decodeURIComponent(location.hash.slice(1));
  const extra = document.querySelector(`a[data-case="${CSS.escape(id)}"]`)?.closest('.is-extra');
  if (extra) extra.closest('.projects')?.querySelector('.more')?.click();
  openCase(id);
}

// Magic wand: a trail of sparks and a burst on click (mouse only).
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let last = 0, lastX = -100, lastY = -100;
  function add(e, className, lifetime) {
    const el = document.createElement('span');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    el.style.left = e.clientX + 'px';
    el.style.top = e.clientY + 'px';
    (e.target instanceof Element && e.target.closest('dialog[open]') || document.body).appendChild(el);
    setTimeout(() => el.remove(), lifetime);
    return el;
  }
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduced.matches) return;
    const now = performance.now();
    if (now - last < 22 || Math.hypot(e.clientX - lastX, e.clientY - lastY) < 4) return;
    last = now; lastX = e.clientX; lastY = e.clientY;
    add(e, 'wand-trail', 650);
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || reduced.matches) return;
    const burst = add(e, 'wand-burst', 750);
    for (let i = 0; i < 14; i++) {
      const dot = document.createElement('i');
      const angle = (i * Math.PI * 2) / 14, radius = i % 2 ? 42 : 60;
      dot.style.setProperty('--dx', Math.cos(angle) * radius + 'px');
      dot.style.setProperty('--dy', Math.sin(angle) * radius + 'px');
      burst.appendChild(dot);
    }
  }, { passive: true });
})();

// «Кейсы и наблюдения»: rubrics filter the list and the feed (the rubric is kept in the address, #stati);
// a title in the list scrolls the feed to its card; the card in view is highlighted in the list.
(() => {
  const rubricLinks = [...document.querySelectorAll('.j-rubrics a[data-rubric]')];
  if (!rubricLinks.length) return;
  const items = [...document.querySelectorAll('.j-list li, .j-feed .card')];
  const cards = [...document.querySelectorAll('.j-feed .card')];
  const listLinks = [...document.querySelectorAll('.j-list a[data-card]')];
  const empty = document.querySelector('.j-empty');
  const spy = () => {
    const visible = cards.filter((c) => !c.hidden);
    let current = visible[0];
    for (const c of visible) if (c.getBoundingClientRect().top < innerHeight * 0.35) current = c;
    listLinks.forEach((a) => a.classList.toggle('is-current', !!current && a.dataset.card === current.id));
  };
  const apply = () => {
    const wanted = decodeURIComponent(location.hash.slice(1));
    const current = rubricLinks.some((a) => a.dataset.rubric === wanted) ? wanted : '';
    rubricLinks.forEach((a) => (a.dataset.rubric === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    items.forEach((el) => { el.hidden = !!current && el.dataset.rubric !== current; });
    if (empty) empty.hidden = cards.some((c) => !c.hidden);
    spy();
  };
  rubricLinks.forEach((a) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.pushState(null, '', a.dataset.rubric ? '#' + a.dataset.rubric : location.pathname + location.search);
    window.scrollTo({ top: 0 });
    apply();
  }));
  listLinks.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.card)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  addEventListener('scroll', spy, { passive: true });
  addEventListener('load', spy);
  addEventListener('popstate', apply);
  addEventListener('hashchange', apply);
  apply();
})();

// «Закрыть ×» on free pages also works with Esc.
if (document.body.classList.contains('free-page') || document.body.classList.contains('journal-page')) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) location.href = document.querySelector('.page-close')?.href || '../';
  });
}
