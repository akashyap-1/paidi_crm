import {
  ArrowLeft, ArrowRightLeft, DoorClosed, Mail, MailOpen, MessageSquare, Pencil, Phone, Plus, Trash2, Users,
  Voicemail, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { TaskSheet } from "../components/forms";
import { useQuick } from "../components/Shell";
import {
  Avatar, cx, EmptyState, ErrorNote, Field, FitDot, Loading, Sheet, TouchSlots, useAction, useToast,
} from "../components/ui";
import { followUpOverdue, hasReply, touchCount } from "../lib/analytics";
import {
  ALL_STAGES, INDUSTRIES, INTERACTION_LABEL, SOURCE_LABEL, STAGE_LABEL, stageClass,
} from "../lib/constants";
import { useCrm, useMoveStage, useTable, useWrite } from "../lib/data";
import { dateTime, domainOf, shortDate, todayIso } from "../lib/format";
import type {
  CallIntel, Company, CompanySource, Contact, Interaction, InteractionType, Research, Stage, StageChange, Task,
} from "../lib/types";

type Crm = ReturnType<typeof useCrm>;
type SheetState =
  | { kind: "company" } | { kind: "lost" }
  | { kind: "research"; row: Research | null }
  | { kind: "contact"; row: Contact | null }
  | { kind: "task"; row: Task | null }
  | null;
type TimelineItem =
  | { kind: "touch"; at: string; touch: Interaction }
  | { kind: "stage"; at: string; change: StageChange };

const TYPE_ICON: Record<InteractionType, LucideIcon> = {
  email_out: Mail, email_in: MailOpen, call: Phone, voicemail: Voicemail,
  gatekeeper: DoorClosed, meeting: Users, linkedin: MessageSquare,
};
const INTEL_FIELDS: [keyof Omit<CallIntel, "interaction_id">, string][] = [
  ["why_took_call", "Why they took the call"], ["pain_points", "Pain points"], ["objections", "Objections"],
  ["lost_interest_at", "Where they lost interest"], ["asks", "Asks"], ["next_step", "Next step"],
];
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
const clean = (v: string) => v.trim() || null;

export function CompanyDetail() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const contactFilter = params.get("contact");
  const crm = useCrm();
  const intel = useTable("call_intel");
  const { isAdmin } = useAuth();
  const quick = useQuick();
  const toast = useToast();
  const move = useMoveStage();
  const write = useWrite();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const [sheet, setSheet] = useState<SheetState>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const timelineRef = useRef<HTMLElement>(null);

  const company = crm.company.get(id);
  const contacts = useMemo(() => crm.contacts.filter((c) => c.company_id === id), [crm.contacts, id]);
  const research = useMemo(() => crm.research.filter((r) => r.company_id === id), [crm.research, id]);
  const changes = useMemo(() => crm.stageChanges.filter((s) => s.company_id === id), [crm.stageChanges, id]);
  const touches = useMemo(() => crm.interactions.filter((i) => i.company_id === id), [crm.interactions, id]);
  const tasks = useMemo(() => crm.tasks
    .filter((t) => t.company_id === id && t.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")), [crm.tasks, id]);
  const intelById = useMemo(() => new Map(intel.rows.map((r) => [r.interaction_id, r])), [intel.rows]);

  const items = useMemo(() => {
    const out: TimelineItem[] = touches
      .filter((t) => !contactFilter || t.contact_id === contactFilter)
      .map((touch) => ({ kind: "touch", at: touch.occurred_at, touch }));
    if (!contactFilter) for (const change of changes) out.push({ kind: "stage", at: change.created_at, change });
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [touches, changes, contactFilter]);

  if (crm.loading) return <Loading label="Loading the prospect" />;
  if (crm.error) return <ErrorNote error={crm.error} />;
  if (!company) {
    return (
      <EmptyState title="This prospect is not in the CRM" action={<Link className="btn" to="/pipeline">Back to the pipeline</Link>}>
        It may have been deleted, or the link is wrong.
      </EmptyState>
    );
  }

  const setContactFilter = (contactId: string | null) => {
    const next = new URLSearchParams(params);
    if (contactId) next.set("contact", contactId); else next.delete("contact");
    setParams(next, { replace: true });
    if (contactId) timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const changeStage = (stage: Stage, reason?: string) => {
    if (company.stage === stage) return;
    const from = company.stage;
    move.mutate({ companyId: company.id, stage, reason }, {
      onSuccess: () => toast(`${company.name} moved to ${STAGE_LABEL[stage]}`, {
        action: from === "lost" ? undefined : { label: "Undo", run: () => move.mutate({ companyId: company.id, stage: from, reason: "Undo" }) },
      }),
      onError: (e) => toast(e.message, { tone: "error" }),
    });
  };
  const patch = (values: Partial<Company>, success?: string) =>
    run(() => write.update("companies", { id: company.id }, values), success);

  const overdue = followUpOverdue(company, crm.interactions, crm.followupDays);
  const filterContact = contactFilter ? crm.contact.get(contactFilter) : null;
  // Only the latest live change can be undone, and only while the prospect is still where it left it.
  const undoable = changes
    .filter((s) => !s.undone_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const canUndo = (s: StageChange) => s.id === undoable?.id && !!s.from_stage && company.stage === s.to_stage;
  const suggested = company.fit_score_suggested;

  return (
    <>
      <header className="mb-5">
        <Link to="/pipeline" className="mb-2 inline-flex h-8 items-center gap-1.5 text-[13px] font-semibold text-mute hover:text-navy">
          <ArrowLeft size={15} aria-hidden="true" /> Pipeline
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="page-title min-w-0 break-words">{company.name}</h1>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn" onClick={() => setSheet({ kind: "task", row: null })}><Plus size={16} aria-hidden="true" /> Add task</button>
            <button className="btn btn-primary" onClick={() => quick.logTouch(company.id)}><Phone size={15} aria-hidden="true" /> Log a touch</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <label>
            <span className="sr-only">Stage for {company.name}</span>
            <select
              className={cx("chip !h-9 cursor-pointer border-0 !px-3 pr-1 !text-[13px] font-semibold", stageClass(company.stage))}
              value={company.stage}
              onChange={(e) => {
                const stage = e.target.value as Stage;
                if (stage === "lost") setSheet({ kind: "lost" }); else changeStage(stage);
              }}
            >
              {ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-2">
            <FitDot score={company.fit_score} />
            <span className="text-mute">Fit</span>
            <select className="input !h-9 !w-auto cursor-pointer font-semibold" value={company.fit_score ?? ""} disabled={busy}
              onChange={(e) => patch({ fit_score: e.target.value ? Number(e.target.value) : null })}>
              {company.fit_score == null && <option value="">Not set</option>}
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {suggested != null && suggested !== company.fit_score && <span className="text-mute">suggested {suggested}</span>}
          </label>
          <span className="inline-flex items-center gap-2 text-mute">
            <TouchSlots used={touchCount(company.id, crm.interactions)} replied={hasReply(company.id, crm.interactions)} /> Touches
          </span>
          <label className="inline-flex items-center gap-2">
            <Avatar member={company.owner_id ? crm.member.get(company.owner_id) : null} />
            <span className="sr-only">Owner</span>
            <select className="input !h-9 !w-auto cursor-pointer" value={company.owner_id ?? ""} disabled={busy}
              onChange={(e) => patch({ owner_id: e.target.value || null }, "Owner changed")}>
              <option value="">Unassigned</option>
              {crm.team.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </label>
          {overdue && <span className="chip chip-alert">Follow-up overdue</span>}
          {company.do_not_contact && <span className="chip chip-plain">Do not contact</span>}
          {company.stage === "lost" && company.lost_reason && <span className="text-mute">Lost: {company.lost_reason}</span>}
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section ref={timelineRef} className="min-w-0 scroll-mt-20 lg:col-span-2" aria-labelledby="timeline-title">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 id="timeline-title" className="section-title">Timeline</h2>
            {contactFilter && (
              <span className="chip chip-plain !h-7 !pr-1">
                Touches with {filterContact?.name ?? "one contact"}
                <button className="grid h-6 w-6 place-items-center rounded-full hover:bg-lane" onClick={() => setContactFilter(null)} aria-label="Show the whole timeline">
                  <X size={13} />
                </button>
              </span>
            )}
          </div>
          {items.length === 0 ? (
            contactFilter ? (
              <EmptyState title={`No touches with ${filterContact?.name ?? "this contact"} yet`}
                action={<button className="btn" onClick={() => setContactFilter(null)}>Show the whole timeline</button>} />
            ) : (
              <EmptyState title="Nothing on the timeline yet"
                action={<button className="btn btn-primary" onClick={() => quick.logTouch(company.id)}>Log the first touch</button>}>
                Calls, emails, meetings and stage changes for {company.name} will collect here.
              </EmptyState>
            )
          ) : (
            <ol className="card divide-y divide-line">
              {items.map((item) => item.kind === "touch" ? (
                <TouchEntry key={item.touch.id} touch={item.touch} crm={crm} intel={intelById.get(item.touch.id)} isAdmin={isAdmin} />
              ) : (
                <StageEntry key={item.change.id} change={item.change} crm={crm} canUndo={canUndo(item.change)} />
              ))}
            </ol>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Section title="Company details" onEdit={() => setSheet({ kind: "company" })}>
            <dl className="text-[13.5px]">
              <Row label="Website">{company.website && <a className="link break-all" href={href(company.website)} target="_blank" rel="noreferrer">{domainOf(company.website)}</a>}</Row>
              <Row label="LinkedIn">{company.linkedin_url && <a className="link" href={href(company.linkedin_url)} target="_blank" rel="noreferrer">Company page</a>}</Row>
              <Row label="Industry">{company.industry}</Row>
              <Row label="Employees">{company.employee_count != null && `${company.employee_count}${company.size_bucket ? ` (${company.size_bucket} bucket)` : ""}`}</Row>
              <Row label="Location">{company.location}</Row>
              <Row label="Source">{(company.source || company.source_detail)
                && [company.source ? SOURCE_LABEL[company.source] : null, company.source_detail].filter(Boolean).join(": ")}</Row>
              <Row label="Notes">{company.notes && <span className="whitespace-pre-wrap">{company.notes}</span>}</Row>
            </dl>
            <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2.5 border-t border-line pt-2 text-[13.5px] font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-navy" checked={company.do_not_contact} disabled={busy}
                onChange={(e) => patch({ do_not_contact: e.target.checked }, e.target.checked ? "Marked do not contact" : "Contact allowed again")} />
              Do not contact
            </label>
          </Section>

          <Section title="Research" onEdit={() => setSheet({ kind: "research", row: null })} editLabel="Add">
            {research.length === 0 && <p className="text-[13.5px] text-mute">No research yet. Add the hook that makes the first touch personal.</p>}
            <ul className="divide-y divide-line">
              {research.map((r) => (
                <li key={r.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                  <dl className="min-w-0 flex-1 text-[13.5px]">
                    <Row label="Hook">{(r.hook || r.hook_url) && <>
                      {r.hook} {r.hook_url && <a className="link" href={href(r.hook_url)} target="_blank" rel="noreferrer">Open link</a>}
                    </>}</Row>
                    <Row label="Common ground" hideEmpty>{r.common_ground}</Row>
                    <Row label="Tool idea" hideEmpty>{r.tool_idea}</Row>
                    <Row label="Notes" hideEmpty>{r.notes && <span className="whitespace-pre-wrap">{r.notes}</span>}</Row>
                  </dl>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSheet({ kind: "research", row: r })} aria-label="Edit this research">
                    <Pencil size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Contacts" onEdit={() => setSheet({ kind: "contact", row: null })} editLabel="Add">
            {contacts.length === 0 && <p className="text-[13.5px] text-mute">No contacts yet. Add the person you plan to reach.</p>}
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-x-2 py-2.5 text-[13.5px] first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button className={cx("text-left font-bold hover:underline", contactFilter === c.id && "underline")}
                        onClick={() => setContactFilter(contactFilter === c.id ? null : c.id)} title="Show this contact's touches in the timeline">
                        {c.name}
                      </button>
                      {c.is_technical && <span className="chip chip-plain">Technical</span>}
                      {c.do_not_contact && <span className="chip chip-alert">Do not contact</span>}
                    </div>
                    {c.title && <p className="text-mute">{c.title}</p>}
                    <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {c.email && <a className="link break-all" href={`mailto:${c.email}`}>{c.email}</a>}
                      {c.phone && <a className="link" href={`tel:${c.phone}`}>{c.phone}</a>}
                      {c.linkedin_url && <a className="link" href={href(c.linkedin_url)} target="_blank" rel="noreferrer">LinkedIn</a>}
                    </p>
                    {c.referral_source && <p className="mt-0.5 text-mute">Introduced by {c.referral_source}</p>}
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSheet({ kind: "contact", row: c })} aria-label={`Edit ${c.name}`}>
                    <Pencil size={15} />
                  </button>
                  {isAdmin && (
                    <ConfirmDelete icon label={`Delete ${c.name}`} success={`${c.name} deleted`}
                      message={`Delete ${c.name}? Their touches stay on the timeline without a contact name.`}
                      onConfirm={async () => { await write.remove("contacts", { id: c.id }); if (contactFilter === c.id) setContactFilter(null); }} />
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Open tasks" onEdit={() => setSheet({ kind: "task", row: null })} editLabel="Add">
            {tasks.length === 0 && <p className="text-[13.5px] text-mute">No open tasks for this prospect.</p>}
            <ul className="divide-y divide-line">
              {tasks.map((t) => <TaskRow key={t.id} task={t} crm={crm} onEdit={() => setSheet({ kind: "task", row: t })} />)}
            </ul>
          </Section>

          {isAdmin && (
            <div className="flex flex-wrap justify-end">
              <ConfirmDelete label="Delete company" success={`${company.name} deleted`}
                message={`Delete ${company.name}? This removes the company with its contacts, timeline and tasks. It cannot be undone.`}
                onConfirm={async () => { await write.remove("companies", { id: company.id }); navigate("/pipeline"); }} />
            </div>
          )}
        </aside>
      </div>

      <LostSheet open={sheet?.kind === "lost"} onClose={closeSheet} name={company.name} onConfirm={(reason) => changeStage("lost", reason)} />
      <CompanySheet open={sheet?.kind === "company"} onClose={closeSheet} company={company} />
      <ResearchSheet open={sheet?.kind === "research"} onClose={closeSheet} companyId={company.id}
        row={sheet?.kind === "research" ? sheet.row : null} />
      <ContactSheet open={sheet?.kind === "contact"} onClose={closeSheet} company={company}
        row={sheet?.kind === "contact" ? sheet.row : null} />
      <TaskSheet open={sheet?.kind === "task"} onClose={closeSheet} companyId={company.id}
        task={sheet?.kind === "task" ? sheet.row : null} />
    </>
  );
}

// --- Small layout pieces -------------------------------------------------------

function Section({ title, onEdit, editLabel = "Edit", children }: {
  title: string; onEdit: () => void; editLabel?: string; children: ReactNode;
}) {
  return (
    <section className="card px-4 py-3.5">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`${editLabel} ${title.toLowerCase()}`}>{editLabel}</button>
      </header>
      {children}
    </section>
  );
}

function Row({ label, children, hideEmpty }: { label: string; children?: ReactNode; hideEmpty?: boolean }) {
  if (!children && hideEmpty) return null;
  return (
    <div className="flex gap-3 py-[3px]">
      <dt className="w-[104px] shrink-0 text-mute">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children || <span className="text-mute">Not set</span>}</dd>
    </div>
  );
}

/** Admin-only delete with an inline confirm step. */
function ConfirmDelete({ label, message, success, onConfirm, icon }: {
  label: string; message: string; success: string; onConfirm: () => Promise<unknown>; icon?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const { busy, run } = useAction();
  if (!asking) {
    return icon
      ? <button className="btn btn-ghost btn-icon btn-sm btn-danger" onClick={() => setAsking(true)} aria-label={label}><Trash2 size={15} /></button>
      : <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <div className="mt-2 basis-full rounded-[10px] border border-magenta/30 bg-magenta-tint px-3 py-2.5 text-[13px] text-magenta-dark" role="alert">
      <p>{message}</p>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn btn-sm" onClick={() => setAsking(false)} disabled={busy}>Keep it</button>
        <button className="btn btn-navy btn-sm" disabled={busy}
          onClick={async () => { if (!(await run(onConfirm, success))) setAsking(false); }}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

// --- Timeline ------------------------------------------------------------------

function TouchEntry({ touch, crm, intel, isAdmin }: { touch: Interaction; crm: Crm; intel?: CallIntel; isAdmin: boolean }) {
  const write = useWrite();
  const Icon = TYPE_ICON[touch.type];
  const who = touch.team_member_id ? crm.member.get(touch.team_member_id)?.display_name : null;
  const contact = touch.contact_id ? crm.contact.get(touch.contact_id) : null;
  const template = touch.template_id ? crm.template.get(touch.template_id) : null;
  const intelRows = intel ? INTEL_FIELDS.filter(([key]) => intel[key]) : [];
  return (
    <li className="flex flex-wrap gap-x-3 px-4 py-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lane text-navy"><Icon size={15} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 text-[13.5px]">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <strong>{INTERACTION_LABEL[touch.type]}</strong>
          {contact && <span>with {contact.name}</span>}
          <span className="text-[12.5px] text-mute">{dateTime(touch.occurred_at)}{who ? ` · ${who}` : ""}</span>
          {touch.source !== "manual" && <span className="chip chip-plain !h-[19px] !px-2 !text-[11px]">{touch.source === "gmail" ? "From Gmail" : "Imported"}</span>}
        </p>
        {touch.subject && <p className="mt-0.5 break-words font-semibold">{touch.subject}</p>}
        {touch.summary && <p className="mt-0.5 whitespace-pre-wrap break-words">{touch.summary}</p>}
        {touch.outcome && <p className="mt-1 break-words"><span className="text-mute">Outcome:</span> {touch.outcome}</p>}
        {intelRows.length > 0 && intel && (
          <dl className="mt-2 rounded-[10px] bg-lane px-3 py-2 text-[13px]">
            {intelRows.map(([key, label]) => (
              <div key={key} className="py-[3px] sm:flex sm:gap-3">
                <dt className="shrink-0 font-semibold sm:w-[168px]">{label}</dt>
                <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words">{intel[key]}</dd>
              </div>
            ))}
          </dl>
        )}
        {(template || touch.thread_url || touch.recording_url) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-mute">
            {template && <span>Template: {template.name} v{template.version}</span>}
            {touch.thread_url && <a className="link" href={touch.thread_url} target="_blank" rel="noreferrer">Open in Gmail</a>}
            {touch.recording_url && <a className="link" href={href(touch.recording_url)} target="_blank" rel="noreferrer">Recording</a>}
          </p>
        )}
      </div>
      {isAdmin && (
        <ConfirmDelete icon label={`Delete this ${INTERACTION_LABEL[touch.type].toLowerCase()} entry`} success="Timeline entry deleted"
          message="Delete this timeline entry? Any call intel logged with it goes too."
          onConfirm={() => write.remove("interactions", { id: touch.id }).then(() => write.refresh("companies", "call_intel"))} />
      )}
    </li>
  );
}

function StageEntry({ change, crm, canUndo }: { change: StageChange; crm: Crm; canUndo: boolean }) {
  const write = useWrite();
  const { busy, run } = useAction();
  const who = change.changed_by ? crm.member.get(change.changed_by)?.display_name : null;
  const undone = !!change.undone_at;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
      <span className="grid h-7 w-7 shrink-0 place-items-center text-mute"><ArrowRightLeft size={15} aria-hidden="true" /></span>
      <span className={cx("min-w-0", undone && "text-mute line-through")}>
        {change.from_stage
          ? <>Moved from <strong>{STAGE_LABEL[change.from_stage]}</strong> to <strong>{STAGE_LABEL[change.to_stage]}</strong></>
          : <>Added as <strong>{STAGE_LABEL[change.to_stage]}</strong></>}
      </span>
      {undone && <span className="chip chip-plain !h-[19px] !px-2 !text-[11px]">Undone</span>}
      {change.automatic && <span className="chip chip-plain !h-[19px] !px-2 !text-[11px]">Automatic</span>}
      <span className="min-w-0 break-words text-[12.5px] text-mute">
        {[dateTime(change.created_at), change.automatic ? null : who, change.reason].filter(Boolean).join(" · ")}
      </span>
      {canUndo && (
        <button className="btn btn-sm ml-auto" disabled={busy}
          onClick={() => run(() => write.rpc("undo_stage_change", { p_change: change.id }, "companies", "stage_changes"),
            `Moved back to ${STAGE_LABEL[change.from_stage!]}`)}>
          {busy ? "Undoing…" : "Undo"}
        </button>
      )}
    </li>
  );
}

function TaskRow({ task, crm, onEdit }: { task: Task; crm: Crm; onEdit: () => void }) {
  const write = useWrite();
  const { busy, run } = useAction();
  const overdue = !!task.due_date && task.due_date < todayIso();
  return (
    <li className="flex items-center gap-1 py-1 text-[13.5px]">
      <label className="-ml-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center">
        <span className="sr-only">Mark "{task.title}" done</span>
        <input type="checkbox" className="h-4 w-4 accent-green" checked={false} disabled={busy}
          onChange={() => run(() => write.update("tasks", { id: task.id }, { status: "done" }), "Task done")} />
      </label>
      <button className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left hover:underline" onClick={onEdit} title="Edit task">
        <span className="min-w-0 flex-1 truncate font-semibold">{task.title}</span>
        {task.due_date && (
          <span className={cx("shrink-0 text-[12.5px]", overdue ? "font-bold text-magenta-dark" : "text-mute")}>
            {shortDate(task.due_date)}{overdue && <span className="sr-only"> (overdue)</span>}
          </span>
        )}
      </button>
      <Avatar member={task.assignee_id ? crm.member.get(task.assignee_id) : null} />
    </li>
  );
}

// --- Sheets --------------------------------------------------------------------

/** Form state that resets to `initial` each time the sheet opens. */
function useForm<T extends object>(open: boolean, initial: T) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(initial); setError(null); } }, [open]); // eslint-disable-line
  const set = (k: keyof T) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  return { f, setF, set, error, setError };
}

function SheetFooter({ form, busy, label, onClose }: { form: string; busy: boolean; label: string; onClose: () => void }) {
  return (
    <>
      <button className="btn" onClick={onClose} type="button">Cancel</button>
      <button className="btn btn-primary" form={form} disabled={busy}>{busy ? "Saving…" : label}</button>
    </>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold sm:col-span-2">
      <input type="checkbox" className="h-4 w-4 accent-navy" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function LostSheet({ open, onClose, name, onConfirm }: { open: boolean; onClose: () => void; name: string; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Sheet
      open={open} onClose={onClose} title={`Mark ${name} as Lost`}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-navy" disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); onClose(); }}>Mark as Lost</button>
      </>}
    >
      <Field label="Why was this lost?" hint="Required. This is what the funnel learns from.">
        <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Chose another tool, no budget this year, too large for us…" />
      </Field>
    </Sheet>
  );
}

function CompanySheet({ open, onClose, company: c }: { open: boolean; onClose: () => void; company: Company }) {
  const write = useWrite();
  const { busy, run } = useAction();
  const { f, setF, set, error, setError } = useForm(open, {
    name: c.name, website: c.website ?? "", linkedin: c.linkedin_url ?? "", industry: c.industry ?? "",
    employees: c.employee_count != null ? String(c.employee_count) : "", location: c.location ?? "",
    source: (c.source ?? "") as CompanySource | "", sourceDetail: c.source_detail ?? "", notes: c.notes ?? "", dnc: c.do_not_contact,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setError("Give the company a name."); return; }
    run(async () => {
      await write.update("companies", { id: c.id }, {
        name: f.name.trim(), website: clean(f.website), domain: domainOf(f.website.trim()), linkedin_url: clean(f.linkedin),
        industry: clean(f.industry), employee_count: f.employees ? Number(f.employees) : null, location: clean(f.location),
        source: f.source || null, source_detail: clean(f.sourceDetail), notes: clean(f.notes), do_not_contact: f.dnc,
      });
      onClose();
    }, "Company details saved");
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit company details" footer={<SheetFooter form="company-form" busy={busy} label="Save details" onClose={onClose} />}>
      <form id="company-form" onSubmit={submit} className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        <Field label="Company name" className="sm:col-span-2" error={error}>
          <input className="input" value={f.name} onChange={set("name")} aria-invalid={!!error} autoComplete="off" />
        </Field>
        <Field label="Website"><input className="input" value={f.website} onChange={set("website")} placeholder="example.com" inputMode="url" /></Field>
        <Field label="LinkedIn"><input className="input" value={f.linkedin} onChange={set("linkedin")} inputMode="url" /></Field>
        <Field label="Industry">
          <input className="input" list="company-industries" value={f.industry} onChange={set("industry")} />
          <datalist id="company-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
        </Field>
        <Field label="Employees" hint="The size bucket follows from this.">
          <input className="input" type="number" min={1} value={f.employees} onChange={set("employees")} inputMode="numeric" />
        </Field>
        <Field label="Location" className="sm:col-span-2"><input className="input" value={f.location} onChange={set("location")} placeholder="Philadelphia, PA" /></Field>
        <Field label="Where we found them">
          <select className="input" value={f.source} onChange={set("source")}>
            <option value="">Choose…</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Source link or detail"><input className="input" value={f.sourceDetail} onChange={set("sourceDetail")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={4} value={f.notes} onChange={set("notes")} /></Field>
        <CheckField label="Do not contact" checked={f.dnc} onChange={(dnc) => setF((p) => ({ ...p, dnc }))} />
      </form>
    </Sheet>
  );
}

function ResearchSheet({ open, onClose, companyId, row }: { open: boolean; onClose: () => void; companyId: string; row: Research | null }) {
  const write = useWrite();
  const { busy, run } = useAction();
  const { f, set, error, setError } = useForm(open, {
    hook: row?.hook ?? "", hookUrl: row?.hook_url ?? "", common: row?.common_ground ?? "", idea: row?.tool_idea ?? "", notes: row?.notes ?? "",
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!Object.values(f).some((v) => v.trim())) { setError("Fill in at least one field."); return; }
    const values = {
      hook: clean(f.hook), hook_url: clean(f.hookUrl), common_ground: clean(f.common), tool_idea: clean(f.idea), notes: clean(f.notes),
    };
    run(async () => {
      if (row) await write.update("research", { id: row.id }, values);
      else await write.insert("research", [{ company_id: companyId, ...values }]);
      onClose();
    }, row ? "Research saved" : "Research added");
  };
  return (
    <Sheet open={open} onClose={onClose} title={row ? "Edit research" : "Add research"}
      footer={<SheetFooter form="research-form" busy={busy} label={row ? "Save research" : "Add research"} onClose={onClose} />}>
      <form id="research-form" onSubmit={submit} className="space-y-3.5">
        <Field label="Personalization hook" hint="The post or news that caught your eye." error={error}>
          <textarea className="input" rows={2} value={f.hook} onChange={set("hook")} />
        </Field>
        <Field label="Hook link"><input className="input" value={f.hookUrl} onChange={set("hookUrl")} inputMode="url" /></Field>
        <Field label="Common ground"><input className="input" value={f.common} onChange={set("common")} placeholder="Shared connection, school, city" /></Field>
        <Field label="Proposed tool idea"><textarea className="input" rows={2} value={f.idea} onChange={set("idea")} /></Field>
        <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></Field>
      </form>
    </Sheet>
  );
}

function ContactSheet({ open, onClose, company, row }: { open: boolean; onClose: () => void; company: Company; row: Contact | null }) {
  const write = useWrite();
  const { busy, run } = useAction();
  const { f, setF, set, error, setError } = useForm(open, {
    name: row?.name ?? "", title: row?.title ?? "", email: row?.email ?? "", phone: row?.phone ?? "",
    linkedin: row?.linkedin_url ?? "", referral: row?.referral_source ?? "", notes: row?.notes ?? "", dnc: row?.do_not_contact ?? false,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setError("Give the contact a name."); return; }
    const values = {
      name: f.name.trim(), title: clean(f.title), email: clean(f.email.toLowerCase()), phone: clean(f.phone),
      linkedin_url: clean(f.linkedin), referral_source: clean(f.referral), notes: clean(f.notes), do_not_contact: f.dnc,
    };
    run(async () => {
      if (row) await write.update("contacts", { id: row.id }, values);
      else await write.insert("contacts", [{ company_id: company.id, owner_id: company.owner_id, ...values }]);
      onClose();
    }, row ? "Contact saved" : `${values.name} added`);
  };
  return (
    <Sheet open={open} onClose={onClose} title={row ? `Edit ${row.name}` : `Add a contact at ${company.name}`}
      footer={<SheetFooter form="contact-form" busy={busy} label={row ? "Save contact" : "Add contact"} onClose={onClose} />}>
      <form id="contact-form" onSubmit={submit} className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        <Field label="Name" error={error}><input className="input" value={f.name} onChange={set("name")} aria-invalid={!!error} autoComplete="off" /></Field>
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} inputMode="email" autoComplete="off" /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="LinkedIn"><input className="input" value={f.linkedin} onChange={set("linkedin")} inputMode="url" /></Field>
        <Field label="Introduced by"><input className="input" value={f.referral} onChange={set("referral")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></Field>
        <CheckField label="Do not contact" checked={f.dnc} onChange={(dnc) => setF((p) => ({ ...p, dnc }))} />
      </form>
    </Sheet>
  );
}
