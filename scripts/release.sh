#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
VER="${1:?usage: npm run ship <version>, e.g. npm run ship 0.2.0}"
npm version "$VER" --no-git-tag-version >/dev/null
git add package.json package-lock.json
git commit -q -m "Release v$VER"
git push origin main
echo "Pushed v$VER. The Release workflow builds it and updates the Homebrew cask."
