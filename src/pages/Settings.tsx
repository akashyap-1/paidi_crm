import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/Shell";
import { Avatar, cx, ErrorNote, Field, Loading, useAction, useToast } from "../components/ui";
import { useCrm, useTable, useWrite } from "../lib/data";
import { db } from "../lib/db";
import { dateTime, relativeDay } from "../lib/format";
import type { GmailAccount, Setting, TableName } from "../lib/types";

/** What the OAuth callback reports back in `?gmail=`, in plain words. */
const GMAIL_RESULT: Record<string, { message: string; ok?: boolean }> = {
  connected: { message: "Gmail connected. It syncs every 15 minutes. Use Backfill past email to bring in older threads.", ok: true },
  cancelled: { message: "Gmail was not connected: the Google sign-in was cancelled." },
  expired: { message: "That Google sign-in took too long and expired. Choose Connect Gmail to start again." },
  forbidden: { message: "Only admins can connect a Gmail inbox." },
  no_refresh_token: { message: "Google did not grant ongoing access. Remove PAIDI CRM from your Google Account's third-party access, then connect again." },
  scope_denied: { message: "Read-only Gmail access was not allowed on the Google screen. Connect again and tick it." },
  error: { message: "Gmail could not be connected. Try again." },
};

const SYNC_TABLES: TableName[] = ["gmail_accounts", "gmail_threads", "interactions", "companies", "contacts", "stage_changes", "tasks"];

interface SyncResult { account: string; processed?: number; finished?: boolean; error?: boolean }

function settingValue(settings: Setting[], key: string): unknown {
  return settings.find((s) => s.key === key)?.value;
}
function settingNumber(settings: Setting[], key: string, fallback: number): number {
  const n = Number(settingValue(settings, key));
  return Number.isFinite(n) && settingValue(settings, key) != null ? n : fallback;
}

