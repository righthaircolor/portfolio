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
let lastTrigger = null;
function openCase(id, trigger) {
  const dialog = document.getElementById(id);
  if (!dialog || dialog.tagName !== 'DIALOG' || dialog.open) return;
  lastTrigger = trigger || null;
  document.querySelectorAll('dialog.case-panel[open]').forEach((d) => d.close());
  dialog.showModal();
  dialog.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
}
document.querySelectorAll('dialog.case-panel').forEach((dialog) => {
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
    if (location.hash === '#' + dialog.id) history.replaceState(null, '', location.pathname + location.search);
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
