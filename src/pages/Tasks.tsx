import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { TaskSheet } from "../components/forms";
import { PageHeader } from "../components/Shell";
import { Avatar, cx, EmptyState, ErrorNote, Loading, Tabs, useToast } from "../components/ui";
import { TASK_STATUS_LABEL } from "../lib/constants";
import { useCrm, useWrite } from "../lib/data";
import { shortDate, todayIso } from "../lib/format";
import type { Task, TaskStatus } from "../lib/types";

type Scope = "open" | "done" | "all";
type Group = "Overdue" | "Today" | "This week" | "Later" | "No due date" | "Done";
const GROUPS: Group[] = ["Overdue", "Today", "This week", "Later", "No due date", "Done"];
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** yyyy-mm-dd for the local day `days` from now. */
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Tasks() {
  const crm = useCrm();
  const write = useWrite();
  const toast = useToast();
  const { member, isAdmin } = useAuth();
  const [scope, setScope] = useState<Scope>("open");
  const [assignee, setAssignee] = useState(member?.id ?? "");
  const [sheet, setSheet] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const today = todayIso();
  const weekEnd = isoInDays(7);

  const groups = useMemo(() => {
    const out = new Map<Group, Task[]>();
    const visible = crm.tasks.filter((t) => {
      if (scope === "open" && t.status === "done") return false;
      if (scope === "done" && t.status !== "done") return false;
      if (assignee === "none") return !t.assignee_id;
      return !assignee || t.assignee_id === assignee;
    });
    for (const t of visible) {
      const g: Group = t.status === "done" ? "Done"
        : !t.due_date ? "No due date"
        : t.due_date < today ? "Overdue"
        : t.due_date === today ? "Today"
        : t.due_date <= weekEnd ? "This week" : "Later";
      const list = out.get(g);
      if (list) list.push(t); else out.set(g, [t]);
    }
    for (const [g, list] of out) {
      list.sort(g === "Done"
        ? (a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at)
        : (a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")
          || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          || a.created_at.localeCompare(b.created_at));
    }
    return GROUPS.filter((g) => out.has(g)).map((g) => ({ name: g, tasks: out.get(g)! }));
  }, [crm.tasks, scope, assignee, today, weekEnd]);

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : "That did not work. Try again.", { tone: "error" });

  const setStatus = async (task: Task, status: TaskStatus, undoable = true) => {
    if (task.status === status) return;
    setSaving(task.id);
    try {
      await write.update("tasks", { id: task.id }, {
        status, completed_at: status === "done" ? new Date().toISOString() : null,
      });
      if (status === "done" && undoable) {
        toast("Task completed", { action: { label: "Undo", run: () => { void setStatus({ ...task, status }, task.status, false); } } });
      }
    } catch (e) {
      fail(e);
    } finally {
      setSaving(null);
    }
  };

  const remove = async (task: Task) => {
    setSaving(task.id);
    try {
      await write.remove("tasks", { id: task.id });
      toast("Task deleted");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(null);
      setConfirmId(null);
    }
  };

  if (crm.loading) return <Loading label="Loading tasks" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  const newTask = () => setSheet({ open: true, task: null });
  const who = assignee === "none" ? "Unassigned" : assignee ? crm.member.get(assignee)?.display_name ?? "This person" : "The team";
  const filtered = !!assignee;

  return (
    <>
      <PageHeader
        title="Tasks"
        action={<button className="btn btn-primary" onClick={newTask}><Plus size={16} aria-hidden="true" /> New task</button>}
      >
        <Tabs label="Status" value={scope} onChange={setScope}
          options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
        <label>
          <span className="sr-only">Assignee</span>
          <select
            className={cx("input !h-9 !w-auto cursor-pointer !pr-8 text-[13.5px] font-medium", assignee && "!border-depth-7 !bg-depth-1")}
            value={assignee} onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Assignee: all</option>
            {crm.team.map((m) => <option key={m.id} value={m.id}>{m.id === member?.id ? `${m.display_name} (me)` : m.display_name}</option>)}
            <option value="none">Unassigned</option>
          </select>
        </label>
      </PageHeader>

      {groups.length === 0 ? (
        crm.tasks.length === 0 ? (
          <EmptyState title="No tasks yet" action={<button className="btn btn-primary" onClick={newTask}>Add the first task</button>}>
            Tasks hold the next step for a prospect. Follow-up tasks are also added automatically when a touch goes unanswered.
          </EmptyState>
        ) : (
          <EmptyState
            title={scope === "open" ? "No open tasks" : scope === "done" ? "No completed tasks" : "No tasks here"}
            action={filtered
              ? <button className="btn" onClick={() => setAssignee("")}>Show the whole team</button>
              : scope === "open" ? <button className="btn btn-primary" onClick={newTask}>New task</button>
              : <button className="btn" onClick={() => setScope("open")}>Show open tasks</button>}
          >
            {scope === "open" ? `${who} has nothing open right now.`
              : scope === "done" ? `${who} has not completed a task yet.`
              : `${who} has no tasks.`}
          </EmptyState>
        )
      ) : (
        <div className="grid gap-5">
          {groups.map((group) => (
            <section key={group.name}>
              <h2 className={cx("mb-2 flex items-baseline gap-2 text-[13.5px] font-bold", group.name === "Overdue" ? "text-magenta-dark" : "text-navy")}>
                {group.name} <span className="font-semibold text-mute">{group.tasks.length}</span>
              </h2>
              <ul className="card overflow-hidden">
                {group.tasks.map((t) => {
                  const done = t.status === "done";
                  const overdue = !done && !!t.due_date && t.due_date < today;
                  const company = t.company_id ? crm.company.get(t.company_id) : null;
                  const busy = saving === t.id;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-1.5 pl-1.5 pr-3 last:border-b-0 sm:flex-nowrap">
                      <div className="flex min-w-0 flex-1 basis-full items-center gap-1 sm:basis-0">
                        <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center self-start">
                          <input type="checkbox" className="h-[17px] w-[17px] cursor-pointer accent-green" checked={done} disabled={busy}
                            onChange={() => { void setStatus(t, done ? "todo" : "done"); }} />
                          <span className="sr-only">{done ? "Reopen" : "Complete"} {t.title}</span>
                        </label>
                        <div className="min-w-0 flex-1 py-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <button className={cx("min-w-0 truncate text-left font-semibold hover:underline", done && "text-mute line-through")}
                              onClick={() => setSheet({ open: true, task: t })} title="Edit task">
                              {t.title}
                            </button>
                            {t.priority === "high" && <span className="chip chip-alert shrink-0">High</span>}
                            {t.priority === "low" && <span className="chip chip-plain shrink-0 !bg-transparent !px-0 !font-medium text-mute">Low</span>}
                            {t.source === "auto" && <span className="chip chip-plain shrink-0" title="Added automatically by the follow-up cadence">Auto</span>}
                          </div>
                          {(company || t.description) && (
                            <p className="mt-0.5 flex min-w-0 gap-2 text-[12.5px] text-mute">
                              {company && <Link to={`/company/${company.id}`} className="link shrink-0 max-w-[50%] truncate">{company.name}</Link>}
                              {t.description && <span className="truncate">{t.description}</span>}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 basis-full items-center gap-3 pb-1.5 pl-11 sm:basis-auto sm:pb-0 sm:pl-0">
                        <span className={cx("w-[62px] text-[13px] sm:text-right", overdue ? "font-bold text-magenta-dark" : "text-mute")}>
                          {t.due_date ? (t.due_date === today ? "Today" : shortDate(t.due_date)) : "No date"}
                          {overdue && <span className="sr-only"> (overdue)</span>}
                        </span>
                        <Avatar member={t.assignee_id ? crm.member.get(t.assignee_id) : null} />
                        <label>
                          <span className="sr-only">Status for {t.title}</span>
                          <select
                            className={cx("chip h-10 cursor-pointer border-0 pr-1 font-semibold sm:h-[26px]",
                              done ? "chip-good" : t.status === "in_progress" ? "chip-warn" : "chip-plain")}
                            value={t.status} disabled={busy}
                            onChange={(e) => { void setStatus(t, e.target.value as TaskStatus); }}
                          >
                            {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                          </select>
                        </label>
                        {isAdmin && (confirmId === t.id ? (
                          <span className="ml-auto flex items-center gap-1.5 sm:ml-0">
                            <button className="btn btn-sm btn-danger h-10 sm:h-[30px]" disabled={busy} onClick={() => { void remove(t); }}>
                              {busy ? "Deleting…" : "Delete task"}
                            </button>
                            <button className="btn btn-sm btn-ghost h-10 sm:h-[30px]" onClick={() => setConfirmId(null)}>Keep</button>
                          </span>
                        ) : (
                          <button className="btn btn-ghost btn-icon ml-auto h-10 w-10 text-mute hover:text-navy sm:ml-0 sm:h-[30px] sm:w-[30px]"
                            onClick={() => setConfirmId(t.id)} aria-label={`Delete ${t.title}`} title="Delete task">
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TaskSheet open={sheet.open} task={sheet.task} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </>
  );
}
