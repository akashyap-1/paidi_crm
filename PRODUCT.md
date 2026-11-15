# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript + Tailwind, built as a static single-page app and published on GitHub Pages (GitHub Actions deploy on push to `main`, hash routing). Everything non-static runs on Supabase: Postgres, Auth, Row Level Security, Edge Functions, pg_cron. Specified by the user; Vite chosen over the Next.js static export they also allowed.

## Users

Three people at PAIDI (Philadelphia AI Development Initiative): Advik Kashyap and Neel Srinivasan (co-founders, `admin`) and Raphy (intern, `editor`). They use it on a laptop for prospecting, pipeline and dashboard work, and on a phone to log a call right after hanging up. The most frequent job is adding and researching prospects: entering a company and contact with the personalization hook before outreach.

## Product Purpose

An internal CRM with two jobs: track every prospect and every interaction, and show where people drop out of the sales funnel. PAIDI builds AI automation tools for small companies and finds clients through cold email, cold calls and referrals.

## Operating Context

- Outreach runs on a 3-touch cadence; a follow-up is a call or an email, not both.
- Pipeline: Researched, Contacted, Followed up, Responded, Call held, Proposal sent, Pilot, Client. Side states: Lost (reason required) and Nurture (re-contact later, once there are more client logos).
- Best-fit prospects are 30 to 60 person firms in accounting, legal and compliance-heavy work; multinationals and finance score lower.
- Email happens in each founder's personal Gmail. There is no PAIDI Google Workspace yet.
- Backfill on day one: about 50 emails and 15 calls already done.

## Capabilities and Constraints

- Sign-in is Supabase magic link / email OTP, limited to three allowlisted emails and enforced server side. The login screen gives the same generic message for any email.
- Admins can do everything, including settings, deleting records and connecting Gmail. The editor can create and edit records and tasks, and cannot delete or change settings.
- Nobody leaves the database unless flagged "do not contact".
- Gmail is read-only (`gmail.readonly`). The CRM never writes or sends email.
- Non-PAIDI email is never stored or shown. For classification, known contacts and PAIDI keywords match locally; otherwise only sender, recipients, subject and the Gmail snippet go to the Claude API. Full bodies go to Claude only after a thread is classified as PAIDI.
- Automatic stage changes only move forward, are logged, and can be undone.
- No secrets in the front end: only the Supabase URL and anon key reach the browser.
- Not in v1, but leave room: open tracking and sending email from the CRM, a PAIDI Workspace inbox, read-only mentor access.

## Evidence on Hand

No real prospect data, logo, or brand assets are in the repository. The app ships with seeded sample data, which must read as sample data and be replaceable.

## Product Principles

1. Adding a prospect with its research is the fastest path in the app.
2. Every interaction lands on a timeline; nothing about a prospect lives only in someone's head or inbox.
3. The funnel has to show where prospects drop out, not just how many there are.
4. Automation is visible and reversible: every automatic change is logged and can be undone.
5. Personal inboxes stay personal: only PAIDI business enters the CRM.
