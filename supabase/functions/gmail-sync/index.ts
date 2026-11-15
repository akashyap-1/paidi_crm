// Read-only Gmail sync. Triggered every 15 minutes by pg_cron (shared secret)
// or by an admin from the app (backfill, approving a review-queue thread).
//
// Privacy rules enforced here:
//   - Known contacts and PAIDI keywords are matched locally, with no AI call.
//   - Otherwise only headers and Gmail's snippet go to Claude.
//   - Message bodies are fetched and summarised only for PAIDI threads.
//   - Non-PAIDI threads are remembered by id only.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  adminClient, corsHeaders, decryptToken, env, gmailGet, googleToken, json,
  memberFromRequest, timingSafeEqual,
} from "../_shared/common.ts";
import { classifyThread, summarizeMessages } from "../_shared/claude.ts";

const TIME_BUDGET_MS = 100_000;
const THREADS_PER_RUN = 20;
const BODY_CHAR_LIMIT = 8000;
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "msn.com", "comcast.net",
]);
const BULK_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"];
const BULK_SENDER = /(no-?reply|do-?not-?reply|notifications?@|mailer-daemon|newsletter|bounce)/i;

interface GmailHeader { name: string; value: string }
interface GmailPart { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] }
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}
interface Address { name: string; email: string }
interface Account {
  id: string; team_member_id: string; email: string;
  sync_after: string | null; backfill_days: number | null;
  backfill_page_token: string | null; backfill_pending: boolean;
}
interface Ctx {
  db: SupabaseClient;
  account: Account;
  accessToken: string;
  teamEmails: Set<string>;
  keywords: string[];
  autoThreshold: number;
  reviewThreshold: number;
}

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseAddresses(value: string): Address[] {
  const out: Address[] = [];
  for (const part of value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const m = part.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    const email = (m ? m[2] : part).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    out.push({ name: m ? m[1].trim() : "", email });
  }
  return out;
}

function titleCase(s: string): string {
  return s.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function decodeBody(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function plainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  for (const p of part.parts ?? []) {
    const text = plainText(p);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBody(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  }
  return "";
}

/** Drops quoted replies and caps length; the model is told when text was cut. */
function cleanBody(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^On .+wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line)) break;
    if (line.startsWith(">")) continue;
    lines.push(line);
  }
  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body.length > BODY_CHAR_LIMIT
    ? `${body.slice(0, BODY_CHAR_LIMIT)}\n[message cut at ${BODY_CHAR_LIMIT} characters]`
    : body;
}

function isOutbound(msg: GmailMessage, ctx: Ctx): boolean {
  const from = parseAddresses(header(msg, "From"))[0]?.email;
  return (msg.labelIds ?? []).includes("SENT") || from === ctx.account.email;
}

function externalAddresses(msgs: GmailMessage[], ctx: Ctx): Address[] {
  const seen = new Map<string, Address>();
  for (const m of msgs) {
    for (const h of ["From", "To", "Cc"]) {
      for (const a of parseAddresses(header(m, h))) {
        if (!ctx.teamEmails.has(a.email) && !seen.has(a.email)) seen.set(a.email, a);
        else if (a.name && seen.has(a.email) && !seen.get(a.email)!.name) seen.set(a.email, a);
      }
    }
  }
  return [...seen.values()];
}

// --- Classification ---------------------------------------------------------

