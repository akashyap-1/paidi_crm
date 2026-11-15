import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/Shell";
import { EmptyState, ErrorNote, Loading, useToast } from "../components/ui";
import { useTable, useWrite } from "../lib/data";
import { db } from "../lib/db";
import { dateTime, relativeDay } from "../lib/format";
import type { GmailThread } from "../lib/types";

export function Review() {
  const threads = useTable("gmail_threads");
  const accounts = useTable("gmail_accounts");
  const write = useWrite();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [working, setWorking] = useState<string | null>(null);

  const queue = useMemo(
    () => threads.rows.filter((t) => t.status === "review")
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "")),
    [threads.rows],
  );
  const inbox = useMemo(() => new Map(accounts.rows.map((a) => [a.id, a.email])), [accounts.rows]);
  const lastSync = accounts.rows
    .map((a) => a.last_synced_at).filter((d): d is string => !!d).sort().at(-1) ?? null;

  const act = async (id: string, fn: () => Promise<string>) => {
    setWorking(id);
    try {
      toast(await fn());
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not work. Try again.", { tone: "error" });
    } finally {
      setWorking(null);
    }
  };

  const approve = (t: GmailThread) => act(t.id, async () => {
    const { logged } = await db.invoke<{ logged: number }>("gmail-sync", { action: "approve", thread_id: t.id });
    await write.refresh("gmail_threads", "interactions", "companies", "contacts", "stage_changes");
    return logged === 0
      ? "Marked as PAIDI. Its messages were already on the timeline."
      : `Logged ${logged} message${logged === 1 ? "" : "s"} to the timeline`;
  });

  const reject = (t: GmailThread) => act(t.id, async () => {
    await write.rpc("reject_gmail_thread", { p_thread: t.id }, "gmail_threads");
    return "Discarded. The subject and snippet were wiped.";
  });

  if (threads.loading || accounts.loading) return <Loading label="Loading the review queue" />;
  const error = threads.error ?? accounts.error;
  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <PageHeader title="Review queue">
        {queue.length > 0 && <span className="text-[13.5px] font-semibold text-mute">{queue.length} to review</span>}
      </PageHeader>

      <p className="mb-4 max-w-[78ch] text-[13px] text-mute">
        These are Gmail threads the classifier could not place: they might be PAIDI business, or might be personal.
        Logging one adds its messages to the prospect's timeline. Discarding one wipes the stored subject and snippet and keeps only the thread id, so it is never read again.
        {!isAdmin && " An admin approves or rejects these; you can read the queue but not act on it."}
      </p>

      {queue.length === 0 ? (
        <EmptyState title="Nothing to review"
          action={accounts.rows.length === 0 ? <Link to="/settings" className="btn">Open Settings</Link> : undefined}>
          {accounts.rows.length === 0
            ? "No Gmail inbox is connected yet. An admin connects one in Settings."
            : lastSync
              ? `The inboxes last synced ${relativeDay(lastSync)} (${dateTime(lastSync)}). Unclear threads show up here after each sync.`
              : "The connected inboxes have not synced yet. Unclear threads show up here after each sync."}
        </EmptyState>
      ) : (
        <ul className="flex max-w-[920px] flex-col gap-3">
          {queue.map((t) => {
            const pct = t.confidence == null ? null : Math.round(Number(t.confidence) * 100);
            const busy = working === t.id;
            return (
              <li key={t.id} className="card px-4 py-3.5">
                <div className="flex items-baseline gap-3">
                  <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold">{t.subject || "(no subject)"}</h2>
                  <span className="shrink-0 text-[12.5px] text-mute" title={t.last_message_at ? dateTime(t.last_message_at) : undefined}>
                    {relativeDay(t.last_message_at)}
                  </span>
                </div>
                <p className="mt-0.5 break-words text-[13px] text-mute">
                  {t.participants?.length ? t.participants.join(", ") : "No outside participants recorded"}
                  {" · "}in {inbox.get(t.account_id) ?? "a disconnected inbox"}
                  {t.message_count > 1 ? ` · ${t.message_count} messages` : ""}
                </p>
                {t.snippet && <p className="mt-2 line-clamp-3 max-w-[86ch] break-words text-[13.5px]">{t.snippet}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#ebe1c6] pt-2.5 text-[13px]">
                  {pct != null && (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="block h-[6px] w-[72px] overflow-hidden rounded-full bg-sand" aria-hidden="true">
                        <span className="block h-full rounded-full bg-depth-7" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="font-semibold">{pct}% likely PAIDI</span>
                    </span>
                  )}
                  {t.reason && <span className="min-w-0 flex-1 basis-[240px] text-mute">{t.reason}</span>}
                </div>

                {isAdmin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn btn-navy min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={!!working} onClick={() => approve(t)}>
                      {busy ? "Working…" : "It's PAIDI: log it"}
                    </button>
                    <button className="btn min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={!!working} onClick={() => reject(t)}>
                      Not PAIDI: discard
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
