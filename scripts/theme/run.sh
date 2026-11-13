#!/usr/bin/env sh
# Bundles the generator with esbuild (the colour library ships extension-less ESM imports).
set -e
npx esbuild scripts/theme/generate.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/theme-gen.mjs --log-level=warning
node node_modules/.cache/theme-gen.mjs