async function classify(
  msgs: GmailMessage[], externals: Address[], ctx: Ctx,
): Promise<{ status: "paidi" | "review" | "ignored"; confidence: number; method: string; reason: string }> {
  if (externals.length === 0) {
    return { status: "ignored", confidence: 0, method: "contact", reason: "" };
  }
  const { data: known } = await ctx.db
    .from("contacts").select("email").in("email", externals.map((a) => a.email)).limit(1);
  if (known && known.length > 0) {
    return { status: "paidi", confidence: 1, method: "contact", reason: "Involves a known contact." };
  }
  const subject = header(msgs[0], "Subject");
  const haystack = `${subject} ${msgs.map((m) => m.snippet ?? "").join(" ")}`.toLowerCase();
  if (ctx.keywords.some((k) => haystack.includes(k))) {
    return { status: "paidi", confidence: 0.95, method: "keyword", reason: "Mentions PAIDI." };
  }
  const labels = new Set(msgs.flatMap((m) => m.labelIds ?? []));
  const senders = msgs.map((m) => header(m, "From"));
  if (BULK_LABELS.some((l) => labels.has(l)) || senders.every((s) => BULK_SENDER.test(s))) {
    return { status: "ignored", confidence: 0, method: "keyword", reason: "" };
  }
  const result = await classifyThread({
    subject,
    messages: msgs.map((m) => ({
      from: header(m, "From"), to: header(m, "To"), cc: header(m, "Cc"),
      date: header(m, "Date"), snippet: m.snippet ?? "",
    })),
  });
  const status = result.probability >= ctx.autoThreshold
    ? "paidi"
    : result.probability >= ctx.reviewThreshold ? "review" : "ignored";
  return { status, confidence: result.probability, method: "ai", reason: result.reason };
}

// --- Logging a PAIDI thread onto the timeline --------------------------------

async function findOrCreateContact(
  addr: Address, outbound: boolean, ctx: Ctx,
): Promise<{ contactId: string; companyId: string }> {
  const { data: existing } = await ctx.db
    .from("contacts").select("id, company_id").eq("email", addr.email).maybeSingle();
  if (existing) return { contactId: existing.id, companyId: existing.company_id };

  const [local, domain] = addr.email.split("@");
  const contactName = addr.name || titleCase(local);
  const corporate = !FREE_MAIL.has(domain);
  let companyId: string | null = null;
  if (corporate) {
    const { data: co } = await ctx.db.from("companies").select("id").ilike("domain", domain).maybeSingle();
    companyId = co?.id ?? null;
  }
  if (!companyId) {
    const { data: co, error } = await ctx.db.from("companies").insert({
      name: corporate ? titleCase(domain.split(".").slice(0, -1).join(" ")) : contactName,
      domain: corporate ? domain : null,
      website: corporate ? `https://${domain}` : null,
      source: outbound ? "cold_email" : "other",
      source_detail: "Created automatically from Gmail",
      owner_id: ctx.account.team_member_id,
      created_by: ctx.account.team_member_id,
      stage: "researched",
    }).select("id").single();
    if (error) throw error;
    companyId = co.id;
  }
  const { data: contact, error } = await ctx.db.from("contacts").insert({
    company_id: companyId,
    name: contactName,
    email: addr.email,
    owner_id: ctx.account.team_member_id,
    created_by: ctx.account.team_member_id,
  }).select("id").single();
  if (error) throw error;
  return { contactId: contact.id, companyId: companyId! };
}

async function logThread(threadId: string, ctx: Ctx): Promise<number> {
  const full = await gmailGet<{ messages: GmailMessage[] }>(
    ctx.accessToken, `threads/${threadId}`, new URLSearchParams({ format: "full" }),
  );
  const msgs = (full.messages ?? []).filter((m) => !(m.labelIds ?? []).includes("DRAFT"));
  const { data: logged } = await ctx.db
    .from("interactions").select("gmail_message_id").in("gmail_message_id", msgs.map((m) => m.id));
  const done = new Set((logged ?? []).map((r) => r.gmail_message_id));
  const fresh = msgs.filter((m) => !done.has(m.id));
  if (fresh.length === 0) return 0;

  const externals = externalAddresses(msgs, ctx);
  if (externals.length === 0) return 0;
  const subject = header(msgs[0], "Subject");
  const summaries = await summarizeMessages(subject, fresh.map((m) => ({
    id: m.id,
    direction: isOutbound(m, ctx) ? "sent" : "received",
    from: header(m, "From"),
    body: cleanBody(plainText(m.payload)) || (m.snippet ?? ""),
  })));

  let count = 0;
  fresh.sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));
  for (const m of fresh) {
    const outbound = isOutbound(m, ctx);
    const candidates = outbound
      ? [...parseAddresses(header(m, "To")), ...parseAddresses(header(m, "Cc"))]
      : parseAddresses(header(m, "From"));
    const addr = candidates.find((a) => !ctx.teamEmails.has(a.email)) ?? externals[0];
    const named = externals.find((e) => e.email === addr.email && e.name) ?? addr;
    const { contactId, companyId } = await findOrCreateContact(named, outbound, ctx);
    const type = outbound ? "email_out" : "email_in";
    const { error } = await ctx.db.from("interactions").upsert({
      company_id: companyId,
      contact_id: contactId,
      type,
      occurred_at: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
      team_member_id: ctx.account.team_member_id,
      subject,
      summary: summaries.get(m.id) ?? m.snippet ?? null,
      gmail_thread_id: threadId,
      gmail_message_id: m.id,
      thread_url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(ctx.account.email)}#all/${threadId}`,
      source: "gmail",
    }, { onConflict: "gmail_message_id", ignoreDuplicates: true });
    if (error) throw error;
    const { error: autoErr } = await ctx.db.rpc("apply_email_automation", {
      p_company: companyId, p_trigger: type,
    });
    if (autoErr) throw autoErr;
    count++;
  }
  return count;
}

