# Free-tier limits

NourishCart targets ₹0 recurring spend. Free tiers are for development and pilots, not production SLAs. Never upgrade a plan, add a card or enable paid usage without a team decision.

All values below were checked on **11 November 2026** against the official page listed. Re-check before any pilot: providers change quotas without notice.

## Supabase (Free plan)

| Item | Limit | Source |
|---|---|---|
| Monthly active users | 50,000 | https://supabase.com/docs/guides/platform/billing-on-supabase |
| Database size | 500 MB per project | same |
| File storage | 1 GB | same |
| Egress | 5 GB | same |
| Edge Function invocations | 500,000 | same |
| Free projects | 2 (across orgs where you are Owner/Admin) | same |
| Edge Function CPU | 2 s per request (async I/O not counted) | https://supabase.com/docs/guides/functions/limits |
| Edge Function wall clock | 150 s per worker | same |
| Edge Function memory | 256 MB | same |
| Edge Function size | 20 MB bundled by CLI, 5 MB via Dashboard | same |
| Inactivity pause | Paused after about a week of too little database activity; email warning about a week before. Data and settings are kept. | https://supabase.com/kb/faqs/platform/free-project-pausing |

## Supabase Auth email

| Item | Limit | Source |
|---|---|---|
| Built-in SMTP recipients | Only addresses in the project's organisation team ("Email address not authorized" otherwise) | https://supabase.com/docs/guides/auth/auth-smtp |
| Built-in SMTP volume | 2 emails per hour, best effort, no SLA | same |
| Custom SMTP default rate limit | 30 emails per hour until raised on the Rate Limits page | same |

## Brevo (candidate custom SMTP)

| Item | Limit | Source |
|---|---|---|
| Free plan sends | 300 emails per day, resets daily, no rollover | https://help.brevo.com/hc/en-us/articles/208580669 |
| Account approval | Sending starts after Brevo approves the account | Brevo sign-up flow (see AUTH_AND_SMTP_SETUP.md) |
| Branding | Free plan adds a "Sent with Brevo" sticker | https://help.brevo.com/hc/en-us/articles/208580669 |
| Sender | Verified sender and authenticated domain needed for reliable Gmail/Yahoo/Microsoft delivery | PRD R9 |

## Cloudflare Pages (Free plan)

| Item | Limit | Source |
|---|---|---|
| Builds | 500 per month, 1 at a time, 20-minute timeout | https://developers.cloudflare.com/pages/platform/limits/ |
| Files per site | 20,000 | same |
| File size | 25 MiB per asset | same |
| Preview deployments | Unlimited | same |

## What this means for the first 10,000 users

The database, auth MAU and function quotas comfortably cover 10k users at prototype usage. A full plan generation is three Edge Function calls; 10k users each generating a plan weekly is about 130k invocations a month, well under 500k.

**Email OTP is the real constraint.**

- Brevo Free sends 300 emails per day, so at most 300 new sign-ins (or new-device sign-ins) per day. 10,000 sign-ups would take over a month at that ceiling.
- Supabase applies its own 30-per-hour default after custom SMTP is enabled; raise it in Authentication → Rate Limits up to what the SMTP provider allows.
- Sessions persist and refresh, so returning users on the same device do not need a new code. The daily cap mostly limits new sign-ups.

Options when sign-ups exceed the cap, none of which are switched on automatically: stagger an invite list; add a second free SMTP provider for a different sender subdomain after checking its terms; or make a paid decision deliberately. Do not switch to a paid service silently.

## Guardrails in the code

- No paid API is called anywhere. The optional LLM adapter is not implemented and `VITE_AI_PROVIDER` defaults to `disabled`.
- Retailer adapters other than the simulated one are disabled and make no network calls.
- Edge Function bodies are capped at 16 KB; calculations are bounded (the optimiser limits pack counts and pairs).
- Analytics: none installed.
- Images: none uploaded; icons are local SVG/PNG.

## Inactivity checklist

Free projects pause after a quiet week. During the pilot, someone on the team should open the Supabase dashboard weekly. If paused, restore from the project page in the dashboard; data is kept.
