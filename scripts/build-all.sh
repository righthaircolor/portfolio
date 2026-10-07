#!/usr/bin/env bash
# Builds the live site from main into _site/ and every other branch into _site/preview/<branch>/.
# Run by GitHub Actions; needs NOTION_TOKEN. A broken branch never blocks the live site.
set -euo pipefail
BUILD="${BUILD:-npm run build}"   # locally: BUILD="npm run build:fixture"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_site"
rm -rf "$OUT" && mkdir -p "$OUT/preview"
cd "$ROOT"

echo "▶ main"
npm test
$BUILD
cp -R dist/. "$OUT/"

links=""
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do
  name="${ref#origin/}"
  [[ "$name" == "main" || "$name" == "HEAD" || "$name" == "origin" ]] && continue
  slug="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
  wt="$(mktemp -d)/$slug"
  echo "▶ ветка $name → preview/$slug/"
  git worktree add --detach "$wt" "$ref" >/dev/null
  if cmp -s "$ROOT/package.json" "$wt/package.json"; then ln -s "$ROOT/node_modules" "$wt/node_modules"; fi
  if (cd "$wt" && { [ -e node_modules ] || npm install --no-audit --no-fund; } && npm test && PREVIEW_BRANCH="$name" $BUILD); then
    mkdir -p "$OUT/preview/$slug" && cp -R "$wt/dist/." "$OUT/preview/$slug/"
    links="$links<li><a href=\"./$slug/\">$name</a></li>"
  else
    echo "::warning::Превью ветки $name не собралось — основной сайт не затронут"
    links="$links<li>$name — не собралось, смотри лог в Actions</li>"
  fi
  git worktree remove --force "$wt" || true
done

cat > "$OUT/preview/index.html" <<EOF
<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Превью веток</title>
<style>body{font:16px/1.5 Arial,sans-serif;padding:28px}li{margin:8px 0}</style></head>
<body><h1 style="font-size:20px;font-weight:400">Превью веток</h1><ul>${links:-<li>Сейчас нет веток кроме main</li>}</ul><p><a href="../">← основной сайт</a></p></body></html>
EOF
echo "Готово: _site/"