export function Settings() {
  const crm = useCrm();
  const accounts = useTable("gmail_accounts");
  const settings = useTable("settings");
  const write = useWrite();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    const result = params.get("gmail");
    if (!result || handled.current) return;
    handled.current = true;
    const { message, ok } = GMAIL_RESULT[result] ?? GMAIL_RESULT.error;
    toast(message, { tone: ok ? "ok" : "error" });
    if (ok) void write.refresh("gmail_accounts");
    const next = new URLSearchParams(params);
    next.delete("gmail");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (crm.loading || accounts.loading || settings.loading) return <Loading label="Loading settings" />;
  const error = crm.error ?? accounts.error ?? settings.error;
  if (error) return <ErrorNote error={error} />;

  const hasSample = crm.companies.some((c) => c.is_sample) || crm.tasks.some((t) => t.is_sample) || crm.templates.some((t) => t.is_sample);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex max-w-[920px] flex-col gap-5">
        <GmailCard accounts={accounts.rows} defaultDays={settingNumber(settings.rows, "backfill_days", 90)} />
        <AutomationCard settings={settings.rows} />

        <Card title="Team">
          <ul>
            {crm.team.map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-b border-[#e9dfc3] py-2.5 last:border-b-0">
                <Avatar member={m} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.display_name}</p>
                  <p className="truncate text-[13px] text-mute">{m.email}</p>
                </div>
                <span className={cx("chip capitalize", m.role === "admin" ? "bg-navy text-buff" : "chip-plain")}>{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="hint mt-3">
            Only these addresses can sign in. Admins can delete records, change settings and connect Gmail; editors can add and edit.
            To add or remove someone, change the allowlist in the database (the allowed_users table).
          </p>
        </Card>

        {isAdmin && hasSample && <SampleCard />}
      </div>
    </>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card px-4 py-4 sm:px-5" aria-label={title}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="section-title mr-auto">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

// --- Gmail inboxes -----------------------------------------------------------

function GmailCard({ accounts, defaultDays }: { accounts: GmailAccount[]; defaultDays: number }) {
  const crm = useCrm();
  const write = useWrite();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [working, setWorking] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<{ message: string; ok?: boolean }>) => {
    setWorking(key);
    try {
      const { message, ok = true } = await fn();
      toast(message, { tone: ok ? "ok" : "error" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not work. Try again.", { tone: "error" });
    } finally {
      setWorking(null);
    }
  };

  const connect = () => act("connect", async () => {
    const { url } = await db.invoke<{ url: string }>("gmail-oauth-start", {});
    window.location.href = url;
    return { message: "Opening the Google sign-in" };
  });

  const sync = () => act("sync", async () => {
    const { results = [] } = await db.invoke<{ results?: SyncResult[] }>("gmail-sync", { action: "sync" });
    await write.refresh(...SYNC_TABLES);
    const failed = results.filter((r) => r.error).length;
    if (failed) return { ok: false, message: `${failed} of ${results.length} inbox${results.length === 1 ? "" : "es"} could not sync. The reason is shown on the inbox.` };
    if (results.length === 0) return { message: "No connected inbox to sync" };
    const threads = results.reduce((n, r) => n + (r.processed ?? 0), 0);
    return { message: `Synced ${results.length} inbox${results.length === 1 ? "" : "es"}: ${threads} thread${threads === 1 ? "" : "s"} checked` };
  });

  const daysFor = (a: GmailAccount) => days[a.id] ?? String(defaultDays);
  const daysValid = (a: GmailAccount) => {
    const n = Number(daysFor(a));
    return Number.isInteger(n) && n >= 1 && n <= 365;
  };

  const backfill = (a: GmailAccount) => act(`backfill:${a.id}`, async () => {
    const { results = [] } = await db.invoke<{ results?: SyncResult[] }>(
      "gmail-sync", { action: "backfill", account_id: a.id, days: Number(daysFor(a)) },
    );
    await write.refresh(...SYNC_TABLES);
    const r = results[0];
    if (!r || r.error) return { ok: false, message: "The backfill could not run. The reason is shown on the inbox." };
    return {
      message: r.finished
        ? `Backfill finished: ${r.processed ?? 0} threads checked`
        : `Backfill started: ${r.processed ?? 0} threads checked so far. The rest continues every 15 minutes.`,
    };
  });

  const disconnect = (a: GmailAccount) => act(`disconnect:${a.id}`, async () => {
    await write.rpc("disconnect_gmail", { p_account: a.id }, "gmail_accounts");
    setConfirm(null);
    return { message: `${a.email} disconnected` };
  });

  const anyLive = accounts.some((a) => a.status !== "disconnected");

  return (
    <Card
      title="Gmail inboxes"
      action={isAdmin && (
        <>
          {anyLive && (
            <button className="btn btn-sm" disabled={!!working} onClick={sync}>
              <RefreshCw size={15} aria-hidden="true" /> {working === "sync" ? "Syncing…" : "Sync now"}
            </button>
          )}
          <button className={cx("btn btn-sm", !anyLive && "btn-primary")} disabled={!!working} onClick={connect}>
            <Plus size={15} aria-hidden="true" /> {working === "connect" ? "Opening Google…" : "Connect Gmail"}
          </button>
        </>
      )}
    >
      <p className="max-w-[78ch] text-[13px] text-mute">
        Access is read-only: the CRM cannot send, change or delete email. Each admin connects their own inbox.
        Only threads that are PAIDI business are stored; everything else is remembered by its thread id and nothing more.
        {isAdmin ? " Editors cannot connect Gmail." : " Editors cannot connect Gmail, so there is nothing for you to set up here."}
      </p>

      {accounts.length === 0 ? (
        <p className="mt-3 rounded-[12px] border border-dashed border-[#cbbf9b] px-4 py-5 text-center text-mute">
          No inbox is connected yet.{isAdmin ? " Choose Connect Gmail to sign in with Google and pick your inbox." : " An admin can connect theirs."}
        </p>
      ) : (
        <ul className="mt-3">
          {accounts.map((a) => {
            const owner = crm.member.get(a.team_member_id)?.display_name;
            const live = a.status !== "disconnected";
            return (
              <li key={a.id} className="border-t border-[#e9dfc3] py-3">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <p className="min-w-0 truncate font-bold">{a.email}</p>
                  <span className={cx("chip", a.status === "active" ? "chip-good" : a.status === "error" ? "chip-alert" : "chip-plain")}>
                    {a.status === "active" ? "Active" : a.status === "error" ? "Sync error" : "Disconnected"}
                  </span>
                  {a.backfill_pending && <span className="chip chip-warn">Backfill running</span>}
                </div>
                <p className="mt-0.5 text-[13px] text-mute">
                  {owner ? `${owner}'s inbox` : "Owner no longer on the team"}
                  {" · "}
                  {a.last_synced_at ? `Last synced ${relativeDay(a.last_synced_at)} (${dateTime(a.last_synced_at)})` : "Not synced yet"}
                  {a.backfill_pending && a.backfill_days ? ` · Reading the past ${a.backfill_days} days in batches` : ""}
                </p>
                {a.status === "error" && a.last_error && (
                  <p className="mt-1.5 break-words text-[13px] font-medium text-magenta-dark" role="alert">{a.last_error}</p>
                )}

                {isAdmin && live && (
                  confirm === a.id ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <p className="basis-full text-[13px] text-magenta-dark sm:basis-auto">
                        Disconnect this inbox? Syncing stops and the stored Google access is deleted. Email already logged stays.
                      </p>
                      <button className="btn btn-sm btn-danger" disabled={!!working} onClick={() => disconnect(a)}>
                        {working === `disconnect:${a.id}` ? "Disconnecting…" : "Disconnect inbox"}
                      </button>
                      <button className="btn btn-sm" onClick={() => setConfirm(null)}>Keep connected</button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex flex-wrap items-end gap-2">
                      <label className="flex items-center gap-2 text-[13px] font-semibold">
                        Past days
                        <input
                          type="number" min={1} max={365} inputMode="numeric" className="input !h-[30px] !w-[76px] !px-2"
                          value={daysFor(a)} aria-invalid={!daysValid(a)}
                          onChange={(e) => setDays((d) => ({ ...d, [a.id]: e.target.value }))}
                        />
                      </label>
                      <button className="btn btn-sm" disabled={!!working || !daysValid(a)} onClick={() => backfill(a)}>
                        {working === `backfill:${a.id}` ? "Reading…" : a.backfill_pending ? "Restart backfill" : "Backfill past email"}
                      </button>
                      <button className="btn btn-sm btn-ghost btn-danger sm:ml-auto" disabled={!!working} onClick={() => setConfirm(a.id)}>
                        Disconnect
                      </button>
                      {!daysValid(a) && <p className="basis-full text-[12.5px] text-magenta-dark" role="alert">Enter a whole number of days from 1 to 365.</p>}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {isAdmin && anyLive && (
        <p className="hint mt-1">
          A backfill reads past email in batches of about 20 threads. It starts now and continues by itself every 15 minutes until the whole period is read.
        </p>
      )}
    </Card>
  );
}

// --- Automation settings -----------------------------------------------------

type AutoKey = "followup_days" | "max_touches" | "classify_auto_threshold" | "classify_review_threshold" | "backfill_days" | "paidi_keywords";

function AutomationCard({ settings }: { settings: Setting[] }) {
  const write = useWrite();
  const { isAdmin } = useAuth();
  const { busy, run } = useAction();
  const keywords = settingValue(settings, "paidi_keywords");
  const [f, setF] = useState<Record<AutoKey, string>>(() => ({
    followup_days: String(settingNumber(settings, "followup_days", 3)),
    max_touches: String(settingNumber(settings, "max_touches", 3)),
    classify_auto_threshold: String(settingNumber(settings, "classify_auto_threshold", 0.8)),
    classify_review_threshold: String(settingNumber(settings, "classify_review_threshold", 0.4)),
    backfill_days: String(settingNumber(settings, "backfill_days", 90)),
    paidi_keywords: (Array.isArray(keywords) ? keywords : ["paidi"]).join(", "),
  }));
  const [errors, setErrors] = useState<Partial<Record<AutoKey, string>>>({});
  const set = (key: AutoKey) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [key]: e.target.value }));

  const parsed = (): Record<AutoKey, unknown> => ({
    followup_days: Number(f.followup_days),
    max_touches: Number(f.max_touches),
    classify_auto_threshold: Number(f.classify_auto_threshold),
    classify_review_threshold: Number(f.classify_review_threshold),
    backfill_days: Number(f.backfill_days),
    paidi_keywords: [...new Set(f.paidi_keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))],
  });
  const next = parsed();
  const changed = (Object.keys(next) as AutoKey[]).filter(
    (k) => JSON.stringify(next[k]) !== JSON.stringify(k === "paidi_keywords" ? settingValue(settings, k) : Number(settingValue(settings, k))),
  );

  const save = (e: FormEvent) => {
    e.preventDefault();
    const err: Partial<Record<AutoKey, string>> = {};
    const whole = (key: AutoKey, min: number, max: number) => {
      const n = next[key] as number;
      if (!f[key].trim() || !Number.isInteger(n) || n < min || n > max) err[key] = `Enter a whole number from ${min} to ${max}.`;
    };
    whole("followup_days", 1, 60);
    whole("max_touches", 1, 10);
    whole("backfill_days", 1, 365);
    const auto = next.classify_auto_threshold as number;
    const review = next.classify_review_threshold as number;
    if (!f.classify_auto_threshold.trim() || !(auto > 0 && auto <= 1)) err.classify_auto_threshold = "Enter a number above 0 and up to 1, such as 0.8.";
    if (!f.classify_review_threshold.trim() || !(review >= 0 && review < 1)) err.classify_review_threshold = "Enter a number from 0 to below 1, such as 0.4.";
    else if (!err.classify_auto_threshold && review >= auto) err.classify_review_threshold = "This must be below the auto-log threshold.";
    if ((next.paidi_keywords as string[]).length === 0) err.paidi_keywords = "Keep at least one keyword.";
    setErrors(err);
    if (Object.keys(err).length) return;
    run(async () => {
      for (const key of changed) await write.update("settings", { key }, { value: next[key] });
    }, "Settings saved");
  };

  const num = (key: AutoKey, label: string, hint: string, step = "1") => (
    <Field label={label} hint={hint} error={errors[key]}>
      <input className="input" type="number" inputMode="decimal" step={step} value={f[key]} onChange={set(key)}
        disabled={!isAdmin} aria-invalid={!!errors[key]} />
    </Field>
  );

  return (
    <Card title="Automation">
      {!isAdmin && <p className="mb-3 text-[13px] text-mute">Only admins can change these. You can see what is in force.</p>}
      <form onSubmit={save} noValidate>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {num("followup_days", "Follow-up delay, in days", "A follow-up comes due this many days after a touch with no reply.")}
          {num("max_touches", "Touches before Nurture", "After this many touches with no reply, the prospect moves to Nurture.")}
          {num("classify_auto_threshold", "Auto-log threshold", "From 0 to 1. A Gmail thread at or above this confidence is logged without asking.", "0.05")}
          {num("classify_review_threshold", "Review threshold", "Between this and the auto-log threshold a thread goes to the review queue. Below it, nothing is stored.", "0.05")}
          {num("backfill_days", "Default backfill, in days", "The starting value for Backfill past email. At most 365.")}
          <Field label="PAIDI keywords" hint="Comma separated. A thread that mentions one is logged as PAIDI without an AI check." error={errors.paidi_keywords}>
            <input className="input" value={f.paidi_keywords} onChange={set("paidi_keywords")} disabled={!isAdmin} aria-invalid={!!errors.paidi_keywords} />
          </Field>
        </div>
        {isAdmin && (
          <div className="mt-4 flex items-center gap-3">
            <button className="btn btn-navy" type="submit" disabled={busy || changed.length === 0}>{busy ? "Saving…" : "Save settings"}</button>
            {changed.length === 0 && <span className="text-[13px] text-mute">No unsaved changes</span>}
          </div>
        )}
      </form>
    </Card>
  );
}

// --- Sample data ---------------------------------------------------------------

function SampleCard() {
  const write = useWrite();
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const remove = () => run(
    () => write.rpc("remove_sample_data", {}, "companies", "contacts", "interactions", "tasks", "templates", "research", "stage_changes"),
    "Sample data removed",
  );
  return (
    <Card title="Sample data">
      <p className="max-w-[78ch] text-[13px] text-mute">
        The CRM was seeded with fictional companies, contacts, touches, tasks and templates so the screens have something to show.
        Removing them leaves everything you added yourself. It cannot be undone.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <span className="text-[13px] text-magenta-dark">Remove every sample company, task and template?</span>
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={remove}>{busy ? "Removing…" : "Remove sample data"}</button>
            <button className="btn btn-sm" onClick={() => setConfirm(false)}>Keep it</button>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirm(true)}>Remove sample data</button>
        )}
      </div>
    </Card>
  );
}
