import { Copy, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/Shell";
import { cx, EmptyState, ErrorNote, Field, Loading, Sheet, Tabs, useAction, useToast } from "../components/ui";
import { TEMPLATE_TYPE_LABEL } from "../lib/constants";
import { useCrm, useWrite } from "../lib/data";
import { shortDate } from "../lib/format";
import type { Template, TemplateType } from "../lib/types";

type Filter = "all" | TemplateType;
const TYPES = Object.keys(TEMPLATE_TYPE_LABEL) as TemplateType[];

interface Draft {
  /** Set when this is a new version of an existing template. */
  base: Template | null;
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
  retirePrevious: boolean;
}

export function Templates() {
  const crm = useCrm();
  const write = useWrite();
  const toast = useToast();
  const { member, isAdmin } = useAuth();
  const { busy, run } = useAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byName = new Map<string, Template[]>();
    for (const t of crm.templates) {
      if (filter !== "all" && t.type !== filter) continue;
      byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
    }
    return [...byName.entries()]
      .map(([name, versions]) => ({ name, versions: versions.sort((a, b) => b.version - a.version) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [crm.templates, filter]);

  const versionsOf = (name: string) => crm.templates.filter((t) => t.name === name);

  const openNew = () => {
    setError(null);
    setDraft({ base: null, name: "", type: filter === "all" ? "cold_email" : filter, subject: "", body: "", retirePrevious: true });
  };
  const openVersion = (name: string) => {
    const latest = versionsOf(name).sort((a, b) => b.version - a.version)[0];
    if (!latest) return;
    setError(null);
    setDraft({ base: latest, name: latest.name, type: latest.type, subject: latest.subject ?? "", body: latest.body, retirePrevious: true });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) { setError("Give the template a name."); return; }
    if (!draft.body.trim()) { setError("Write the body."); return; }
    const existing = versionsOf(name);
    if (!draft.base && crm.templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setError("A template with this name already exists. Use New version on it instead.");
      return;
    }
    if (draft.base && draft.body === draft.base.body && draft.subject.trim() === (draft.base.subject ?? "")) {
      setError("Nothing has changed from the latest version.");
      return;
    }
    setError(null);
    const version = draft.base ? Math.max(...existing.map((t) => t.version)) + 1 : 1;
    run(async () => {
      await write.insert("templates", [{
        name, type: draft.type, version, body: draft.body,
        subject: draft.type === "call_script" ? null : draft.subject.trim() || null,
        active: true, created_by: member?.id ?? null,
      }]);
      if (draft.base && draft.retirePrevious) {
        for (const t of existing.filter((x) => x.active)) {
          await write.update("templates", { id: t.id }, { active: false });
        }
      }
      setDraft(null);
    }, draft.base ? `${name} version ${version} saved` : `${name} created`);
  };

  const toggle = (t: Template) =>
    run(() => write.update("templates", { id: t.id }, { active: !t.active }),
      `${t.name} v${t.version} ${t.active ? "retired" : "is active again"}`);

  const copy = async (t: Template) => {
    try {
      await navigator.clipboard.writeText(t.body);
      toast("Body copied");
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", { tone: "error" });
    }
  };

  const remove = (t: Template) =>
    run(async () => {
      await write.remove("templates", { id: t.id });
      setConfirmDelete(null);
    }, `${t.name} v${t.version} deleted`);

  if (crm.loading) return <Loading label="Loading templates" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  return (
    <>
      <PageHeader
        title="Templates"
        action={<button className="btn btn-primary" onClick={openNew}><Plus size={16} aria-hidden="true" /> New template</button>}
      >
        <div className="max-w-full overflow-x-auto">
          <Tabs label="Template type" value={filter} onChange={setFilter}
            options={[{ value: "all", label: "All" }, ...TYPES.map((t) => ({ value: t, label: TEMPLATE_TYPE_LABEL[t] }))]} />
        </div>
      </PageHeader>

      <p className="mb-4 max-w-[78ch] text-[13px] text-mute">
        A version's wording is fixed once it is saved, so reply rates always compare the same text. To change the wording, save a new version and retire the old one.
      </p>

      {crm.templates.length === 0 ? (
        <EmptyState title="No templates yet" action={<button className="btn btn-primary" onClick={openNew}>Write the first template</button>}>
          Save the cold email, follow-up and call script you use, then pick one when you log a touch to see which gets replies.
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState title={`No ${TEMPLATE_TYPE_LABEL[filter as TemplateType].toLowerCase()} templates`}
          action={<button className="btn" onClick={openNew}>New template</button>}>
          Choose another type or add one here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ name, versions }) => (
            <section key={name} className="card" aria-label={name}>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
                <h2 className="section-title min-w-0 flex-1 truncate">{name}</h2>
                <span className="text-[13px] text-mute">{versions.length} version{versions.length === 1 ? "" : "s"}</span>
                <button className="btn btn-sm" onClick={() => openVersion(name)}>
                  <Plus size={15} aria-hidden="true" /> New version
                </button>
              </header>
              <ul>
                {versions.map((t) => {
                  const long = t.body.length > 320 || t.body.split("\n").length > 5;
                  const open = expanded.has(t.id);
                  const author = t.created_by ? crm.member.get(t.created_by)?.display_name : null;
                  return (
                    <li key={t.id} className="border-b border-[#e9dfc3] px-4 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                        <span className="text-[14px] font-bold">Version {t.version}</span>
                        <span className="chip chip-plain">{TEMPLATE_TYPE_LABEL[t.type]}</span>
                        <span className={cx("chip", t.active ? "chip-good" : "chip-plain")}>
                          {t.active ? "Active" : "Retired"}
                        </span>
                        {t.is_sample && <span className="chip chip-warn">Sample</span>}
                        <span className="text-[12.5px] text-mute">
                          {author ? `${author}, ` : ""}{shortDate(t.created_at)}
                        </span>
                        <span className="ml-auto flex flex-wrap items-center gap-1.5">
                          {confirmDelete === t.id ? (
                            <>
                              <span className="text-[13px] text-magenta-dark">Delete version {t.version}? Touches logged with it lose the link.</span>
                              <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => remove(t)}>Delete version</button>
                              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Keep</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-sm" onClick={() => copy(t)}><Copy size={15} aria-hidden="true" /> Copy body</button>
                              <button className="btn btn-sm" disabled={busy} onClick={() => toggle(t)}>{t.active ? "Retire" : "Make active"}</button>
                              {isAdmin && (
                                <button className="btn btn-ghost btn-icon btn-sm btn-danger" onClick={() => setConfirmDelete(t.id)}
                                  aria-label={`Delete ${name} version ${t.version}`} title="Delete version">
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      {t.subject && (
                        <p className="mt-2 text-[13.5px]"><span className="text-mute">Subject:</span> <span className="font-semibold">{t.subject}</span></p>
                      )}
                      <p className={cx("mt-1.5 max-w-[86ch] whitespace-pre-wrap break-words text-[13.5px]", !t.active && "text-mute", long && !open && "line-clamp-4")}>
                        {t.body}
                      </p>
                      {long && (
                        <button className="link mt-1 text-[13px]" aria-expanded={open}
                          onClick={() => setExpanded((s) => { const n = new Set(s); if (open) n.delete(t.id); else n.add(t.id); return n; })}>
                          {open ? "Show less" : "Show the whole body"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={!!draft} onClose={() => setDraft(null)} wide
        title={draft?.base ? `New version of ${draft.name}` : "New template"}
        footer={<>
          <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn btn-primary" form="template-form" type="submit" disabled={busy}>
            {busy ? "Saving…" : draft?.base ? `Save version ${Math.max(...versionsOf(draft.name).map((t) => t.version), 0) + 1}` : "Create template"}
          </button>
        </>}
      >
        {draft && (
          <form id="template-form" className="flex flex-col gap-4" onSubmit={save}>
            {error && <p className="text-[13px] font-semibold text-magenta-dark" role="alert">{error}</p>}
            {draft.base ? (
              <p className="text-[13px] text-mute">
                Starts from version {draft.base.version}. {TEMPLATE_TYPE_LABEL[draft.type]}. Earlier versions keep their wording and their reply history.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label="Name" hint="Shown when you log a touch. Versions share this name.">
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Accounting firms, first email" />
                </Field>
                <Field label="Type">
                  <select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TemplateType })}>
                    {TYPES.map((t) => <option key={t} value={t}>{TEMPLATE_TYPE_LABEL[t]}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {draft.type !== "call_script" && (
              <Field label="Subject">
                <input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </Field>
            )}
            <Field label="Body" hint="This wording cannot be edited after saving. Changes go in a new version.">
              <textarea className="input" rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            {draft.base && (
              <label className="flex min-h-10 items-center gap-2.5 text-[13.5px] font-medium">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-navy)]" checked={draft.retirePrevious}
                  onChange={(e) => setDraft({ ...draft, retirePrevious: e.target.checked })} />
                Retire the version that is active now
              </label>
            )}
          </form>
        )}
      </Sheet>
    </>
  );
}
