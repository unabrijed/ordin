# Project conventions

- Use Yarn for dependency installation and all package scripts. Do not use npm or pnpm.
- This project uses Yarn Classic 1.22.22, pinned in `package.json`.
- Commit `yarn.lock`; do not add `package-lock.json` or another package-manager lockfile.
- CI installs dependencies with `yarn install --frozen-lockfile`.
