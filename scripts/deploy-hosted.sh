#!/usr/bin/env bash
# One-time (and repeatable) setup of the HOSTED Supabase project for nourishcart.vercel.app.
# Run from the repo root on your own machine after `npx supabase login`.
#   ./scripts/deploy-hosted.sh <project-ref>
# The project ref is the part of your Supabase URL before ".supabase.co".
# This script never asks for or stores secrets: the database password is prompted by the
# Supabase CLI itself, and SMTP is configured in the Supabase dashboard (AUTH_AND_SMTP_SETUP.md).
set -euo pipefail
REF="${1:?Usage: ./scripts/deploy-hosted.sh <project-ref>}"

echo "1/4 Linking this folder to Supabase project $REF"
npx supabase link --project-ref "$REF"

echo "2/4 Creating tables, security rules and sample food data (migrations + seed.sql)"
# --linked: newer CLI versions push to the local stack unless told to use the linked project
npx supabase db push --linked --include-seed

echo "3/4 Deploying server functions (targets, plan options, checkout, account deletion)"
npm run sync:functions
npx supabase functions deploy --project-ref "$REF"

echo "4/4 Done. Now, in the dashboards (no secrets go in this repo):"
cat <<NEXT
  Supabase > Authentication > URL Configuration
      Site URL:      https://nourishcart.vercel.app
      Redirect URLs: https://nourishcart.vercel.app/**
  Supabase > Authentication > Emails > SMTP Settings   (see AUTH_AND_SMTP_SETUP.md, section 3)
  Supabase > Authentication > Emails > Templates       paste supabase/templates/otp.html
  Vercel > nourishcart > Settings > Environment Variables (Production):
      VITE_SUPABASE_URL      = https://$REF.supabase.co
      VITE_SUPABASE_ANON_KEY = the "anon" / publishable key from Supabase > Project Settings > API
  Then redeploy on Vercel. The yellow "Demo mode" bar disappears once these are set.
NEXT
