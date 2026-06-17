#!/usr/bin/env bash
#
# Build the production bundle and stage it on the gh-pages branch, locally.
#
# GitHub Pages serves this project from the ROOT of the gh-pages branch
# (https://loc8.us/arcgis-preview/). This script builds maplibre's source
# into docs/ (Vite's outDir) and copies it to the gh-pages branch root via a
# throwaway git worktree, then commits on gh-pages. It intentionally does
# NOT push — the deploy flow is: run this, then
#   git push gitea gh-pages   &&   git push origin gh-pages
# (push to the private server first, then mirror to GitHub).
#
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SRC_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SRC_SHA="$(git rev-parse --short HEAD)"

echo ">> Building production bundle (outDir: docs/) ..."
npm run build

if [ ! -f "$ROOT/docs/index.html" ]; then
  echo "!! Build did not produce docs/index.html — aborting." >&2
  exit 1
fi

WT="$(mktemp -d -t ghpages-XXXXXX)"
cleanup() { cd "$ROOT"; git worktree remove --force "$WT" >/dev/null 2>&1 || git worktree prune >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo ">> Checking out gh-pages into a worktree ..."
git worktree add --force "$WT" gh-pages >/dev/null

echo ">> Replacing gh-pages contents with the fresh build ..."
# Clear the branch (keeps the .git worktree pointer) so old hashed assets
# don't accumulate, then drop the new build at the branch root.
git -C "$WT" rm -rfq . >/dev/null 2>&1 || true
cp -R "$ROOT/docs/." "$WT/"

git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo ">> No changes to deploy — gh-pages already up to date."
  exit 0
fi

git -C "$WT" commit -q -m "Deploy site from ${SRC_BRANCH}@${SRC_SHA} ($(date -u +%Y-%m-%dT%H:%MZ))"
echo ">> Committed build to gh-pages (local only)."
echo ">> Push when ready:"
echo "     git push gitea gh-pages && git push origin gh-pages"
