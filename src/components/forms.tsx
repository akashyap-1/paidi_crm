// The three capture forms, each in a Sheet: add a prospect, log a touch, add or edit a task.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { followUpOverdue, suggestFitScore } from "../lib/analytics";
import {
  INDUSTRIES, INTERACTION_LABEL, PRIORITY_LABEL, SOURCE_LABEL, TASK_STATUS_LABEL, TEMPLATE_TYPE_LABEL,
} from "../lib/constants";
import { useCrm, useWrite } from "../lib/data";
import { domainOf, localInputValue, todayIso } from "../lib/format";
import type { CompanySource, InteractionType, Priority, Task, TaskStatus } from "../lib/types";
import { Field, FitDot, Sheet, useAction } from "./ui";

// --- Add prospect: company + first contact + research hook in one pass -------

export function ProspectSheet({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated?: (companyId: string) => void;
}) {
  const { team, companies } = useCrm();
  const { member } = useAuth();
  const write = useWrite();
  const { busy, run } = useAction();
  const blank = {
    name: "", website: "", industry: "", employees: "", location: "", source: "" as CompanySource | "",
    sourceDetail: "", owner: member?.id ?? "", fit: "" as string,
    contactName: "", title: "", email: "", phone: "", linkedin: "", referral: "",
    hook: "", hookUrl: "", common: "", idea: "",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF({ ...blank, owner: member?.id ?? "" }); setError(null); } }, [open]); // eslint-disable-line
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const employees = f.employees ? Number(f.employees) : null;
  const suggested = suggestFitScore(f.industry || null, employees);
  const duplicate = useMemo(() => {
    const domain = domainOf(f.website);
    const name = f.name.trim().toLowerCase();
    return companies.find((c) => (domain && c.domain === domain) || (name && c.name.toLowerCase() === name));
  }, [companies, f.website, f.name]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setError("Give the company a name."); return; }
    setError(null);
    run(async () => {
      const [company] = await write.insert("companies", [{
        name: f.name.trim(), website: f.website.trim() || null, domain: domainOf(f.website),
        industry: f.industry || null, employee_count: employees, location: f.location.trim() || null,
        source: f.source || null, source_detail: f.sourceDetail.trim() || null,
        owner_id: f.owner || null, fit_score: f.fit ? Number(f.fit) : null,
      }]);
      let contactId: string | null = null;
      if (f.contactName.trim()) {
        const [contact] = await write.insert("contacts", [{
          company_id: company.id, name: f.contactName.trim(), title: f.title.trim() || null,
          email: f.email.trim().toLowerCase() || null, phone: f.phone.trim() || null,
          linkedin_url: f.linkedin.trim() || null, referral_source: f.referral.trim() || null, owner_id: f.owner || null,
        }]);
        contactId = contact.id;
      }
      if (f.hook.trim() || f.idea.trim() || f.common.trim()) {
        await write.insert("research", [{
          company_id: company.id, contact_id: contactId, hook: f.hook.trim() || null,
          hook_url: f.hookUrl.trim() || null, common_ground: f.common.trim() || null, tool_idea: f.idea.trim() || null,
        }]);
      }
      onClose();
      onCreated?.(company.id);
    }, `${f.name.trim()} added as Researched`);
  };

  return (
    <Sheet
      open={open} onClose={onClose} title="Add prospect" wide
      footer={<>
        <button className="btn" onClick={onClose} type="button">Cancel</button>
        <button className="btn btn-primary" form="prospect-form" disabled={busy}>{busy ? "Saving…" : "Add prospect"}</button>
      </>}
    >
      <form id="prospect-form" onSubmit={submit} className="space-y-7">
        {/* The five fields that make a prospect worth contacting come first. */}
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field label="Company name" error={error}
            hint={duplicate ? `${duplicate.name} is already in the CRM.` : undefined}>
            <input className="input" value={f.name} onChange={set("name")} aria-invalid={!!error} autoComplete="off" />
          </Field>
          <Field label="Website"><input className="input" value={f.website} onChange={set("website")} placeholder="example.com" inputMode="url" /></Field>
          <Field label="Personalization hook" className="sm:col-span-2" hint="The post or news that caught your eye.">
            <textarea className="input" rows={2} value={f.hook} onChange={set("hook")} />
          </Field>
          <Field label="Contact name"><input className="input" value={f.contactName} onChange={set("contactName")} autoComplete="off" /></Field>
          <Field label="Contact email"><input className="input" type="email" value={f.email} onChange={set("email")} inputMode="email" autoComplete="off" /></Field>
        </div>

        <details className="group rounded-[14px] border border-line bg-card/60">
          <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center gap-x-3 rounded-[14px] px-4 py-2 text-[14px] font-bold hover:bg-sand sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
            <span className="whitespace-nowrap">More details</span>
            <span className="text-[12.5px] font-medium text-mute">
              Fit {f.fit || suggested}{f.fit ? "" : " suggested"} · industry, size, source, research, contact
            </span>
          </summary>
          <div className="space-y-7 px-4 pb-4 pt-2">
        <fieldset className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <legend className="section-title mb-3">Company</legend>
          <Field label="Location"><input className="input" value={f.location} onChange={set("location")} placeholder="Philadelphia, PA" /></Field>
          <Field label="Industry">
            <input className="input" list="industries" value={f.industry} onChange={set("industry")} />
            <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
          </Field>
          <Field label="Employees"><input className="input" type="number" min={1} value={f.employees} onChange={set("employees")} inputMode="numeric" /></Field>
          <Field label="Where we found them">
            <select className="input" value={f.source} onChange={set("source")}>
              <option value="">Choose…</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Source link or detail"><input className="input" value={f.sourceDetail} onChange={set("sourceDetail")} /></Field>
          <Field label="Owner">
            <select className="input" value={f.owner} onChange={set("owner")}>
              {team.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </Field>
          <Field label="Fit score" hint={`Suggested from industry and size: ${suggested}`}>
            <div className="flex items-center gap-3">
              <select className="input" value={f.fit} onChange={set("fit")}>
                <option value="">Use suggestion ({suggested})</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <FitDot score={f.fit ? Number(f.fit) : suggested} />
            </div>
          </Field>
        </fieldset>

        <fieldset className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <legend className="section-title mb-3">Research</legend>
          <Field label="Hook link"><input className="input" value={f.hookUrl} onChange={set("hookUrl")} inputMode="url" /></Field>
          <Field label="Common ground"><input className="input" value={f.common} onChange={set("common")} placeholder="Shared connection, school, city" /></Field>
          <Field label="Proposed tool idea" className="sm:col-span-2"><textarea className="input" rows={2} value={f.idea} onChange={set("idea")} /></Field>
        </fieldset>

        <fieldset className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <legend className="section-title mb-3">Contact</legend>
          <Field label="Title"><input className="input" value={f.title} onChange={set("title")} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
          <Field label="LinkedIn"><input className="input" value={f.linkedin} onChange={set("linkedin")} inputMode="url" /></Field>
          <Field label="Introduced by"><input className="input" value={f.referral} onChange={set("referral")} /></Field>
        </fieldset>
          </div>
        </details>
      </form>
    </Sheet>
  );
}

