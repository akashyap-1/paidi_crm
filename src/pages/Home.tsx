import { Phone, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { DepthStrip } from "../components/DepthStrip";
import { TaskSheet } from "../components/forms";
import { PageHeader, useQuick } from "../components/Shell";
import {
  Avatar, cx, EmptyState, ErrorNote, FitDot, Loading, StageChip, TouchSlots, useToast,
} from "../components/ui";
import { buildFunnel, followUpOverdue, hasReply, touchCount } from "../lib/analytics";
import { useCrm, useWrite } from "../lib/data";
import { relativeDay, shortDate, todayIso } from "../lib/format";
import type { Company, Task } from "../lib/types";

export function Home() {
  const crm = useCrm();
  const quick = useQuick();
  const navigate = useNavigate();
  const toast = useToast();
  const write = useWrite();
  const { member } = useAuth();
  const me = member?.id ?? null;
  const today = todayIso();
  const [sheet, setSheet] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [saving, setSaving] = useState<string | null>(null);

  const funnel = useMemo(() => buildFunnel(crm.companies, crm.stageChanges), [crm.companies, crm.stageChanges]);

  // Overdue prospects I own, plus my open automatic follow-up tasks that are due. One row per company.
  const followUps = useMemo(() => {
    const seen = new Map<string, Company>();
    for (const c of crm.companies) {
      if (c.owner_id === me && followUpOverdue(c, crm.interactions, crm.followupDays)) seen.set(c.id, c);
    }
    for (const t of crm.tasks) {
      if (t.source !== "auto" || t.status === "done" || t.assignee_id !== me) continue;
      if (!t.company_id || !t.due_date || t.due_date > today) continue;
      const c = crm.company.get(t.company_id);
      if (c) seen.set(c.id, c);
    }
    return [...seen.values()]
      .map((company) => ({
        company,
        contact: crm.contacts.find((c) => c.company_id === company.id) ?? null,
        touches: touchCount(company.id, crm.interactions),
        replied: hasReply(company.id, crm.interactions),
      }))
      .sort((a, b) => (a.company.last_contacted_at ?? "").localeCompare(b.company.last_contacted_at ?? ""));
  }, [crm.companies, crm.tasks, crm.interactions, crm.contacts, crm.company, crm.followupDays, me, today]);

  const myTasks = useMemo(() => crm.tasks
    .filter((t) => t.assignee_id === me && t.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.created_at.localeCompare(b.created_at)),
  [crm.tasks, me]);

  const replies = useMemo(() => crm.interactions
    .filter((i) => i.type === "email_in")
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 8), [crm.interactions]);

  const newest = useMemo(() => [...crm.companies]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5), [crm.companies]);

  const setDone = async (task: Task, done: boolean) => {
    setSaving(task.id);
    try {
      await write.update("tasks", { id: task.id }, {
        status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null,
      });
      if (done) toast("Task completed", { action: { label: "Undo", run: () => { void setDone(task, false); } } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not work. Try again.", { tone: "error" });
    } finally {
      setSaving(null);
    }
  };

  if (crm.loading) return <Loading label="Loading your day" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  const header = (
    <PageHeader
      title="Home"
      action={<>
        <button className="btn" onClick={() => quick.logTouch()}><Phone size={15} aria-hidden="true" /> Log a touch</button>
        <button className="btn btn-primary hidden lg:inline-flex" onClick={quick.addProspect}><Plus size={16} aria-hidden="true" /> Add prospect</button>
      </>}
    />
  );

  if (crm.companies.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="No prospects yet"
          action={<div className="flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" onClick={quick.addProspect}>Add your first prospect</button>
            <Link className="btn" to="/import">Go to Import</Link>
          </div>}>
          Add a company with the hook that caught your eye, or bring in past outreach from Import.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-mute">
        <h2 className="text-[13.5px] font-bold text-navy">Depth profile</h2>
        <span>Figure: prospects in each stage. Pill: share that went on to the next stage. Magenta marks the weakest step. Select a stage to open it in the pipeline.</span>
      </div>
      <DepthStrip funnel={funnel} onSelect={(s) => navigate(s ? `/pipeline?stage=${s}` : "/pipeline")} />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
        <div className="grid min-w-0 gap-5">
          <Section title="Follow-ups due" count={followUps.length}
            note="A follow-up is a call or an email, not both.">
            {followUps.length === 0 ? (
              <p className="px-4 py-3.5 text-mute">No follow-ups due today</p>
            ) : (
              <ul>
                {followUps.map(({ company: c, contact, touches, replied }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 last:border-b-0">
                    <div className="min-w-0 flex-1 basis-[220px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link to={`/company/${c.id}`} className="truncate font-bold hover:underline">{c.name}</Link>
                        <StageChip stage={c.stage} />
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2.5 text-[12.5px] text-mute">
                        <span className="truncate">{contact ? `${contact.name}${contact.title ? `, ${contact.title}` : ""}` : "No contact yet"}</span>
                        <span className="shrink-0"><TouchSlots used={touches} replied={replied} /></span>
                        <span className="shrink-0 font-semibold text-magenta-dark">Last touch {relativeDay(c.last_contacted_at)}</span>
                      </div>
                    </div>
                    <button className="btn h-10 lg:h-[30px] lg:px-2.5 lg:text-[13px]" onClick={() => quick.logTouch(c.id)}>
                      Log a touch<span className="sr-only"> with {c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="My open tasks" count={myTasks.length}
            action={<>
              <Link to="/tasks" className="link text-[13px]">All tasks</Link>
              <button className="btn btn-sm" onClick={() => setSheet({ open: true, task: null })}>
                <Plus size={15} aria-hidden="true" /> New task
              </button>
            </>}>
            {myTasks.length === 0 ? (
              <p className="px-4 py-3.5 text-mute">Nothing open. Add a task when something needs doing.</p>
            ) : (
              <ul>
                {myTasks.map((t) => {
                  const overdue = !!t.due_date && t.due_date < today;
                  const company = t.company_id ? crm.company.get(t.company_id) : null;
                  return (
                    <li key={t.id} className="flex items-center gap-1 border-b border-line py-1 pl-1.5 pr-4 last:border-b-0">
                      <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center">
                        <input type="checkbox" className="h-[17px] w-[17px] cursor-pointer accent-green" checked={false}
                          disabled={saving === t.id} onChange={() => { void setDone(t, true); }} />
                        <span className="sr-only">Complete {t.title}</span>
                      </label>
                      <div className="min-w-0 flex-1">
                        <button className="block max-w-full truncate text-left font-semibold hover:underline"
                          onClick={() => setSheet({ open: true, task: t })} title="Edit task">
                          {t.title}
                        </button>
                        {company && (
                          <Link to={`/company/${company.id}`} className="block truncate text-[12.5px] text-mute hover:text-navy hover:underline">
                            {company.name}
                          </Link>
                        )}
                      </div>
                      {t.priority === "high" && <span className="chip chip-alert shrink-0">High</span>}
                      <span className={cx("w-[68px] shrink-0 text-right text-[13px]", overdue ? "font-bold text-magenta-dark" : "text-mute")}>
                        {t.due_date ? (t.due_date === today ? "Today" : shortDate(t.due_date)) : "No date"}
                        {overdue && <span className="sr-only"> (overdue)</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 gap-5">
          <Section title="Newest replies">
            {replies.length === 0 ? (
              <p className="px-4 py-3.5 text-mute">No replies yet. Emails received from prospects show up here.</p>
            ) : (
              <ul>
                {replies.map((i) => {
                  const company = crm.company.get(i.company_id);
                  const contact = i.contact_id ? crm.contact.get(i.contact_id) : null;
                  return (
                    <li key={i.id} className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2">
                          {company
                            ? <Link to={`/company/${company.id}`} className="truncate font-bold hover:underline">{company.name}</Link>
                            : <span className="truncate font-bold">Unknown company</span>}
                          {contact && <span className="truncate text-[12.5px] text-mute">{contact.name}</span>}
                          <span className="ml-auto shrink-0 text-[12.5px] text-mute">{relativeDay(i.occurred_at)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[13px]">
                          {i.summary || i.subject || <span className="text-mute">No summary</span>}
                        </p>
                      </div>
                      <span className="mt-0.5"><Avatar member={company?.owner_id ? crm.member.get(company.owner_id) : null} /></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Recently added prospects"
            action={<Link to="/pipeline?view=table" className="link text-[13px]">All prospects</Link>}>
            <ul>
              {newest.map((c) => {
                const hook = crm.research.find((r) => r.company_id === c.id && r.hook)?.hook;
                return (
                  <li key={c.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Link to={`/company/${c.id}`} className="truncate font-bold hover:underline">{c.name}</Link>
                      {c.industry && <span className="hidden shrink-0 text-[12.5px] text-mute sm:inline">{c.industry}</span>}
                      <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[12.5px] text-mute">
                        <FitDot score={c.fit_score} />
                        <span>Added {relativeDay(c.created_at)}</span>
                        <Avatar member={c.owner_id ? crm.member.get(c.owner_id) : null} size={19} />
                      </span>
                    </div>
                    {c.industry && <p className="mt-0.5 truncate text-[12.5px] text-mute sm:hidden">{c.industry}</p>}
                    {hook && <p className="mt-0.5 truncate text-[13px]" title={hook}>{hook}</p>}
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      </div>

      <TaskSheet open={sheet.open} task={sheet.task} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </>
  );
}

function Section({ title, count, note, action, children }: {
  title: string; count?: number; note?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="card min-w-0 overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <h2 className="section-title">{title}</h2>
        {!!count && <span className="text-[13px] font-semibold text-mute">{count}</span>}
        {action && <div className="ml-auto flex items-center gap-3">{action}</div>}
        {note && <p className="w-full text-[12.5px] text-mute">{note}</p>}
      </header>
      {children}
    </section>
  );
}
