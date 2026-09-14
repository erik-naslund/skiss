#!/usr/bin/env bash
# Bootstraps .venv/ with the pinned LinkML toolchain: the fourth gate of
# `pnpm verify` (AGENTS.md §5) and the LinkML job in CI. Python never leaves
# .venv/ and is never a dependency of the package (ADR 0007).
set -euo pipefail

# D1: pinned here and nowhere else. Bump deliberately, in its own PR.
LINKML_VERSION="1.11.1"
MIN_PYTHON="3.11"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv="$repo_root/.venv"

usage() {
  cat <<EOF
Usage: scripts/linkml-env.sh [--help]

Creates .venv/ with Python $MIN_PYTHON or newer and installs
linkml==$LINKML_VERSION into it. Idempotent: if .venv/ already has that
version, nothing is installed and the script exits 0.

Requires python3 on PATH. Run scripts/validate-linkml.sh afterwards to
validate the LinkML fixtures.
EOF
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
  "") ;;
  *)
    echo "linkml-env: unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac

if ! command -v python3 >/dev/null 2>&1; then
  echo "linkml-env: python3 not found on PATH" >&2
  exit 1
fi

if ! python3 -c "import sys; sys.exit(0 if sys.version_info[:2] >= tuple(int(p) for p in '$MIN_PYTHON'.split('.')) else 1)"; then
  echo "linkml-env: python3 is $(python3 -V 2>&1), need $MIN_PYTHON or newer" >&2
  exit 1
fi

if [ ! -x "$venv/bin/python" ]; then
  echo "linkml-env: creating $venv with $(python3 -V 2>&1)"
  python3 -m venv "$venv"
fi

# `pip show` exits non-zero when the package is absent; under pipefail that
# would end the script, so the absent case is folded into an empty string.
installed="$("$venv/bin/python" -m pip show linkml 2>/dev/null | sed -n 's/^Version: //p' || true)"

if [ "$installed" = "$LINKML_VERSION" ]; then
  echo "linkml-env: linkml==$LINKML_VERSION already installed, nothing to do"
  exit 0
fi

echo "linkml-env: installing linkml==$LINKML_VERSION"
"$venv/bin/python" -m pip install --quiet --upgrade pip
"$venv/bin/python" -m pip install --quiet "linkml==$LINKML_VERSION"
echo "linkml-env: ready ($("$venv/bin/linkml-lint" --version 2>&1 | head -1))"