// --- Log a touch: call, voicemail, meeting, LinkedIn, or an email not in Gmail

const CALL_TYPES: InteractionType[] = ["call", "meeting"];

export function TouchSheet({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId?: string | null }) {
  const { companies, contacts, templates, team, interactions, followupDays } = useCrm();
  const { member } = useAuth();
  const write = useWrite();
  const { busy, run } = useAction();
  const blank = {
    company: companyId ?? "", contact: "", type: "call" as InteractionType, when: localInputValue(),
    by: member?.id ?? "", template: "", summary: "", outcome: "", recording: "",
    why: "", pain: "", objections: "", lostAt: "", asks: "", next: "",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF({ ...blank, company: companyId ?? "", by: member?.id ?? "", when: localInputValue() }); setError(null); } }, [open, companyId]); // eslint-disable-line
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const companyContacts = contacts.filter((c) => c.company_id === f.company);
  // Right after a call you want the prospect you were chasing: follow-ups due
  // first, then whoever was touched most recently, then everyone else by name.
  const groups = useMemo(() => {
    const due = companies.filter((c) => followUpOverdue(c, interactions, followupDays));
    const dueIds = new Set(due.map((c) => c.id));
    const recent = companies
      .filter((c) => !dueIds.has(c.id) && c.last_contacted_at)
      .sort((a, b) => (b.last_contacted_at ?? "").localeCompare(a.last_contacted_at ?? ""))
      .slice(0, 8);
    const recentIds = new Set(recent.map((c) => c.id));
    const rest = companies
      .filter((c) => !dueIds.has(c.id) && !recentIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { label: "Follow-up due", items: due }, { label: "Recently touched", items: recent },
      { label: "Everyone else", items: rest },
    ].filter((g) => g.items.length > 0);
  }, [companies, interactions, followupDays]);
  const showIntel = CALL_TYPES.includes(f.type);
  const intelOpen = typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches;
  const usable = templates.filter((t) => t.active || t.id === f.template);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.company) { setError("Choose the company this was with."); return; }
    setError(null);
    run(async () => {
      const [row] = await write.insert("interactions", [{
        company_id: f.company, contact_id: f.contact || companyContacts[0]?.id || null, type: f.type,
        occurred_at: new Date(f.when).toISOString(), team_member_id: f.by || null,
        template_id: f.template || null, summary: f.summary.trim() || null, outcome: f.outcome.trim() || null,
        recording_url: f.recording.trim() || null,
      }]);
      if (showIntel && (f.why || f.pain || f.objections || f.lostAt || f.asks || f.next)) {
        await write.insert("call_intel", [{
          interaction_id: row.id, why_took_call: f.why.trim() || null, pain_points: f.pain.trim() || null,
          objections: f.objections.trim() || null, lost_interest_at: f.lostAt.trim() || null,
          asks: f.asks.trim() || null, next_step: f.next.trim() || null,
        }]);
      }
      onClose();
    }, `${INTERACTION_LABEL[f.type]} logged`);
  };

  return (
    <Sheet
      open={open} onClose={onClose} title="Log a touch"
      footer={<>
        <button className="btn" onClick={onClose} type="button">Cancel</button>
        <button className="btn btn-primary" form="touch-form" disabled={busy}>{busy ? "Saving…" : "Log it"}</button>
      </>}
    >
      <form id="touch-form" onSubmit={submit} className="space-y-3.5">
        <Field label="Company" error={error}>
          <select className="input" value={f.company} onChange={(e) => setF((p) => ({ ...p, company: e.target.value, contact: "" }))} aria-invalid={!!error}>
            <option value="">Choose…</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="What happened">
            <select className="input" value={f.type} onChange={set("type")}>
              {(Object.keys(INTERACTION_LABEL) as InteractionType[]).map((t) => <option key={t} value={t}>{INTERACTION_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Contact">
            <select className="input" value={f.contact} onChange={set("contact")} disabled={!companyContacts.length}>
              {companyContacts.length === 0 && <option value="">No contacts yet</option>}
              {companyContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="When"><input className="input" type="datetime-local" value={f.when} onChange={set("when")} /></Field>
          <Field label="Who did it">
            <select className="input" value={f.by} onChange={set("by")}>
              {team.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Template or script used" hint="Lets the dashboard compare reply rates by version.">
          <select className="input" value={f.template} onChange={set("template")}>
            <option value="">None</option>
            {usable.map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version} · {TEMPLATE_TYPE_LABEL[t.type]}</option>)}
          </select>
        </Field>
        <Field label="Summary"><textarea className="input" rows={3} value={f.summary} onChange={set("summary")} placeholder="What was said, in a sentence or two" /></Field>
        <Field label="Outcome"><input className="input" value={f.outcome} onChange={set("outcome")} placeholder="Call back Thursday" /></Field>
        {showIntel && (
          <details open={intelOpen} className="rounded-[14px] border border-line bg-card/60">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-[14px] px-4 text-[14px] font-bold hover:bg-sand [&::-webkit-details-marker]:hidden">
              Call intel
              <span className="text-[12.5px] font-medium text-mute">Why they took it, pain points, objections</span>
            </summary>
            <div className="space-y-3.5 px-4 pb-4 pt-1">
            <Field label="Why they took the call" hint="Ask: what caught your attention?"><textarea className="input" rows={2} value={f.why} onChange={set("why")} /></Field>
            <Field label="Pain points"><textarea className="input" rows={2} value={f.pain} onChange={set("pain")} /></Field>
            <Field label="Objections or reasons for no"><textarea className="input" rows={2} value={f.objections} onChange={set("objections")} /></Field>
            <Field label="Where they lost interest"><input className="input" value={f.lostAt} onChange={set("lostAt")} /></Field>
            <Field label="Asks" hint="For example: send a one-pager."><input className="input" value={f.asks} onChange={set("asks")} /></Field>
            <Field label="Next step"><input className="input" value={f.next} onChange={set("next")} /></Field>
            <Field label="Recording link"><input className="input" value={f.recording} onChange={set("recording")} inputMode="url" /></Field>
            </div>
          </details>
        )}
      </form>
    </Sheet>
  );
}

// --- Task --------------------------------------------------------------------

export function TaskSheet({ open, onClose, task, companyId }: {
  open: boolean; onClose: () => void; task?: Task | null; companyId?: string | null;
}) {
  const { team, companies } = useCrm();
  const { member } = useAuth();
  const write = useWrite();
  const { busy, run } = useAction();
  const blank = {
    title: "", description: "", assignee: member?.id ?? "", due: todayIso(),
    status: "todo" as TaskStatus, priority: "medium" as Priority, company: companyId ?? "",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(task ? {
      title: task.title, description: task.description ?? "", assignee: task.assignee_id ?? "",
      due: task.due_date ?? "", status: task.status, priority: task.priority, company: task.company_id ?? "",
    } : { ...blank, assignee: member?.id ?? "", company: companyId ?? "" });
  }, [open, task, companyId]); // eslint-disable-line
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const sorted = useMemo(() => [...companies].sort((a, b) => a.name.localeCompare(b.name)), [companies]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) { setError("Give the task a title."); return; }
    const row = {
      title: f.title.trim(), description: f.description.trim() || null, assignee_id: f.assignee || null,
      due_date: f.due || null, status: f.status, priority: f.priority, company_id: f.company || null,
    };
    run(async () => {
      if (task) await write.update("tasks", { id: task.id }, row);
      else await write.insert("tasks", [row]);
      onClose();
    }, task ? "Task saved" : "Task added");
  };

  return (
    <Sheet
      open={open} onClose={onClose} title={task ? "Edit task" : "New task"}
      footer={<>
        <button className="btn" onClick={onClose} type="button">Cancel</button>
        <button className="btn btn-primary" form="task-form" disabled={busy}>{busy ? "Saving…" : task ? "Save task" : "Add task"}</button>
      </>}
    >
      <form id="task-form" onSubmit={submit} className="space-y-3.5">
        <Field label="Title" error={error}><input className="input" value={f.title} onChange={set("title")} aria-invalid={!!error} /></Field>
        <Field label="Details"><textarea className="input" rows={3} value={f.description} onChange={set("description")} /></Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Assignee">
            <select className="input" value={f.assignee} onChange={set("assignee")}>
              <option value="">Unassigned</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </Field>
          <Field label="Due"><input className="input" type="date" value={f.due} onChange={set("due")} /></Field>
          <Field label="Status">
            <select className="input" value={f.status} onChange={set("status")}>
              {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={f.priority} onChange={set("priority")}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Linked company">
          <select className="input" value={f.company} onChange={set("company")}>
            <option value="">None</option>
            {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </form>
    </Sheet>
  );
}
