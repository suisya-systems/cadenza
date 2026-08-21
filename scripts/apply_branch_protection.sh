#!/bin/sh
# Applies .github/branch-protection.json to a repository's main branch via
# the GitHub API. Run this once, after the first push to main has happened
# (branch protection cannot be applied to a branch that does not exist yet).
#
# Usage:
#   scripts/apply_branch_protection.sh [owner/repo]
#
# Defaults to suisya-systems/cadenza when no argument is given.

set -eu

REPO="${1:-suisya-systems/cadenza}"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROTECTION_JSON="$SCRIPT_DIR/../.github/branch-protection.json"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) is not installed or not on PATH." >&2
  echo "Install it from https://cli.github.com/ and re-run this script." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated." >&2
  echo "Run 'gh auth login' and re-run this script." >&2
  exit 1
fi

if ! gh api "repos/${REPO}/branches/main" >/dev/null 2>&1; then
  echo "error: repo '${REPO}' has no 'main' branch yet." >&2
  echo "Push the initial commit to main first, then re-run this script." >&2
  exit 1
fi

if [ ! -f "$PROTECTION_JSON" ]; then
  echo "error: protection file not found at '$PROTECTION_JSON'." >&2
  exit 1
fi

echo "Applying branch protection to ${REPO}#main using ${PROTECTION_JSON} ..."

gh api -X PUT "repos/${REPO}/branches/main/protection" \
  --input "$PROTECTION_JSON" \
  > /dev/null

echo "Branch protection applied. Current settings:"
gh api "repos/${REPO}/branches/main/protection"
