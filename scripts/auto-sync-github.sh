#!/usr/bin/env bash
set -e

# CartLock Automatic GitHub Sync
# Stages all modified and new files, commits with a timestamped or custom message, and pushes to origin main.

COMMIT_MSG="${1:-"chore: auto-sync updates to CartLock $(date -u +"%Y-%m-%d %H:%M:%S UTC")"}"

# Check for changes
if [ -z "$(git status --porcelain)" ]; then
  echo "No changes to commit. Working tree clean."
  exit 0
fi

echo "Staging changes..."
git add -A

echo "Committing with message: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "Pushing to origin main..."
git push origin main

echo "Successfully synced changes to GitHub repository!"