async function handleThread(threadId: string, ctx: Ctx): Promise<void> {
  const { data: row } = await ctx.db.from("gmail_threads")
    .select("id, status, message_count")
    .eq("account_id", ctx.account.id).eq("gmail_thread_id", threadId).maybeSingle();
  if (row?.status === "rejected") return;

  const meta = await gmailGet<{ messages: GmailMessage[] }>(
    ctx.accessToken, `threads/${threadId}`,
    new URLSearchParams([
      ["format", "metadata"], ["metadataHeaders", "From"], ["metadataHeaders", "To"],
      ["metadataHeaders", "Cc"], ["metadataHeaders", "Subject"], ["metadataHeaders", "Date"],
    ]),
  );
  const msgs = (meta.messages ?? []).filter((m) => !(m.labelIds ?? []).includes("DRAFT"));
  if (msgs.length === 0 || (row && row.message_count === msgs.length)) return;

  const externals = externalAddresses(msgs, ctx);
  const verdict = row?.status === "paidi"
    ? { status: "paidi" as const, confidence: 1, method: "manual", reason: "Already tracked." }
    : await classify(msgs, externals, ctx);
  const keep = verdict.status !== "ignored";
  const last = msgs[msgs.length - 1];
  const record = {
    account_id: ctx.account.id,
    gmail_thread_id: threadId,
    status: verdict.status,
    message_count: msgs.length,
    last_message_at: new Date(Number(last.internalDate ?? Date.now())).toISOString(),
    ...(row?.status === "paidi" ? {} : {
      confidence: keep ? verdict.confidence : null,
      method: keep ? verdict.method : null,
      reason: keep ? verdict.reason : null,
    }),
    subject: keep ? header(msgs[0], "Subject") : null,
    snippet: keep ? (last.snippet ?? null) : null,
    participants: keep ? externals.map((a) => a.email) : null,
  };
  const { error } = await ctx.db.from("gmail_threads")
    .upsert(record, { onConflict: "account_id,gmail_thread_id" });
  if (error) throw error;
  if (verdict.status === "paidi") await logThread(threadId, ctx);
}

// --- Per-account run ---------------------------------------------------------

async function buildCtx(db: SupabaseClient, account: Account): Promise<Ctx> {
  const { data: enc, error } = await db.rpc("gmail_token_get", { p_account: account.id });
  if (error || !enc) throw new Error("No stored Gmail token; reconnect this inbox.");
  const { access_token } = await googleToken({
    grant_type: "refresh_token",
    refresh_token: await decryptToken(enc as string),
  });
  const [{ data: team }, { data: accounts }, { data: settings }] = await Promise.all([
    db.from("allowed_users").select("email"),
    db.from("gmail_accounts").select("email"),
    db.from("settings").select("key, value"),
  ]);
  const setting = (key: string, fallback: unknown) =>
    settings?.find((s) => s.key === key)?.value ?? fallback;
  return {
    db, account, accessToken: access_token,
    teamEmails: new Set([...(team ?? []), ...(accounts ?? [])].map((r) => r.email.toLowerCase())),
    keywords: (setting("paidi_keywords", ["paidi"]) as string[]).map((k) => k.toLowerCase()),
    autoThreshold: Number(setting("classify_auto_threshold", 0.8)),
    reviewThreshold: Number(setting("classify_review_threshold", 0.4)),
  };
}

