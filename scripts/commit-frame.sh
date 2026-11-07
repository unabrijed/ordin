#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo_root="$(git rev-parse --show-toplevel)"
if [[ "$PWD" != "$repo_root" ]]; then
  echo 'Run this script from the Ordin checkout.' >&2
  exit 1
fi
branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo 'Cannot publish from a detached HEAD.' >&2
  exit 1
fi
remote="$(git remote get-url origin)"
case "$remote" in
  https://github.com/unabrijed/ordin|https://github.com/unabrijed/ordin.git|git@github.com:unabrijed/ordin.git) ;;
  *) echo 'Unexpected origin; expected unabrijed/ordin.' >&2; exit 1 ;;
esac
# Keep any pre-existing staged work together rather than mixing it into a feature commit.
if ! git diff --cached --quiet; then
  git commit -m 'chore: save staged project updates'
fi
commit_group() {
  local message="$1"
  shift
  git add -- "$@"
  if ! git diff --cached --quiet; then git commit -m "$message"; fi
}
commit_group 'feat: add Frame page metadata and public brand assets' examples/frame/index.html examples/frame/favicon.svg examples/frame/social-preview.png examples/frame/site.webmanifest examples/frame/robots.txt services/merchant/server.ts
commit_group 'docs: document live Frame setup, requirements and funding' README.md docs/FRAME-LIVE.md docs/DEMO-RUNBOOK.md examples/frame/README.md WHITECHAIN_FEEDBACK.md scripts/commit-frame.sh
# The user requested that all remaining project changes be committed as well.
git add --all
if ! git diff --cached --quiet; then
  git commit -m 'chore: include remaining project updates'
fi
git push -u origin "$branch"
echo "Published Ordin on branch $branch. Run yarn frame to open the Whitechain UI after configuring your merchant wallet."
