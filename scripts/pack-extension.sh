#!/usr/bin/env bash
# Packs extension/ into public/nourishcart-shopper.zip so people can download it from the site.
set -euo pipefail
rm -f public/nourishcart-shopper.zip
(cd extension && zip -qr ../public/nourishcart-shopper.zip . -x '.*')
echo "Wrote public/nourishcart-shopper.zip"
