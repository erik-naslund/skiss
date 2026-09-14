#!/usr/bin/env bash
# What `npm publish` would upload. The tarball must hold dist/, package.json,
# README.md and LICENSE and nothing else, must hold everything `exports` and
# `bin` point at, and must not ship the source maps (issue #53, N2). CI runs
# this on every pull request and before every publish; `pnpm build` first.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

files="$(npm pack --dry-run --json | node -p '
  JSON.parse(require("fs").readFileSync(0, "utf8"))[0].files.map((f) => f.path).join("\n")
')"
echo "$files"

bad="$(echo "$files" | grep -Ev '^(dist/.+|package\.json|README\.md|LICENSE)$' || true)"
if [ -n "$bad" ]; then
  echo "::error::unexpected files in the package tarball:"
  echo "$bad"
  exit 1
fi

maps="$(echo "$files" | grep -E '\.map$' || true)"
if [ -n "$maps" ]; then
  echo "::error::source maps in the package tarball; they carry the whole source:"
  echo "$maps"
  exit 1
fi

for required in dist/index.js dist/index.d.ts dist/cli.js dist/cli.d.ts package.json README.md LICENSE; do
  if ! echo "$files" | grep -qx "$required"; then
    echo "::error::$required is missing from the package tarball"
    exit 1
  fi
done

echo "check-package: the tarball holds what it should and nothing more"
