# PAIDI CRM

Internal CRM for PAIDI (Philadelphia AI Development Initiative). It tracks every prospect and every interaction, and shows where prospects drop out of the sales funnel.

- **App:** https://akashyap-1.github.io/paidi_crm/
- **Front end:** Vite + React + TypeScript + Tailwind, a static single-page app on GitHub Pages (hash routing, relative base path).
- **Back end:** Supabase project `paidi-crm` (`plenngzosfcqmberlwrt`, us-east-1): Postgres, Auth, Row Level Security, Edge Functions, pg_cron.

## How it fits together

```
Browser (GitHub Pages)  ──anon key + user JWT──▶  Supabase Postgres (RLS on every table)
        │                                              ▲            ▲
        └──▶ Edge Functions ───────────────────────────┘            │
              gmail-oauth-start     starts Google OAuth (admin)      │
              gmail-oauth-callback  code exchange, encrypts token    │
              gmail-sync            reads Gmail, calls Claude        │
                                                                     │
pg_cron ── every 15 min ──▶ gmail-sync (shared secret from Vault)    │
pg_cron ── hourly ────────▶ private.run_followups() ─────────────────┘
```

The browser only ever holds the Supabase URL and the public anon key (`.env.production`). The Claude API key, Google client secret, token-encryption key and Gmail refresh tokens live in Supabase function secrets and a private database schema that the API does not expose.

One deliberate difference from the original brief: follow-up task creation runs as a SQL function called directly by pg_cron, not as an Edge Function. It needs no network call or secret, so there is less to break.

## Who can sign in

Sign-in is a Supabase magic link (email OTP). No passwords, no Google sign-in.

| Person | Role | Can do |
|---|---|---|
| Advik | admin | Everything, including settings, deleting records, connecting Gmail |
| Neel | admin | Same |
| Raphy | editor | Create and edit records and tasks. Cannot delete, change settings, or connect Gmail |

