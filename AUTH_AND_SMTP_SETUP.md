# Authentication and SMTP setup

NourishCart signs people in with an emailed 6-digit code (Supabase Auth email OTP). There are no passwords, social logins or phone codes.

There are three ways to run sign-in:

| Mode | Where | Email | Status |
|---|---|---|---|
| Demo mode | Hosted review preview, or `npm run dev` without Supabase env | No email. The code appears in an on-screen "demo inbox" labelled as simulated | Working |
| Local Supabase + Mailpit | Your laptop, Docker | Captured by Mailpit at http://127.0.0.1:54324 | **Tested: request → Mailpit → verify → session** |
| Hosted Supabase + custom SMTP | Public pilot | Real email through Brevo (or similar) | `BLOCKED_EXTERNAL_SETUP` (needs a domain and SMTP account owned by the team) |

## 1. The flow

1. User enters an email. The browser checks the format.
2. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
3. The UI shows "Check your email" with the same wording whether or not the address has an account.
4. User enters the code; `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
5. Supabase returns a session; the client persists and refreshes it.
6. User lands on Overview, or the first-run Welcome screen if they have no profile.
7. Sign out from Settings.

Error handling in `src/lib/store/supabaseStore.ts`:

| Supabase error | What the user sees |
|---|---|
| `over_email_send_rate_limit` / 429 | "For security, you can request a new code in N seconds." The resend button counts down. |
| `otp_expired` (wrong or expired code) | "That code is incorrect or has expired…" (one message for both) |
| network failure | "No connection…" |
| anything else | A generic retry message that never reveals whether the email is registered |

Codes, tokens and SMTP details are never logged.

## 2. Local development with Mailpit

The Supabase CLI ships Mailpit as its local email server (`[local_smtp]` in `supabase/config.toml`) and points the local Auth container at it over the Docker network. You do not configure `localhost` SMTP yourself.

### Prerequisites

- Node 22+, npm
- Docker running
- No global Supabase CLI needed: it is a dev dependency (`npx supabase`)

### Start, inspect, stop

```bash
npm install
npm run sb:start                 # Postgres, Auth, REST, Edge Runtime, Mailpit (Studio etc. skipped)
npx supabase functions serve     # in a second terminal: serves the Edge Functions
npx supabase status              # prints API URL and the local publishable key
```

Create `.env.local` (not committed):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<publishable key from `npx supabase status`>
```

Then `npm run dev` and open http://127.0.0.1:5173.

- Mailpit inbox: http://127.0.0.1:54324
- Reset the database and reseed: `npm run sb:reset`
- Stop everything: `npm run sb:stop`

### Local settings used (supabase/config.toml)

| Setting | Value | Why |
|---|---|---|
| `auth.email.otp_length` | 6 | 6-digit code UX |
| `auth.email.otp_expiry` | 600 (10 min) | Must match the "expires in 10 minutes" text in the template |
| `auth.email.max_frequency` | `60s` | Resend cooldown per address |
| `auth.rate_limit.email_sent` | 30 / hour | Matches Supabase's custom-SMTP default |
| `auth.email.template.magic_link` and `.confirmation` | `supabase/templates/otp.html` | Both new and returning users get a code, never a link |
| `local_smtp.sender_name` | NourishCart | Branded sender |
| `auth.site_url` | http://127.0.0.1:5173 | Vite dev server |

### Local test checklist

1. Request a code for `you@example.com`.
2. Open Mailpit; the subject is "Your NourishCart sign-in code" from NourishCart.
3. Enter a wrong code: a generic error shows.
4. Enter the right code: you reach Welcome.
5. Request again within 60 s: the cooldown message shows.
6. Sign out from Settings.

The automated version of this is `npm run test:integration` (it reads codes from the Mailpit API).

## 3. Hosted demo: Supabase custom SMTP

Supabase's built-in sender only delivers to your own project team and allows 2 emails per hour. It is not for public sign-in. For a public pilot, use a custom SMTP provider.

### What the team needs first

- A domain you already own (a subdomain like `mail.yourdomain.in` is fine). Buying one breaks strict ₹0, so decide that as a team.
- Access to that domain's DNS.
- A free account with a transactional email provider. **Brevo** is the current candidate: 300 emails/day free, SMTP relay included. Check its terms and regional availability when you sign up; sending starts only after Brevo approves the account.

Never paste SMTP passwords, service-role keys or API keys into chat, code, `.env.example` or any `VITE_*` variable. Enter them only in the provider dashboard and the Supabase dashboard.

### Steps

