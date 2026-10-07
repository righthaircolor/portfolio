// Checks the Notion → content model → HTML pipeline against a fake Notion API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from './notion.mjs';
import { loadFromNotion } from './content.mjs';
import { renderHome } from './render.mjs';

const rt = (text, extra = {}) => [{ type: 'text', plain_text: text, href: extra.href || null, annotations: { bold: !!extra.bold, italic: false, strikethrough: false, underline: false, code: false, color: 'default' } }];
let n = 0;
const block = (type, data, children) => ({ object: 'block', id: `b${++n}`, type, has_children: !!children, [type]: data, _kids: children });
const h3 = (t) => block('heading_3', { rich_text: rt(t), is_toggleable: false });
const p = (t, extra) => block('paragraph', { rich_text: t ? rt(t, extra) : [] });
const li = (t, extra, kids) => block('bulleted_list_item', { rich_text: rt(t, extra) }, kids);
const img = (url) => block('image', { type: 'file', file: { url }, caption: [] });

const homeBlocks = [
  block('callout', { rich_text: rt('Инструкция') }),
  h3('Имя'), p('Ксения Анискович'),
  h3('Главное высказывание'), p('Превращаю идеи в концепции.'),
  h3('Фото'), img('https://files.example/photo.png?sig=1'),
  h3('Текст под фото'), p('Привет! Я — Ксения.'),
  h3('Контакты'), p('mail@example.com', { href: 'mailto:mail@example.com' }),
  h3('Ссылки под текстом'), li('Канал', { href: 'https://t.me/toright' }),
  h3('Подпись под таблицей проектов'), p(''),
  h3('Кнопка «ещё проекты»'), p('Недостаточно проектов'),
  h3('Сколько проектов показывать сразу'), p('1'),
  h3('Заголовок блока «Своё»'), p('Своё'),
  h3('Какой-то новый заголовок'), p('игнор'),
];

const props = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'Название' || k === 'Роль и место') out[k] = { type: 'title', title: rt(v) };
    else if (k === 'Показывать') out[k] = { type: 'checkbox', checkbox: v };
    else if (k === 'Порядок') out[k] = { type: 'number', number: v };
    else if (k === 'Блок' || k === 'Отметка') out[k] = { type: 'select', select: v ? { name: v } : null };
    else if (k === 'Ссылка') out[k] = { type: 'url', url: v };
    else out[k] = { type: 'rich_text', rich_text: v ? rt(v) : [] };
  }
  return out;
};
const page = (id, o) => ({ object: 'page', id, properties: props(o) });

const projects = [
  page('p1', { Название: 'Onliner', Показывать: true, Порядок: 1, Блок: 'Проекты', Отметка: '⭐️', Локация: 'Беларусь', Год: '2021—2022', 'В коллаборации': 'Студия Райт', Кратко: 'Экосистема', Ссылка: 'https://right.by/x' }),
  page('p2', { Название: 'NDA', Показывать: true, Порядок: 2, Блок: 'Проекты', Локация: 'США', Кратко: 'Секрет' }),
  page('p3', { Название: 'О чём это говорит?', Показывать: true, Порядок: 3, Блок: 'Своё', Кратко: 'Канал', Ссылка: 'https://t.me/toright' }),
];
const pageBlocks = {
  p1: [img('https://files.example/onliner.png?sig=2'), li('Пункт', {}, [li('Вложенный')]), p('Текст <script>', { bold: true })],
  p2: [p('Подробности')],
  p3: [],
};
const experience = [page('e1', { 'Роль и место': 'Бренд-стратег — Skip', Годы: '2025…', Порядок: 1, Показывать: true })];

function fakeFetch() {
  let calls = 0;
  const all = {};
  const register = (list) => list.forEach((b) => { all[b.id] = b; if (b._kids) register(b._kids); });
  register(homeBlocks); Object.values(pageBlocks).forEach(register);
  return async (url, init) => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
    const u = new URL(url);
    const json = (data) => new Response(JSON.stringify(data), { status: 200 });
    let m;
    if ((m = u.pathname.match(/\/v1\/blocks\/(.+)\/children/))) {
      const id = m[1];
      const list = id === 'HOME' ? homeBlocks : pageBlocks[id] || all[id]?._kids || [];
      // Paginate in pages of 5 to exercise has_more.
      const start = Number(u.searchParams.get('start_cursor') || 0);
      const slice = list.slice(start, start + 5).map(({ _kids, ...b }) => b);
      return json({ results: slice, has_more: start + 5 < list.length, next_cursor: start + 5 < list.length ? String(start + 5) : null });
    }
    if ((m = u.pathname.match(/\/v1\/databases\/(.+)\/query/))) {
      const body = JSON.parse(init.body);
      assert.equal(body.filter.property, 'Показывать');
      return json({ results: m[1] === 'PROJECTS' ? projects : experience, has_more: false });
    }
    if (u.pathname.includes('DENIED')) return new Response(JSON.stringify({ code: 'object_not_found', message: 'nope' }), { status: 404 });
    return new Response('{}', { status: 400 });
  };
}

