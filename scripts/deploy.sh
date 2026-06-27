#!/usr/bin/env bash
#
# Build the production bundle and stage it on the gh-pages branch.
#
# GitHub Pages serves this project from the ROOT of the gh-pages branch
# (https://loc8.us/arcgis-preview/). This script builds maplibre's source
# into docs/ (Vite's outDir) and copies it to the gh-pages branch root via a
# throwaway git worktree, then commits on gh-pages. By default it stays local.
# Pass --push to publish to the private server first, then mirror to GitHub.
#
set -euo pipefail

PUSH=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [--push]

Build and commit the production bundle to the local gh-pages branch.

Options:
  --push   After committing, push gh-pages to gitea and then origin.
  -h, --help
           Show this help text.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --push)
      PUSH=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "!! Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)"
cd "$ROOT"

SRC_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SRC_SHA="$(git rev-parse --short HEAD)"

push_deploy_branch() {
  echo ">> Pushing gh-pages to gitea ..."
  git push gitea gh-pages
  echo ">> Mirroring gh-pages to origin ..."
  git push origin gh-pages
  echo ">> Pushed gh-pages to gitea and origin."
}

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
  if [ "$PUSH" -eq 1 ]; then
    push_deploy_branch
  else
    echo ">> Push when ready:"
    echo "     npm run deploy -- --push"
  fi
  exit 0
fi

git -C "$WT" commit -q -m "Deploy site from ${SRC_BRANCH}@${SRC_SHA} ($(date -u +%Y-%m-%dT%H:%MZ))"
if [ "$PUSH" -eq 1 ]; then
  echo ">> Committed build to gh-pages."
  push_deploy_branch
else
  echo ">> Committed build to gh-pages (local only)."
  echo ">> Push when ready:"
  echo "     npm run deploy -- --push"
fi
