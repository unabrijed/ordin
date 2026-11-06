#!/usr/bin/env bash
# Publish the prepared local project using your terminal's GitHub credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

project_root="$(pwd -P)"
if git_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  if [[ "$git_root" != "$project_root" ]]; then
    echo "Refusing to publish a parent repository: $git_root" >&2
    exit 1
  fi
fi
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  bash scripts/commit-initial.sh
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Switch to the intended main branch before publishing." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted files remain. Review and commit them before publishing." >&2
  git status --short
  exit 1
fi

if existing_origin="$(git remote get-url origin 2>/dev/null)"; then
  case "$existing_origin" in
    https://github.com/unabrijed/ordin.git|https://github.com/unabrijed/ordin|git@github.com:unabrijed/ordin.git) ;;
    *) echo "Origin points somewhere else; refusing to change it." >&2; exit 1 ;;
  esac
else
  git remote add origin https://github.com/unabrijed/ordin.git
fi

# Never force-push or rewrite remote history.
git push -u origin main
echo "Published main to https://github.com/unabrijed/ordin"
