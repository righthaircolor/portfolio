// Notion file links expire after an hour, so every image is copied into the site.
// If `sharp` is installed (it is on GitHub), images are resized and saved as WebP.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, copyFile, access, readFile } from 'node:fs/promises';
import path from 'node:path';

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('sharp не установлен — картинки копируются без сжатия.');
}

const EXT_BY_TYPE = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif' };

// Stable name: Notion file URLs change every hour, but the path part (before "?") does not.
function stableKey(src) {
  return createHash('sha1').update(src.split('?')[0]).digest('hex').slice(0, 16);
}

export async function localizeImages(model, { outDir, baseDir = process.cwd(), maxWidth = 1800 }) {
  const mediaDir = path.join(outDir, 'media');
  await mkdir(mediaDir, { recursive: true });
  const done = new Map();

  async function save(src, width = maxWidth) {
    if (!src) return '';
    if (done.has(src)) return done.get(src);
    const job = (async () => {
      const key = stableKey(src);
      let buffer, type;
      if (/^https?:\/\//.test(src)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`Не удалось скачать картинку (${res.status}): ${src.split('?')[0]}`);
        buffer = Buffer.from(await res.arrayBuffer());
        type = (res.headers.get('content-type') || '').split(';')[0];
      } else {
        // Local file (fixtures / offline preview).
        const file = path.resolve(baseDir, src);
        await access(file);
        if (!sharp) {
          const name = key + path.extname(file);
          await copyFile(file, path.join(mediaDir, name));
          return 'media/' + name;
        }
        buffer = await readFile(file);
      }
      const isVector = type === 'image/svg+xml' || type === 'image/gif';
      if (sharp && !isVector) {
        try {
          const name = `${key}-${width}.webp`;
          await sharp(buffer, { animated: false }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(mediaDir, name));
          return 'media/' + name;
        } catch (e) {
          console.warn('Не получилось сжать картинку, сохраняю как есть:', e.message);
        }
      }
      const ext = EXT_BY_TYPE[type] || path.extname(src.split('?')[0]) || '.jpg';
      const name = key + ext;
      await writeFile(path.join(mediaDir, name), buffer);
      return 'media/' + name;
    })();
    done.set(src, job);
    return job;
  }

  async function walk(blocks, width) {
    for (const b of blocks || []) {
      if (b.type === 'image') {
        try {
          b.src = await save(b.src, width);
        } catch (e) {
          console.warn(e.message);
          b.src = '';
        }
      }
      if (b.children) await walk(b.children, width);
      if (b.cols) for (const col of b.cols) await walk(col, width);
    }
  }

  await walk(model.home.photo, 900);
  for (const p of model.projects) await walk(p.content, maxWidth);
  if (model.about) await walk(model.about.content, maxWidth);
  return model;
}
