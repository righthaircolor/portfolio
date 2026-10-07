// HTML templates. Plain template strings, no framework.
import { plain } from './content.mjs';

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function safeHref(href = '') {
  const h = String(href).trim();
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(h) && !/[\s\\]/.test(h) ? h : '';
}

const isExternal = (href) => /^https?:\/\//i.test(href);
const linkAttrs = (href) => `href="${esc(href)}"${isExternal(href) ? ' target="_blank" rel="noopener"' : ''}`;

export function inline(spans = []) {
  return spans
    .map((s) => {
      let html = esc(s.t).replace(/\n/g, '<br>');
      if (s.code) html = `<code>${html}</code>`;
      if (s.b) html = `<strong>${html}</strong>`;
      if (s.i) html = `<em>${html}</em>`;
      if (s.s) html = `<s>${html}</s>`;
      if (s.u) html = `<u>${html}</u>`;
      const href = safeHref(s.href);
      if (href) html = `<a ${linkAttrs(href)}>${html}</a>`;
      return html;
    })
    .join('');
}

export function blocksHtml(blocks = [], { alt = '' } = {}) {
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'li') {
      const tag = b.ordered ? 'ol' : 'ul';
      let items = '';
      while (i < blocks.length && blocks[i].type === 'li' && blocks[i].ordered === b.ordered) {
        const it = blocks[i];
        items += `<li>${inline(it.rich)}${it.children?.length ? blocksHtml(it.children, { alt }) : ''}</li>`;
        i++;
      }
      i--;
      html += `<${tag}>${items}</${tag}>`;
      continue;
    }
    switch (b.type) {
      case 'p':
        html += `<p>${inline(b.rich)}</p>`;
        break;
      case 'h':
        html += `<h${b.level + 2}>${inline(b.rich)}</h${b.level + 2}>`;
        break;
      case 'quote':
        html += `<blockquote>${inline(b.rich)}${blocksHtml(b.children, { alt })}</blockquote>`;
        break;
      case 'callout':
        html += `<div class="callout">${inline(b.rich)}${blocksHtml(b.children, { alt })}</div>`;
        break;
      case 'image':
        if (b.src) {
          const caption = plain(b.caption);
          html += `<figure><img src="${esc(b.src)}" alt="${esc(caption || alt)}" loading="lazy">${caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''}</figure>`;
        }
        break;
      case 'hr':
        html += '<hr>';
        break;
    }
  }
  return html;
}

