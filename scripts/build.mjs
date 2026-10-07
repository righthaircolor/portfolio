// Builds the site into dist/.
//   npm run build            — content from Notion (needs NOTION_TOKEN)
//   npm run build:fixture    — content from fixtures/content.json, no internet needed
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './notion.mjs';
import { loadFromNotion } from './content.mjs';
import { localizeImages } from './images.mjs';
import { renderHome, renderFreePage } from './render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));

let model;
if (args.has('--fixture')) {
  model = JSON.parse(await readFile(path.join(root, 'fixtures/content.json'), 'utf8'));
  console.log('Контент: fixtures/content.json');
} else {
  const client = createClient(process.env.NOTION_TOKEN);
  model = await loadFromNotion(client, config.notion);
  console.log(`Контент из Notion: ${model.projects.length} проектов, ${model.experience.length} строк опыта.`);
  if (args.has('--save-fixture')) {
    await writeFile(path.join(root, 'fixtures/content.json'), JSON.stringify(model, null, 1));
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(path.join(root, 'src'), outDir, { recursive: true });
await localizeImages(model, { outDir, baseDir: path.join(root, 'fixtures') });
// Branch previews (set by scripts/build-all.sh): hidden from search engines and marked with a badge.
const branch = process.env.PREVIEW_BRANCH;
const mark = (html, home) =>
  !branch ? html : html
    .replace('</head>', '<meta name="robots" content="noindex">\n</head>')
    .replace(/<body([^>]*)>/, `<body$1>\n<a class="preview-badge" href="${home}">Превью: ${branch.replace(/[<>&"]/g, '')} · основной сайт →</a>`);
const live = config.siteUrl || '../../';
await writeFile(path.join(outDir, 'index.html'), mark(renderHome(model, { siteUrl: config.siteUrl }), live));
if (model.about) {
  await mkdir(path.join(outDir, 'about'), { recursive: true });
  await writeFile(path.join(outDir, 'about', 'index.html'), mark(renderFreePage(model, model.about, { siteUrl: config.siteUrl }), live));
}
if (config.domain) await writeFile(path.join(outDir, 'CNAME'), config.domain + '\n');
await writeFile(path.join(outDir, '.nojekyll'), '');
console.log('Готово: dist/index.html');