async function syncAccount(db: SupabaseClient, account: Account, deadline: number) {
  const ctx = await buildCtx(db, account);
  const startedAt = new Date();
  const base = "-in:chats -in:spam -in:trash -in:drafts";
  const backfill = account.backfill_pending;
  const q = backfill
    ? `newer_than:${account.backfill_days ?? 90}d ${base}`
    : `after:${Math.floor((new Date(account.sync_after ?? Date.now() - 86_400_000).getTime() - 3_600_000) / 1000)} ${base}`;

  let pageToken = backfill ? account.backfill_page_token ?? undefined : undefined;
  let processed = 0;
  let finished = false;
  while (!finished && processed < THREADS_PER_RUN && Date.now() < deadline) {
    const params = new URLSearchParams({ q, maxResults: "10" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gmailGet<{ threads?: { id: string }[]; nextPageToken?: string }>(
      ctx.accessToken, "threads", params,
    );
    let pageDone = true;
    for (const t of page.threads ?? []) {
      if (Date.now() >= deadline) { pageDone = false; break; }
      await handleThread(t.id, ctx);
      processed++;
    }
    if (!pageDone) break;
    pageToken = page.nextPageToken;
    if (!pageToken) finished = true;
  }

  // Unfinished work is picked up next run: handled threads are skipped by message count.
  const patch: Record<string, unknown> = {
    status: "active", last_error: null, last_synced_at: new Date().toISOString(),
  };
  if (backfill) {
    patch.backfill_pending = !finished;
    patch.backfill_page_token = finished ? null : pageToken ?? null;
    if (finished && !account.sync_after) patch.sync_after = startedAt.toISOString();
  } else if (finished) {
    patch.sync_after = startedAt.toISOString();
  }
  await db.from("gmail_accounts").update(patch).eq("id", account.id);
  return { account: account.email, processed, finished, backfill };
}

async function runAccounts(db: SupabaseClient, accounts: Account[]) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const results = [];
  for (const account of accounts) {
    try {
      results.push(await syncAccount(db, account, deadline));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Sync failed for ${account.email}: ${message}`);
      await db.from("gmail_accounts").update({
        status: "error",
        last_error: /invalid_grant/.test(message)
          ? "Google access was revoked or expired. Reconnect this inbox."
          : message.slice(0, 300),
      }).eq("id", account.id);
      results.push({ account: account.email, error: true });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "sync";

    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = !!cronSecret && timingSafeEqual(cronSecret, env("CRON_SECRET"));
    const member = isCron ? null : await memberFromRequest(db, req);
    if (!isCron && member?.role !== "admin") return json({ error: "Admins only" }, 403);

    const cols = "id, team_member_id, email, sync_after, backfill_days, backfill_page_token, backfill_pending";

    if (action === "sync") {
      const { data } = await db.from("gmail_accounts").select(cols).in("status", ["active", "error"]);
      return json({ results: await runAccounts(db, (data ?? []) as Account[]) });
    }

    if (action === "backfill") {
      const days = Math.min(365, Math.max(1, Number(body.days) || 90));
      const { data: account } = await db.from("gmail_accounts")
        .update({ backfill_pending: true, backfill_days: days, backfill_page_token: null })
        .eq("id", body.account_id).neq("status", "disconnected").select(cols).maybeSingle();
      if (!account) return json({ error: "Inbox not found or disconnected." }, 404);
      return json({ results: await runAccounts(db, [account as Account]) });
    }

    if (action === "approve") {
      const { data: thread } = await db.from("gmail_threads")
        .select("id, gmail_thread_id, account_id").eq("id", body.thread_id).eq("status", "review").maybeSingle();
      if (!thread) return json({ error: "That thread is no longer in the review queue." }, 404);
      const { data: account } = await db.from("gmail_accounts").select(cols).eq("id", thread.account_id).single();
      const ctx = await buildCtx(db, account as Account);
      await db.from("gmail_threads").update({
        status: "paidi", method: "manual", reviewed_by: member?.id ?? null, reviewed_at: new Date().toISOString(),
      }).eq("id", thread.id);
      const logged = await logThread(thread.gmail_thread_id, ctx);
      return json({ logged });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Sync failed" }, 500);
  }
});