1. **Create the Brevo account** and complete its sending-approval form (describe it as transactional sign-in codes only).
2. **Add your sender domain** in Brevo (Senders, Domains & Dedicated IPs → Domains). Brevo shows the DNS records to add.
3. **Add DNS records** at your DNS host:
   - **Brevo verification** TXT record (the `brevo-code:` value).
   - **DKIM**: the record(s) Brevo shows, exactly as given.
   - **SPF**: the SPF value Brevo shows for your domain (commonly an `include:` for Brevo). If an SPF record already exists, merge the include into it; a domain may have only one `v=spf1` record. On Brevo's shared sending IPs, DKIM is what aligns with your From domain for DMARC, so do not skip DKIM.
   - **DMARC** (recommended): TXT at `_dmarc.yourdomain.in` with a monitoring-only starter policy:
     `v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.in`
     `p=none` asks receivers to report but not block. After a few weeks of clean reports, move to `p=quarantine`.
4. **Wait for DNS** (minutes to 48 hours). Check in Brevo that the domain shows as authenticated, or use `dig TXT yourdomain.in`.
5. **Create an SMTP key** in Brevo (SMTP & API → SMTP). Use this key, not your Brevo login password.
6. **Configure Supabase**: Dashboard → your project → Authentication → Emails → SMTP Settings (labels may move; search "SMTP"). Enable custom SMTP and enter:
   - Sender email: `no-reply@yourdomain.in` (on the authenticated domain)
   - Sender name: `NourishCart`
   - Host: `smtp-relay.brevo.com`
   - Port: `587` (STARTTLS; `465` for SSL/TLS)
   (These match Brevo's own Supabase guide: https://developers.brevo.com/docs/supabase-smtp-integration, checked 11 Nov 2026.)
   - Username: your Brevo SMTP login
   - Password: the SMTP key from step 5
7. **Email template**: Authentication → Emails → Templates. For both **Magic Link** and **Confirm signup**, set the subject to "Your NourishCart sign-in code" and paste the HTML from `supabase/templates/otp.html`. It uses `{{ .Token }}`, the documented variable for the code.
8. **OTP settings**: set the email OTP expiry to **600 seconds** so it matches the template's "10 minutes", keep the length at 6, and set rate limits (Authentication → Rate Limits) no higher than the provider's daily allowance divided across the day.
9. **URL configuration**: set Site URL to your deployed app (e.g. `https://nourishcart.pages.dev`) and add it to Redirect URLs.
10. **Test** with addresses you control: Gmail plus at least one other provider. Check that the mail lands in the inbox rather than spam, and in Gmail's "Show original" confirm SPF, DKIM and DMARC say PASS.
11. **Record the status** in `BUILD_STATUS.md` (date, provider, domain, test result). Never record secret values.

### If there is no domain yet

Keep Mailpit for development and the demo-mode preview for reviewers. Internal testing on a hosted project can use the built-in sender for team members only (2 emails/hour). Do not open public sign-up until steps 1–10 pass.

## 4. Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| "Error sending magic link/OTP" in Auth logs | SMTP username/password wrong, or using the account password instead of an SMTP key | Re-create the SMTP key, re-enter it |
| "Email address not authorized" | Still on Supabase's built-in sender | Enable custom SMTP |
| Sender rejected / unverified | Sender address not on the authenticated domain | Use an address on the verified domain |
| `over_email_send_rate_limit` | Cooldown (60 s) or hourly cap hit | Wait; adjust Rate Limits within the provider's allowance |
| "Token has expired or is invalid" right after sending | Wrong OTP type in code, or an older code used | Code uses `type: 'email'`; always use the latest email |
| Email contains a link, not a code | Template still uses `{{ .ConfirmationURL }}` | Use the NourishCart template with `{{ .Token }}` in both templates |
| Expired codes too soon or late | Template text and OTP expiry differ | Keep both at 10 minutes |
| Redirect mismatch | Site URL / Redirect URLs not set for the deployed domain | Add the exact HTTPS URL |
| Mail goes to spam | SPF/DKIM/DMARC missing or failing, or new domain reputation | Fix DNS, check headers, start with low volume |
| Domain stays "pending" in Brevo | DNS not propagated, or record pasted with extra quotes | Wait, check with `dig`, compare values exactly |
| Local emails never arrive | Docker stack not running | `npm run sb:start`, then open Mailpit |

## 5. Security checklist

- [x] Only the publishable/anon key reaches the browser.
- [x] Service-role key used only inside Edge Functions via Supabase-provided env.
- [x] No SMTP secret in the repo or in any `VITE_*` variable.
- [x] Generic sign-in errors; resend cooldown and throttling handled.
- [x] Codes and tokens are never logged.
- [ ] Hosted SMTP sender verified and tested (`BLOCKED_EXTERNAL_SETUP`).
- [ ] Rate limits on the hosted project reviewed against provider limits.
- [ ] Consider Cloudflare Turnstile on the sign-in form if abuse appears (free).

Free-tier numbers are in `FREE_TIER_LIMITS.md`.