test('loads Notion content into the model and renders it', async () => {
  const client = createClient('secret', { fetchImpl: fakeFetch() });
  const model = await loadFromNotion(client, { home: 'HOME', projects: 'PROJECTS', experience: 'EXP' });

  assert.equal(model.home.name[0].rich[0].t, 'Ксения Анискович');
  assert.equal(model.home.photo[0].src, 'https://files.example/photo.png?sig=1');
  assert.deepEqual(model.home.projectsNote, []);
  assert.equal(model.home.links[0].rich[0].href, 'https://t.me/toright');
  assert.equal(model.projects.length, 3);
  assert.equal(model.projects[0].marker, '⭐️');
  assert.equal(model.projects[0].content[1].children[0].rich[0].t, 'Вложенный');
  assert.equal(model.experience[0].years, '2025…');

  const html = renderHome(model);
  assert.match(html, /<a href="#onliner" data-case="onliner">/);
  assert.match(html, /<dialog class="case-panel" id="onliner"/);
  assert.match(html, /<ul><li>Пункт<ul><li>Вложенный<\/li><\/ul><\/li><\/ul>/);
  assert.match(html, /Текст &lt;script&gt;/);
  assert.match(html, /class="is-extra"/, 'rows past «Сколько показывать» are collapsed');
  assert.match(html, /href="https:\/\/t.me\/toright" target="_blank" rel="noopener">О чём это говорит\? →/, 'empty page → row links out');
  assert.doesNotMatch(html, /projects-note/, 'empty note is hidden');
  assert.match(html, /data-more="Недостаточно проектов"/);
});

test('explains a missing connection in Russian', async () => {
  const client = createClient('secret', { fetchImpl: async () => new Response(JSON.stringify({ code: 'object_not_found', message: 'nope' }), { status: 404 }) });
  await assert.rejects(client.children('DENIED'), /Connections/);
});

import { convertBlock, parseFreePage } from './content.mjs';
import { layoutFreePage, renderFreePage } from './render.mjs';

test('free page: statement, sections, subheads, columns and dividers', () => {
  const col = (kids) => ({ type: 'column', column: {}, has_children: true, children: kids });
  const blocks = [
    p('Привет.'), p('Абзац.'),
    block('heading_2', { rich_text: rt('Ко мне приходят') }), li('Пункт'),
    block('heading_2', { rich_text: rt('Подход') }), block('heading_3', { rich_text: rt('Принцип') }), p('Текст принципа'),
    block('divider', {}),
    block('heading_2', { rich_text: rt('Помощь') }),
    { type: 'column_list', column_list: {}, has_children: true, children: [col([p('Слева')]), col([li('Справа')])] },
  ];
  const page = parseFreePage({ properties: { title: { type: 'title', title: rt('Обо мне') } } }, blocks);
  assert.equal(page.title, 'Обо мне');
  assert.equal(page.content.at(-1).type, 'columns');
  const { statement, sections } = layoutFreePage(page.content);
  assert.equal(statement.length, 1);
  assert.equal(sections.length, 5);
  assert.equal(sections[2].rows[0].kind, 'sub');
  assert.ok(sections[3].hr);
  assert.equal(sections[4].rows[0].kind, 'cols');
  // Columns are flattened everywhere except free pages.
  assert.equal(convertBlock(blocks.at(-1))[0].type, 'p');

  const html = renderFreePage({ home: { name: [], photo: [] } }, page);
  assert.match(html, /<div class="aside"><h2 class="label">Ко мне приходят<\/h2><\/div><div class="main"><ul><li>Пункт/);
  assert.match(html, /label-row"><div class="aside"><h2 class="label">Подход<\/h2><\/div><\/div><div class="row"><div class="aside"><h3>Принцип<\/h3>/);
  assert.match(html, /<hr class="divider">/);
  assert.match(html, /<div class="aside"><h2 class="label">Помощь<\/h2><p>Слева<\/p><\/div>/);
  assert.match(html, /href="\.\.\/style\.css"/);
});
