#!/usr/bin/env bash
# Pull the latest GSC report (workflow gsc-report.yml) to a local dir, decrypt it
# with the private key, then delete the artifact from GitHub. Never prints data.
# Usage: scripts/gsc-pull.sh <target-dir> [run-id]
set -euo pipefail
REPO=Pepuldope/turuj
KEY="$HOME/.config/turuj-gsc/key.txt"
TARGET="${1:?usage: gsc-pull.sh <target-dir> [run-id]}"
RUN="${2:-}"

if [ -z "$RUN" ]; then
  RUN=$(gh run list -R "$REPO" -w gsc-report.yml -s success -L 1 --json databaseId -q '.[0].databaseId')
fi
[ -n "$RUN" ] || { echo "no successful gsc-report run found"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
gh run download "$RUN" -R "$REPO" -n gsc-report -D "$TMP"
mkdir -p "$TARGET"
for f in "$TMP"/gsc-report-*.tar.gz.age; do
  age -d -i "$KEY" "$f" | tar -xzf - -C "$TARGET" --strip-components=1
done
echo "extracted to $TARGET"

ID=$(gh api "repos/$REPO/actions/runs/$RUN/artifacts" -q '.artifacts[] | select(.name=="gsc-report") | .id')
for i in $ID; do gh api -X DELETE "repos/$REPO/actions/artifacts/$i" >/dev/null && echo "deleted artifact $i"; done
