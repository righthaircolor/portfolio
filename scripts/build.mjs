// Builds the site into dist/.
//   npm run build            — content from Notion (needs NOTION_TOKEN)
//   npm run build:fixture    — content from fixtures/content.json, no internet needed
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './notion.mjs';
import { loadFromNotion } from './content.mjs';
import { localizeImages } from './images.mjs';
import { renderHome } from './render.mjs';

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
await writeFile(path.join(outDir, 'index.html'), renderHome(model, { siteUrl: config.siteUrl }));
if (config.domain) await writeFile(path.join(outDir, 'CNAME'), config.domain + '\n');
await writeFile(path.join(outDir, '.nojekyll'), '');
console.log('Готово: dist/index.html');
