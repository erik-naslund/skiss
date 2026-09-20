#!/usr/bin/env bash
# Validates every test/fixtures/*.linkml.yaml with the real LinkML toolchain.
# This is the only proof that "compiles to valid LinkML" is true (ADR 0007).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv="$repo_root/.venv"
fixtures="$repo_root/test/fixtures"

usage() {
  cat <<EOF
Usage: scripts/validate-linkml.sh [--help]

Runs, on every $fixtures/*.linkml.yaml file:

  linkml-lint --ignore-warnings   metamodel validation; style warnings are
                                  reported but do not fail the gate
  gen-python                      into a temporary directory, proving the
                                  schema is not merely well-formed but usable.
                                  An `ERROR:` line on its standard error fails
                                  the fixture even when it exits 0: LinkML logs
                                  a schema it could not fully resolve and
                                  generates anyway (issue #70)

Uses .venv/ when present, otherwise whatever is on PATH. Run
scripts/linkml-env.sh first. Exits non-zero if any fixture fails either step.
EOF
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
  "") ;;
  *)
    echo "validate-linkml: unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac

if [ -x "$venv/bin/linkml-lint" ]; then
  PATH="$venv/bin:$PATH"
fi

for tool in linkml-lint gen-python; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "validate-linkml: $tool not found; run scripts/linkml-env.sh first" >&2
    exit 1
  fi
done

shopt -s nullglob
schemas=("$fixtures"/*.linkml.yaml)
shopt -u nullglob

if [ ${#schemas[@]} -eq 0 ]; then
  echo "validate-linkml: no *.linkml.yaml fixtures found in $fixtures" >&2
  exit 1
fi

generated="$(mktemp -d)"
trap 'rm -rf "$generated"' EXIT

failures=0

for schema in "${schemas[@]}"; do
  name="$(basename "$schema" .linkml.yaml)"
  echo "validate-linkml: $name"

  # Metamodel validation always runs inside lint. Warnings are ignored on
  # purpose: the default ruleset asks for a description on every element and
  # for snake_case slot names, and Skiss deliberately produces neither
  # (SPEC §3.1 field names are lowerCamelCase; `#` descriptions are optional).
  if ! linkml-lint --ignore-warnings "$schema"; then
    echo "validate-linkml: linkml-lint failed for $name" >&2
    failures=$((failures + 1))
    continue
  fi

  errors="$generated/${name//-/_}.stderr"
  if ! gen-python "$schema" >"$generated/${name//-/_}.py" 2>"$errors"; then
    cat "$errors" >&2
    echo "validate-linkml: gen-python failed for $name" >&2
    failures=$((failures + 1))
    continue
  fi
  cat "$errors" >&2

  # gen-python exits 0 on a schema it could not fully resolve and says so on
  # standard error instead. An ERROR: line is a failed gate, so a generator
  # that stops understanding what Skiss writes cannot pass quietly.
  if grep -q 'ERROR:' "$errors"; then
    echo "validate-linkml: gen-python logged an error for $name" >&2
    failures=$((failures + 1))
  fi
done

if [ "$failures" -ne 0 ]; then
  echo "validate-linkml: $failures of ${#schemas[@]} fixture(s) failed" >&2
  exit 1
fi

echo "validate-linkml: ${#schemas[@]} fixture(s) valid"
