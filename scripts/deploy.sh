#!/usr/bin/env bash
#
# Deployment is intentionally performed by Gitea Actions when the Gitea
# maplibre release branch is updated.
#
set -euo pipefail

cat >&2 <<'EOF'
Deployment is managed by Gitea Actions.

Merge the desired maplibre-dev changes into maplibre, then push maplibre:

  git push gitea maplibre

The workflow will test, build, and publish GitHub gh-pages.
EOF

exit 1
