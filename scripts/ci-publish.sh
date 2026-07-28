#!/usr/bin/env bash
#
# Publish the generated site to GitHub's gh-pages branch. Gitea's maplibre
# branch remains source code and acts as the release/deployment trigger.
#
set -euo pipefail

if [ -z "${GH_DEPLOY_KEY:-}" ]; then
  echo "!! GH_DEPLOY_KEY is required." >&2
  exit 1
fi

GITHUB_PAGES_REPOSITORY="${GITHUB_PAGES_REPOSITORY:-jimmyrocks/arcgis-preview}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)"
BUILD_DIR="$ROOT/docs"

if [ ! -f "$BUILD_DIR/index.html" ]; then
  echo "!! Build output is missing: $BUILD_DIR/index.html" >&2
  exit 1
fi

case "$GITHUB_PAGES_REPOSITORY" in
  */*) ;;
  *)
    echo "!! GITHUB_PAGES_REPOSITORY must use owner/repository form." >&2
    exit 1
    ;;
esac

KEY_FILE="$(mktemp)"
KNOWN_HOSTS_FILE="$(mktemp)"
WORKTREE="$(mktemp -d -t arcgis-preview-deploy-XXXXXX)"

cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -f "$KEY_FILE" "$KNOWN_HOSTS_FILE"
  rmdir "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf '%s\n' "$GH_DEPLOY_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"
ssh-keyscan -t ed25519 github.com > "$KNOWN_HOSTS_FILE" 2>/dev/null

export GIT_SSH_COMMAND="ssh -i $KEY_FILE -o IdentitiesOnly=yes -o UserKnownHostsFile=$KNOWN_HOSTS_FILE -o StrictHostKeyChecking=yes"

cd "$ROOT"
git config user.name "Gitea Actions"
git config user.email "actions@git.opendata.land"

if git remote get-url github-pages >/dev/null 2>&1; then
  git remote set-url github-pages "git@github.com:${GITHUB_PAGES_REPOSITORY}.git"
else
  git remote add github-pages "git@github.com:${GITHUB_PAGES_REPOSITORY}.git"
fi
git fetch --no-tags github-pages \
  refs/heads/gh-pages:refs/remotes/github-pages/gh-pages

GITHUB_PARENT="$(git rev-parse refs/remotes/github-pages/gh-pages)"
SOURCE_SHA="$(git rev-parse --short HEAD)"

git worktree add --detach "$WORKTREE" "$GITHUB_PARENT" >/dev/null

echo ">> Preparing the generated site tree ..."
git -C "$WORKTREE" rm -rfq . >/dev/null 2>&1 || true
cp -R "$BUILD_DIR/." "$WORKTREE/"
git -C "$WORKTREE" add -A

DEPLOY_TREE="$(git -C "$WORKTREE" write-tree)"
CURRENT_TREE="$(git rev-parse "${GITHUB_PARENT}^{tree}")"

if [ "$DEPLOY_TREE" = "$CURRENT_TREE" ]; then
  echo ">> GitHub gh-pages already contains this build."
  exit 0
fi

COMMIT_MESSAGE="Deploy site from maplibre@${SOURCE_SHA} ($(date -u +%Y-%m-%dT%H:%MZ))"
DEPLOY_COMMIT="$(
  printf '%s\n' "$COMMIT_MESSAGE" |
    git -C "$WORKTREE" commit-tree "$DEPLOY_TREE" -p "$GITHUB_PARENT"
)"

echo ">> Publishing GitHub gh-pages ..."
git push github-pages "${DEPLOY_COMMIT}:refs/heads/gh-pages"

echo ">> Published ${DEPLOY_COMMIT} to GitHub gh-pages."
