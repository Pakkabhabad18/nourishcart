#!/usr/bin/env sh
# Rebuilds the vendored supabase-js bundle used by Edge Functions.
set -e
V=$(node -p "require('@supabase/supabase-js/package.json').version")
npx esbuild node_modules/@supabase/supabase-js/dist/index.mjs --bundle --format=esm --platform=browser --target=es2022 --outfile=supabase/functions/_shared/vendor/supabase-js.mjs
sed -i "1i // Vendored, bundled @supabase/supabase-js $V (MIT). Regenerate with scripts/vendor-supabase.sh.\n// Vendored so Edge Functions have no runtime npm fetch." supabase/functions/_shared/vendor/supabase-js.mjs
