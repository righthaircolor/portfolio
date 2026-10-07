// Minimal Notion API client: no dependencies, retries on rate limits.
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class NotionError extends Error {
  constructor(status, code, message, path) {
    const hint =
      status === 401 ? 'Ключ Notion неверный или отозван. Проверь секрет NOTION_TOKEN в настройках репозитория.' :
      status === 404 ? 'Notion не даёт доступ к странице. Открой «Сайт — админка» → ••• → Connections и подключи интеграцию сайта.' :
      '';
    super(`Notion ${status} ${code || ''} на ${path}: ${message || ''}${hint ? '\n→ ' + hint : ''}`);
  }
}

export function createClient(token, { fetchImpl = fetch } = {}) {
  if (!token) throw new Error('Нет NOTION_TOKEN. Добавь ключ интеграции Notion в секреты репозитория.');

  async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(API + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': VERSION,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(retryAfter ? retryAfter * 1000 : 800 * 2 ** attempt);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new NotionError(res.status, data.code, data.message, path);
      return data;
    }
  }

  async function paginate(fetchPage) {
    const out = [];
    let cursor;
    do {
      const page = await fetchPage(cursor);
      out.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  const children = (id) =>
    paginate((cursor) => {
      const q = new URLSearchParams({ page_size: '100' });
      if (cursor) q.set('start_cursor', cursor);
      return call(`/blocks/${id}/children?${q}`);
    });

  // Blocks with nested content (lists, toggles, columns) get a `children` array.
  async function blockTree(id, depth = 0) {
    const blocks = await children(id);
    for (const block of blocks) {
      if (block.has_children && depth < 4 && !['child_page', 'child_database'].includes(block.type)) {
        block.children = await blockTree(block.id, depth + 1);
      }
    }
    return blocks;
  }

  const query = (databaseId, body = {}) =>
    paginate((cursor) =>
      call(`/databases/${databaseId}/query`, {
        method: 'POST',
        body: { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      })
    );

  return { call, children, blockTree, query };
}
