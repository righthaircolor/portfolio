// Turns raw Notion API objects into a small, plain content model.
// The same model is stored in fixtures/content.json for offline previews.

// Headings on the «Главная» page → field names used by the templates.
// Matching ignores case, quotes and punctuation, so «Опыт» and "Опыт" both work.
export const HOME_FIELDS = {
  'имя': 'name',
  'главное высказывание': 'intro',
  'фото': 'photo',
  'текст под фото': 'sidebarText',
  'контакты': 'contacts',
  'ссылки под текстом': 'links',
  'заголовок блока опыт': 'experienceTitle',
  'подпись под таблицей проектов': 'projectsNote',
  'кнопка ещё проекты': 'moreLabel',
  'кнопка свернуть': 'lessLabel',
  'сколько проектов показывать сразу': 'visibleCount',
  'заголовок блока своё': 'ownTitle',
  'ссылка на английскую версию': 'englishUrl',
  'описание для поисковиков и соцсетей': 'description',
};

export const normalizeHeading = (s) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'“”„:.!?()]/g, '').replace(/\s+/g, ' ').trim();

const FIELD_BY_NORMALIZED = Object.fromEntries(
  Object.entries(HOME_FIELDS).map(([k, v]) => [normalizeHeading(k), v])
);

export function spans(richText = []) {
  return richText
    .map((r) => {
      const a = r.annotations || {};
      const span = { t: r.plain_text ?? r.text?.content ?? '' };
      const href = r.href || r.text?.link?.url;
      if (href) span.href = href;
      if (a.bold) span.b = true;
      if (a.italic) span.i = true;
      if (a.strikethrough) span.s = true;
      if (a.underline) span.u = true;
      if (a.code) span.code = true;
      return span;
    })
    .filter((s) => s.t);
}

export const plain = (sp = []) => sp.map((s) => s.t).join('');

function fileUrl(f) {
  if (!f) return '';
  return f.type === 'external' ? f.external?.url : f.file?.url;
}

// One Notion block → zero or more model blocks.
export function convertBlock(block) {
  const data = block[block.type] || {};
  const kids = () => (block.children || []).flatMap(convertBlock);
  switch (block.type) {
    case 'paragraph':
      return [{ type: 'p', rich: spans(data.rich_text) }, ...kids()];
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return [{ type: 'h', level: Number(block.type.slice(-1)), rich: spans(data.rich_text) }, ...(data.is_toggleable ? kids() : [])];
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do':
      return [{ type: 'li', ordered: block.type === 'numbered_list_item', rich: spans(data.rich_text), children: kids() }];
    case 'quote':
      return [{ type: 'quote', rich: spans(data.rich_text), children: kids() }];
    case 'callout':
      return [{ type: 'callout', rich: spans(data.rich_text), children: kids() }];
    case 'toggle':
      return [{ type: 'p', rich: spans(data.rich_text) }, ...kids()];
    case 'image':
      return [{ type: 'image', id: block.id, src: fileUrl(data), caption: spans(data.caption) }];
    case 'video':
    case 'embed':
    case 'bookmark':
    case 'link_preview':
    case 'file':
    case 'pdf': {
      const url = data.url || fileUrl(data);
      return url ? [{ type: 'p', rich: [{ t: plain(spans(data.caption)) || url, href: url }] }] : [];
    }
    case 'divider':
      return [{ type: 'hr' }];
    case 'column_list':
    case 'column':
    case 'synced_block':
      return kids();
    default:
      return [];
  }
}

// «Главная»: blocks are grouped under the heading that precedes them.
export function parseHome(blocks) {
  const home = {};
  const unknown = [];
  let current = null;
  for (const block of blocks) {
    if (block.type.startsWith('heading_')) {
      const title = plain(spans(block[block.type].rich_text));
      current = FIELD_BY_NORMALIZED[normalizeHeading(title)] || null;
      if (current) home[current] = [];
      else unknown.push(title);
      continue;
    }
    if (current) home[current].push(...convertBlock(block));
  }
  // Drop empty paragraphs so «пусто под заголовком» really means empty.
  for (const key of Object.keys(home)) {
    home[key] = home[key].filter((b) => b.type !== 'p' || plain(b.rich).trim());
  }
  return { home, unknown };
}

function prop(page, name) {
  const p = page.properties?.[name];
  if (!p) return undefined;
  switch (p.type) {
    case 'title':
      return spans(p.title);
    case 'rich_text':
      return spans(p.rich_text);
    case 'number':
      return p.number;
    case 'checkbox':
      return p.checkbox;
    case 'select':
      return p.select?.name || '';
    case 'url':
      return p.url || '';
    default:
      return undefined;
  }
}

const text = (v) => (Array.isArray(v) ? plain(v).trim() : (v ?? '').toString().trim());

export function parseExperience(pages) {
  return pages.map((page) => ({
    role: prop(page, 'Роль и место') || [],
    years: text(prop(page, 'Годы')),
  }));
}

export function parseProject(page, blocks) {
  return {
    id: page.id,
    title: text(prop(page, 'Название')) || 'Без названия',
    marker: text(prop(page, 'Отметка')),
    location: text(prop(page, 'Локация')),
    year: text(prop(page, 'Год')),
    collab: text(prop(page, 'В коллаборации')),
    summary: prop(page, 'Кратко') || [],
    link: text(prop(page, 'Ссылка')),
    block: text(prop(page, 'Блок')) || 'Проекты',
    content: blocks.flatMap(convertBlock).filter((b) => !(b.type === 'p' && !plain(b.rich).trim())),
  };
}

const visibleFilter = { property: 'Показывать', checkbox: { equals: true } };
const orderSort = [{ property: 'Порядок', direction: 'ascending' }];

export async function loadFromNotion(client, ids) {
  const [homeBlocks, experiencePages, projectPages] = await Promise.all([
    client.blockTree(ids.home),
    client.query(ids.experience, { filter: visibleFilter, sorts: orderSort }),
    client.query(ids.projects, { filter: visibleFilter, sorts: orderSort }),
  ]);
  const { home, unknown } = parseHome(homeBlocks);
  if (unknown.length) console.warn('Незнакомые заголовки на «Главной» (пропущены):', unknown.join(', '));

  const projects = [];
  for (const page of projectPages) {
    projects.push(parseProject(page, await client.blockTree(page.id)));
  }
  return { home, experience: parseExperience(experiencePages), projects };
}