// Text of the first lines under a heading on «Главная».
const fieldText = (blocks = []) => blocks.map((b) => plain(b.rich || [])).join(' ').trim();
const fieldHref = (blocks = []) => {
  for (const b of blocks) for (const s of b.rich || []) if (s.href) return s.href;
  return fieldText(blocks);
};

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(title, used) {
  const base =
    title.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
      .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'project';
  let slug = base, n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function projectTitle(p) {
  return `${p.marker ? `<span class="marker">${esc(p.marker)}</span> ` : ''}${esc(p.title)}`;
}

// A row opens the side panel if the project page has content; otherwise it goes straight to «Ссылка».
function titleCell(p) {
  if (p.content.length) return `<a href="#${p.slug}" data-case="${p.slug}">${projectTitle(p)}</a>`;
  const href = safeHref(p.link);
  if (href) return `<a ${linkAttrs(href)}>${projectTitle(p)}${isExternal(href) ? ' ↗' : ''}</a>`;
  return projectTitle(p);
}

const meta = (value, cls = '') => `<td class="meta${cls}${value ? '' : ' is-empty'}">${value ? esc(value) : '—'}</td>`;

function casePanel(p, ownTitle) {
  if (!p.content.length) return '';
  const metaLine = [p.location, p.year, p.collab && `в коллаборации: ${p.collab}`].filter(Boolean).map(esc).join(' / ');
  const href = safeHref(p.link);
  return `<dialog class="case-panel" id="${p.slug}" aria-labelledby="${p.slug}-title">
  <div class="case-top"><span>${esc(p.block === 'Своё' ? ownTitle : 'Проект')}</span><button type="button" class="case-close" aria-label="Закрыть">Закрыть ×</button></div>
  <article>
   <h2 id="${p.slug}-title">${projectTitle(p)}</h2>
   ${metaLine ? `<p class="case-meta">${metaLine}</p>` : ''}
   ${plain(p.summary).trim() ? `<p class="case-summary">${inline(p.summary)}</p>` : ''}
   <div class="case-body">${blocksHtml(p.content, { alt: p.title })}</div>
   ${href ? `<a class="case-source" ${linkAttrs(href)}>Открыть оригинал ↗</a>` : ''}
  </article>
 </dialog>`;
}

export function renderHome(model, { siteUrl = '' } = {}) {
  const h = model.home;
  const name = fieldText(h.name) || 'Ксения Анискович';
  const description = fieldText(h.description);
  const photo = (h.photo || []).find((b) => b.type === 'image' && b.src);
  const englishUrl = safeHref(fieldHref(h.englishUrl));
  const visibleCount = Math.max(1, parseInt(fieldText(h.visibleCount), 10) || 10);

  const used = new Set();
  const projects = model.projects.map((p) => ({ ...p, slug: slugify(p.title, used) }));
  const main = projects.filter((p) => p.block !== 'Своё');
  const own = projects.filter((p) => p.block === 'Своё');

  const lines = (blocks = []) => blocks.map((b) => (b.type === 'image' ? '' : `<p>${inline(b.rich)}</p>`)).join('');

  const experience = model.experience.length
    ? `<section class="experience" aria-labelledby="experience-title">
    <h2 id="experience-title">${esc(fieldText(h.experienceTitle) || 'Опыт')}</h2>
    <ul>${model.experience.map((e) => `<li><span class="years">${esc(e.years || '—')}</span><span>${inline(e.role)}</span></li>`).join('')}</ul>
   </section>`
    : '';

  const projectRows = main
    .map((p, i) => `<tr${i >= visibleCount ? ' class="is-extra"' : ''}><td class="title">${titleCell(p)}</td>${meta(p.location)}${meta(p.year)}${meta(p.collab, ' collab')}</tr>`)
    .join('\n      ');

  const ownRows = own
    .map((p) => `<tr><td class="title">${titleCell(p)}</td><td class="desc" colspan="3">${inline(p.summary)}</td></tr>`)
    .join('\n      ');

  const cols = '<colgroup><col class="c-title"><col class="c-location"><col class="c-year"><col class="c-collab"></colgroup>';
  const ogImage = photo && siteUrl ? `<meta property="og:image" content="${esc(siteUrl.replace(/\/$/, '') + '/' + photo.src)}">` : '';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
${description ? `<meta name="description" content="${esc(description)}">\n<meta property="og:description" content="${esc(description)}">` : ''}
<meta property="og:title" content="${esc(name)}">
${ogImage}
<link rel="icon" href="favicon.svg">
<link rel="preload" href="fonts/manrope-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<header class="site-header">
 <a class="site-name" href="./">${esc(name)}</a>
 ${englishUrl ? `<a href="${esc(englishUrl)}" lang="en" hreflang="en">EN</a>` : '<details class="lang-soon"><summary aria-label="English version">EN</summary><p lang="en">English version is coming soon.</p></details>'}
</header>
<main class="grid">
 <aside class="left">
  ${photo ? `<img class="portrait" src="${esc(photo.src)}" alt="${esc(name)}">` : ''}
  <div class="sidebar-text">${lines(h.sidebarText)}</div>
  ${h.contacts?.length ? `<div class="contacts">${lines(h.contacts)}</div>` : ''}
  ${h.links?.length ? `<nav class="side-links" aria-label="Ссылки">${lines(h.links)}</nav>` : ''}
  ${experience}
 </aside>
 <div class="right">
  <section class="intro" aria-label="Обо мне">${lines(h.intro)}</section>
  ${main.length ? `<section class="projects" aria-label="Проекты">
   <table>${cols}
    <thead><tr><th scope="col">Проект</th><th scope="col">Локация</th><th scope="col">Год</th><th scope="col">В коллаборации</th></tr></thead>
    <tbody>
      ${projectRows}
    </tbody>
   </table>
   ${h.projectsNote?.length ? `<div class="projects-note">${lines(h.projectsNote)}</div>` : ''}
   ${main.length > visibleCount ? `<button type="button" class="more" data-more="${esc(fieldText(h.moreLabel) || 'Ещё проекты')}" data-less="${esc(fieldText(h.lessLabel) || 'Свернуть')}" aria-expanded="false">${esc(fieldText(h.moreLabel) || 'Ещё проекты')}</button>` : ''}
  </section>` : ''}
  ${own.length ? `<section class="projects own" aria-label="${esc(fieldText(h.ownTitle) || 'Своё')}">
   <table>${cols}
    <thead><tr><th scope="col">${esc(fieldText(h.ownTitle) || 'Своё')}</th><th colspan="3"></th></tr></thead>
    <tbody>
      ${ownRows}
    </tbody>
   </table>
  </section>` : ''}
 </div>
</main>
${projects.map((p) => casePanel(p, fieldText(h.ownTitle) || 'Своё')).join('\n')}
<script src="site.js" defer></script>
</body>
</html>
`;
}