The actual email addresses are deliberately not in this repository, because it is public and the login screen is built not to reveal who has access. They live in `supabase/allowlist.local.sql` (git-ignored, on Advik's machine) and in the `allowed_users` table.

Sign-ups are on (`enable_signup = true`), so an allowlisted person's first login creates their account. Anyone else is turned away. The allowlist is enforced on the server in three places:

1. The `before_user_created` Auth hook (`public.hook_before_user_created`) rejects any email not in `allowed_users`.
2. A trigger on `auth.users` rejects the same, in case the hook is ever switched off.
3. Every table's RLS policy requires the caller's JWT email to be in `allowed_users`; roles come from that table.

The login screen shows the same "check your email" message for any address.

To change who has access, edit `supabase/allowlist.local.sql` and run it (`npx supabase db query --remote -f supabase/allowlist.local.sql --yes`), or edit `public.allowed_users` in the Supabase SQL editor. They can then sign in; their first login creates the account. To remove someone, delete their row and their user under Authentication → Users.

**Email limits.** Supabase's built-in email sender only delivers to members of the Supabase organization (anyone else silently gets nothing) and allows only about 2 emails per hour for the whole project, and a link must be opened in the same browser that asked for it. If sign-in emails stop arriving, wait an hour. To lift the limit, add a custom SMTP provider (Resend, Postmark, SES) under Authentication → Emails → SMTP Settings; after that you can also uncomment the `magic_link` template block in `supabase/config.toml` to send a branded email that includes a typed code.

## What is already set up

Done from this machine with the Supabase and GitHub CLIs:

- Supabase project created, migrations applied, sample data seeded.
- Auth: sign-ups limited to the allowlist by the hook, Site URL and redirect URLs set to the GitHub Pages URL, three users created.
- Edge Functions deployed; `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY` and `APP_URL` set as function secrets; `project_url` and `cron_secret` stored in Vault for pg_cron.
- pg_cron jobs: `paidi-gmail-sync` (every 15 minutes), `paidi-followups` (hourly), `paidi-oauth-state-cleanup` (hourly).

## What you still need to do (Gmail sync)

Gmail sync needs two secrets only you can create.

### 1. Anthropic API key

Create a key at https://console.anthropic.com/ and set it:

```
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --yes
```

The classifier and summariser use `claude-opus-5-5` by default. Email triage is light work; to cut cost by a wide margin set `CLAUDE_MODEL=claude-haiku-5-5` the same way.

### 2. Google Cloud OAuth client (only used to connect inboxes)

1. https://console.cloud.google.com/ → create a project (for example "PAIDI CRM").
2. APIs & Services → Library → enable **Gmail API**.
3. APIs & Services → OAuth consent screen: User type **External**. App name "PAIDI CRM", your email as support and developer contact. Add the scope `https://www.googleapis.com/auth/gmail.readonly`. Add Advik's and Neel's Gmail addresses as **test users**.
4. APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**. Authorized redirect URI:
   `https://plenngzosfcqmberlwrt.supabase.co/functions/v1/gmail-oauth-callback`
5. Set the client ID and secret:

```
npx supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... --yes
```

**Important:** while the consent screen is in "Testing", Google expires refresh tokens after 7 days, so each inbox would have to be reconnected weekly. Once it works, go to OAuth consent screen → **Publish app** ("In production"). You do not need Google verification for personal use by a handful of accounts: you will see an "unverified app" warning once when connecting, and tokens stop expiring.

### 3. Connect and backfill

1. Sign in as an admin → Settings → **Connect Gmail**. Each admin connects their own inbox.
2. Settings → **Backfill past email** (90 days by default) to pull in earlier outreach. It runs in batches of about 20 threads and continues on its own every 15 minutes.
3. Uncertain threads appear in **Review queue** for an admin to approve or discard.

## Gmail sync rules

- Read-only scope (`gmail.readonly`). The CRM never writes or sends email.
- A thread is PAIDI business if it involves a known contact's email or mentions a PAIDI keyword (both matched locally, no AI call). Otherwise only the sender, recipients, subject and Gmail's short snippet go to Claude, which returns a probability. Promotions, social and no-reply mail are dropped without an AI call.
- At or above the auto threshold (0.8) the thread is logged. Between the review threshold (0.4) and 0.8 it goes to the Review queue. Below that it is ignored.
- Non-PAIDI threads are remembered by Gmail thread id only, so they are not re-read. A database constraint forbids storing their subject, snippet or participants. Discarding a review item wipes its stored content.
- Full message bodies are fetched and summarised only for threads classified as PAIDI.
- Each logged message is deduplicated by Gmail message id. New addresses create a contact, and a company inferred from the email domain (free-mail domains create a company named after the person).
- Stage moves: first outbound email → Contacted; second outbound with no reply → Followed up; any inbound reply → Responded. Never backward, never out of Lost. A reply moves a Nurture prospect back to Responded. Every change is in the company's timeline with an Undo button.
- Follow-ups: 3 days after the last touch with no reply, a task "Follow up with X (call or email, not both)" is created for whoever made that touch. After the third touch goes unanswered for 3 days, the prospect moves to Nurture. Both numbers are in Settings.
- Adding a PAIDI Workspace inbox later needs no schema change: `gmail_accounts.kind` already allows `workspace`.

## Develop

```
npm install
npm run dev               # against the real project; sign in with a magic link
npm run dev -- --mode demo  # in-browser sample data, no login, nothing saved
npm test                  # unit tests for funnel, scoring and follow-up logic
npm run build
```

Demo mode only works on the dev server; production builds ignore it.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: install, test, build, publish `dist/` to GitHub Pages. In the repository, Settings → Pages → Source must be **GitHub Actions**.

Database and functions:

```
npx supabase db push --remote          # apply new migrations (needs SUPABASE_DB_PASSWORD)
npx supabase functions deploy --yes    # redeploy Edge Functions
npx supabase config push --yes         # apply supabase/config.toml auth settings
node scripts/seed-sql.ts               # regenerate supabase/seed.sql from src/demo/spec.ts
npx supabase db query --remote -f supabase/seed.sql --yes   # (re)load sample data
```

The database password is in `.env.supabase.local` on Advik's machine (git-ignored). It can be reset in the Supabase dashboard under Project Settings → Database.

Sample data is flagged `is_sample` and can be removed in one click from Settings → Sample data.

## Setting this up from scratch

If the project ever has to be rebuilt:

1. `npx supabase login`, then `npx supabase projects create paidi-crm --org-id <org> --db-password <pw> --region us-east-1`.
2. Put the new project ref in `supabase/config.toml`, and the new URL and anon key in `.env.production`, `.env.development` and `.env.demo`.
3. `npx supabase link --project-ref <ref>`, `npx supabase db push --remote`, then load the allowlist (copy `supabase/allowlist.example.sql` to `allowlist.local.sql`, fill it in, run it), `npx supabase config push --yes`, `npx supabase functions deploy --yes`.
4. Function secrets: `CRON_SECRET` (random hex), `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64), `APP_URL` (the Pages URL, no trailing slash), `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. Cron secrets in Vault (SQL editor), using the same `CRON_SECRET`:
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url'); select vault.create_secret('<CRON_SECRET>', 'cron_secret');`
6. Authentication → Users → add the three allowlisted emails (auto-confirm).
7. Create the GitHub repository, push, and set Pages → Source to GitHub Actions. Update `site_url` and `additional_redirect_urls` in `supabase/config.toml` if the URL changes.

## Not in v1

Room is left for: sending email and open tracking from the CRM, a PAIDI Google Workspace inbox, and read-only mentor access (a third role in `allowed_users` plus select-only policies).

See [TEST_PLAN.md](TEST_PLAN.md) for a walkthrough that checks everything.
