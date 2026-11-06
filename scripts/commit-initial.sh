#!/usr/bin/env bash
# Run in your own terminal when this workspace cannot write Git metadata.
# Creates real commits from the current files; does not fabricate earlier history.
set -euo pipefail

cd "$(dirname "$0")/.."
project_root="$(pwd -P)"
if git_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  if [[ "$git_root" != "$project_root" ]]; then
    echo "Refusing to use a parent repository: $git_root" >&2
    exit 1
  fi
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    echo "This repository already has commits. Review its history and split remaining changes manually." >&2
    exit 1
  fi
  if ! git diff --cached --quiet; then
    echo "The index already contains staged files. Review and unstage them before running this script." >&2
    exit 1
  fi
else
  git init -b main
fi

# Use your configured identity; never invent an author name or email.
git var GIT_AUTHOR_IDENT >/dev/null
git var GIT_COMMITTER_IDENT >/dev/null

git add -- .gitignore package.json yarn.lock tsconfig.json hardhat.config.ts \
  contracts/Ordin.sol scripts/compile.ts sdk/abi.ts sdk/index.ts
git diff --cached --check
git commit -m "feat: implement recurring payment contract and TypeScript SDK"

git add -- contracts/test/TestToken.sol contracts/test/Adversarial.sol \
  scripts/local.ts scripts/demo.ts test/ordin.test.ts
git diff --cached --check
git commit -m "test: cover payment lifecycle and authorization security"

git add -- scripts/chain.ts scripts/verify-network.ts test/chain.test.ts .env.example
git diff --cached --check
git commit -m "feat: add Whitechain testnet CLI and transaction inspection"

git add -- README.md docs/TESTNET.md AGENTS.md scripts/commit-initial.sh scripts/publish.sh
git diff --cached --check
git commit -m "docs: document setup, testnet demo and Yarn conventions"

git add -- landing/package.json landing/yarn.lock landing/tsconfig.json landing/vite.config.ts \
  landing/index.html landing/src/main.tsx landing/src/styles.css landing/public/ordin-mark.svg \
  landing/public/protocol.md landing/README.md
git diff --cached --check
git commit -m "feat: add Ordin landing page and policy playground"

git add -- .github/workflows/ci.yml
git diff --cached --check
git commit -m "ci: validate protocol tests and landing build"

git log --oneline -6
git status --short
echo "Six local commits created. No remote repository was created and nothing was pushed."
