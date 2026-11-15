import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DepthStrip } from "../components/DepthStrip";
import { PageHeader, useQuick } from "../components/Shell";
import {
  Avatar, cx, EmptyState, ErrorNote, Field, FitDot, Loading, Sheet, Tabs, TouchSlots, useToast,
} from "../components/ui";
import { buildFunnel, daysSince, followUpOverdue, hasReply, touchCount } from "../lib/analytics";
import { ALL_STAGES, FUNNEL_STAGES, SIDE_STAGES, SIZE_BUCKETS, STAGE_LABEL, stageClass } from "../lib/constants";
import { useCrm, useMoveStage } from "../lib/data";
import { relativeDay } from "../lib/format";
import type { Company, Stage } from "../lib/types";

type View = "board" | "table";
type SortKey = "name" | "stage" | "fit" | "size" | "last" | "owner" | "industry";

interface Row {
  company: Company;
  contactName: string | null;
  contactTitle: string | null;
  touches: number;
  replied: boolean;
  overdue: boolean;
}

export function Pipeline() {
  const crm = useCrm();
  const quick = useQuick();
  const toast = useToast();
  const move = useMoveStage();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "board";
  const stageFilter = (params.get("stage") as Stage | null) || null;
  const [owner, setOwner] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [minFit, setMinFit] = useState("");
  const [last, setLast] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "last", dir: 1 });
  const [lostFor, setLostFor] = useState<Company | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [dragging, setDragging] = useState<Row | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows: Row[] = useMemo(() => crm.companies.map((company) => {
    const contact = crm.contacts.find((c) => c.company_id === company.id);
    return {
      company,
      contactName: contact?.name ?? null,
      contactTitle: contact?.title ?? null,
      touches: touchCount(company.id, crm.interactions),
      replied: hasReply(company.id, crm.interactions),
      overdue: followUpOverdue(company, crm.interactions, crm.followupDays),
    };
  }), [crm.companies, crm.contacts, crm.interactions, crm.followupDays]);

  const industries = useMemo(
    () => [...new Set(crm.companies.map((c) => c.industry).filter(Boolean) as string[])].sort(),
    [crm.companies],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ company: c, contactName }) => {
      if (owner && c.owner_id !== owner) return false;
      if (industry && c.industry !== industry) return false;
      if (size && c.size_bucket !== size) return false;
      if (minFit && (c.fit_score ?? 0) < Number(minFit)) return false;
      if (last) {
        const d = daysSince(c.last_contacted_at);
        if (last === "never" ? d != null : d == null || d < Number(last)) return false;
      }
      if (q && !`${c.name} ${contactName ?? ""} ${c.industry ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, owner, industry, size, minFit, last, query]);

  const funnel = useMemo(() => buildFunnel(crm.companies, crm.stageChanges), [crm.companies, crm.stageChanges]);
  const filtering = !!(owner || industry || size || minFit || last || query.trim());
  const counts = useMemo(() => {
    const out: Partial<Record<Stage, number>> = {};
    for (const s of ALL_STAGES) out[s] = filtered.filter((r) => r.company.stage === s).length;
    return out;
  }, [filtered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const changeStage = (company: Company, stage: Stage, reason?: string) => {
    if (company.stage === stage) return;
    const from = company.stage;
    move.mutate({ companyId: company.id, stage, reason }, {
      onSuccess: () => toast(`${company.name} moved to ${STAGE_LABEL[stage]}`, {
        action: from === "lost" ? undefined : { label: "Undo", run: () => move.mutate({ companyId: company.id, stage: from, reason: "Undo" }) },
      }),
      onError: (e) => toast(e.message, { tone: "error" }),
    });
  };

  const onDragStart = (e: DragStartEvent) => setDragging(rows.find((r) => r.company.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const stage = e.over?.id as Stage | undefined;
    const row = rows.find((r) => r.company.id === e.active.id);
    if (!stage || !row || row.company.stage === stage) return;
    if (stage === "lost") { setLostReason(""); setLostFor(row.company); return; }
    changeStage(row.company, stage);
  };

  if (crm.loading) return <Loading label="Loading the pipeline" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  const boardStages = stageFilter ? [stageFilter] : [...FUNNEL_STAGES, ...SIDE_STAGES];

  const strip = (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-mute">
        <h2 className="text-[13.5px] font-bold text-navy">Depth profile</h2>
        <span>Figure: prospects in each stage{filtering ? " under these filters" : ""}. Pill: share that went on to the next stage, all time. Magenta marks the weakest step.</span>
        <span className="ml-auto flex gap-4">
          {SIDE_STAGES.map((s) => (
            <button key={s} className={cx("font-medium hover:text-navy", stageFilter === s && "text-navy underline")}
              onClick={() => setParam("stage", stageFilter === s ? null : s)}>
              {STAGE_LABEL[s]} <strong className="text-navy">{counts[s] ?? 0}</strong>
            </button>
          ))}
        </span>
      </div>
      <div className="mb-5">
        <DepthStrip funnel={funnel} counts={counts} active={stageFilter} onSelect={(s) => setParam("stage", s)} />
      </div>
    </>
  );

  // Filters sit above the strip because they change its figures. On phones the
  // selects fold behind one control so the board starts higher.
  const activeFilters = [owner, industry, size, minFit, last, view === "table" ? stageFilter : null].filter(Boolean).length;
  const filters = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative order-first w-full sm:order-last sm:ml-auto sm:w-[240px]">
        <span className="sr-only">Search companies and contacts</span>
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
        <input className="input !h-9 !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies, contacts" />
      </label>
      <button className={cx("btn btn-sm !h-9 sm:hidden", activeFilters > 0 && "!border-depth-7 !bg-depth-1")}
        aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
        <SlidersHorizontal size={15} aria-hidden="true" /> Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
      </button>
      <div className={cx("flex-wrap items-center gap-2 sm:flex", filtersOpen ? "flex w-full" : "hidden")}>
        <FilterSelect label="Owner" value={owner} onChange={setOwner}
          options={crm.team.map((m) => ({ value: m.id, label: m.display_name }))} />
        <FilterSelect label="Industry" value={industry} onChange={setIndustry} options={industries.map((i) => ({ value: i, label: i }))} />
        <FilterSelect label="Size" value={size} onChange={setSize} options={SIZE_BUCKETS.map((s) => ({ value: s, label: `${s} people` }))} />
        <FilterSelect label="Fit" value={minFit} onChange={setMinFit}
          options={[5, 4, 3, 2].map((n) => ({ value: String(n), label: n === 5 ? "5 only" : `${n} or higher` }))} />
        <FilterSelect label="Last contacted" value={last} onChange={setLast}
          options={[{ value: "3", label: "3+ days ago" }, { value: "7", label: "7+ days ago" }, { value: "30", label: "30+ days ago" }, { value: "never", label: "Never" }]} />
        {view === "table" && (
          <FilterSelect label="Stage" value={stageFilter ?? ""} onChange={(v) => setParam("stage", v || null)}
            options={ALL_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
        )}
        {(filtering || stageFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setOwner(""); setIndustry(""); setSize(""); setMinFit(""); setLast(""); setQuery(""); setParam("stage", null); }}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Pipeline"
        action={<button className="btn btn-primary hidden lg:inline-flex" onClick={quick.addProspect}><Plus size={16} aria-hidden="true" /> Add prospect</button>}
      >
        <Tabs label="View" value={view} onChange={(v) => setParam("view", v === "board" ? null : v)}
          options={[{ value: "board", label: "Board" }, { value: "table", label: "Table" }]} />
      </PageHeader>
      {filters}
      {strip}

      {crm.companies.length === 0 ? (
        <EmptyState title="No prospects yet"
          action={<button className="btn btn-primary" onClick={quick.addProspect}>Add your first prospect</button>}>
          Add a company with the hook that caught your eye, or bring in past outreach from Import.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches these filters">Loosen a filter or clear them to see the whole pipeline.</EmptyState>
      ) : view === "board" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {/* From 1400px the eight funnel lanes sit directly under their strip segments;
              Nurture and Lost get their own row. Narrower screens scroll sideways. */}
          <div className={cx(
            "relative -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-3 lg:mx-0 lg:snap-none lg:px-0",
            !stageFilter && "min-[1400px]:grid min-[1400px]:grid-cols-8 min-[1400px]:overflow-visible",
          )}>
            {boardStages.map((stage) => (
              <Lane key={stage} stage={stage} rows={filtered.filter((r) => r.company.stage === stage)} crm={crm}
                wide={!!stageFilter} side={!stageFilter && SIDE_STAGES.includes(stage)} />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
            {dragging && <div className="w-[220px] rotate-[1.5deg]"><CardBody row={dragging} crm={crm} lifted /></div>}
          </DragOverlay>
        </DndContext>
      ) : (
        <ProspectTable rows={stageFilter ? filtered.filter((r) => r.company.stage === stageFilter) : filtered}
          crm={crm} sort={sort} setSort={setSort} onStage={(c, s) => {
            if (s === "lost") { setLostReason(""); setLostFor(c); } else changeStage(c, s);
          }} />
      )}

      <Sheet
        open={!!lostFor} onClose={() => setLostFor(null)} title={`Mark ${lostFor?.name ?? ""} as Lost`}
        footer={<>
          <button className="btn" onClick={() => setLostFor(null)}>Cancel</button>
          <button className="btn btn-navy" disabled={!lostReason.trim()}
            onClick={() => { if (lostFor) changeStage(lostFor, "lost", lostReason.trim()); setLostFor(null); }}>
            Mark as Lost
          </button>
        </>}
      >
        <Field label="Why was this lost?" hint="Required. This is what the funnel learns from.">
          <textarea className="input" rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)}
            placeholder="Chose another tool, no budget this year, too large for us…" />
        </Field>
      </Sheet>
    </>
  );
}

type Crm = ReturnType<typeof useCrm>;

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        className={cx("input !h-9 !w-auto cursor-pointer !pr-8 text-[13.5px] font-medium", value && "!border-depth-7 !bg-depth-1")}
        value={value} onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{label}: all</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Lane({ stage, rows, crm, wide, side }: { stage: Stage; rows: Row[]; crm: Crm; wide: boolean; side?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const sorted = [...rows].sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) || (b.company.fit_score ?? 0) - (a.company.fit_score ?? 0));
  return (
    <section
      ref={setNodeRef} aria-label={`${STAGE_LABEL[stage]}, ${rows.length} prospects`}
      className={cx(
        "flex shrink-0 snap-start flex-col overflow-hidden rounded-[14px] bg-lane transition-shadow duration-150",
        wide ? "w-full" : "w-[78vw] sm:w-[240px] lg:w-auto lg:flex-1 lg:max-[1399px]:min-w-[168px] min-[1400px]:min-w-0",
        side && "min-[1400px]:col-span-4",
        isOver && "shadow-[inset_0_0_0_2px_var(--color-depth-7)]",
      )}
    >
      <div className={cx("h-[7px]", stageClass(stage))} />
      <header className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <h3 className="text-[13px] font-bold">{STAGE_LABEL[stage]}</h3>
        <span className="text-[12.5px] font-semibold text-mute">{rows.length}</span>
      </header>
      <div className={cx("flex min-h-[72px] flex-1 gap-1.5 px-1.5 pb-2",
        wide ? "flex-row flex-wrap content-start" : side ? "flex-col min-[1400px]:flex-row min-[1400px]:flex-wrap min-[1400px]:content-start" : "flex-col")}>
        {sorted.map((row) => <DraggableCard key={row.company.id} row={row} crm={crm} wide={wide} side={side} />)}
        {rows.length === 0 && <p className="px-2 py-3 text-[12.5px] text-mute">Drop a prospect here</p>}
      </div>
    </section>
  );
}

function DraggableCard({ row, crm, wide, side }: { row: Row; crm: Crm; wide: boolean; side?: boolean }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.company.id });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      aria-roledescription="Draggable prospect"
      onClick={() => navigate(`/company/${row.company.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(`/company/${row.company.id}`); listeners?.onKeyDown?.(e); }}
      className={cx("cursor-grab touch-manipulation active:cursor-grabbing", wide && "w-full sm:w-[232px]", side && "min-[1400px]:w-[200px]", isDragging && "opacity-30")}
    >
      <CardBody row={row} crm={crm} />
    </div>
  );
}

function CardBody({ row, crm, lifted }: { row: Row; crm: Crm; lifted?: boolean }) {
  const c = row.company;
  return (
    <article className={cx(
      "rounded-[11px] border border-line bg-card px-2.5 py-2 transition-shadow duration-150 hover:shadow-soft",
      lifted && "shadow-lift",
    )}>
      {row.overdue && <span className="chip chip-alert mb-1.5 !h-[19px] !px-2 !text-[11px]" title="No reply, and the follow-up window has passed">Follow-up due</span>}
      {c.do_not_contact && <span className="chip chip-plain mb-1.5 !h-[19px] !px-2 !text-[11px]">Do not contact</span>}
      <h4 className="text-[13.5px] font-bold leading-tight [overflow-wrap:break-word]">{c.name}</h4>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12.5px]" title={row.contactTitle ? `${row.contactName}, ${row.contactTitle}` : row.contactName ?? undefined}>
          {row.contactName ?? <span className="text-mute">No contact yet</span>}
        </p>
        <Avatar member={c.owner_id ? crm.member.get(c.owner_id) : null} size={19} />
      </div>
      <p className="mt-0.5 truncate text-[12px] text-mute" title={c.employee_count ? `${c.employee_count} people` : undefined}>
        {[c.industry, c.employee_count].filter(Boolean).join(" · ") || "No details yet"}
      </p>
      <div className="mt-2 flex items-center gap-1.5 border-t border-[#ebe1c6] pt-2 text-[11.5px] text-mute">
        <FitDot score={c.fit_score} />
        <TouchSlots used={row.touches} replied={row.replied} />
        <span className="ml-auto whitespace-nowrap" title={`Last touch: ${relativeDay(c.last_contacted_at)}`}>
          {relativeDay(c.last_contacted_at).replace(" ago", "")}
        </span>
      </div>
    </article>
  );
}

function ProspectTable({ rows, crm, sort, setSort, onStage }: {
  rows: Row[]; crm: Crm; sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; onStage: (c: Company, s: Stage) => void;
}) {
  const sorted = useMemo(() => {
    const value = (r: Row): string | number => {
      const c = r.company;
      switch (sort.key) {
        case "name": return c.name.toLowerCase();
        case "stage": return ALL_STAGES.indexOf(c.stage);
        case "fit": return -(c.fit_score ?? 0);
        case "size": return c.employee_count ?? Infinity;
        case "industry": return (c.industry ?? "~").toLowerCase();
        case "owner": return crm.member.get(c.owner_id ?? "")?.display_name ?? "~";
        case "last": return c.last_contacted_at ? -new Date(c.last_contacted_at).getTime() : Infinity;
      }
    };
    return [...rows].sort((a, b) => {
      const x = value(a), y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort, crm.member]);

  const Th = ({ k, children, className }: { k: SortKey; children: string; className?: string }) => (
    <th className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-navy"
        onClick={() => setSort({ key: k, dir: sort.key === k ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-[980px]">
        <colgroup>
          <col className="w-[24%]" /><col className="w-[18%]" /><col className="w-[12%]" /><col className="w-[8%]" />
          <col className="w-[6%]" /><col className="w-[13%]" /><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[4%]" />
        </colgroup>
        <thead>
          <tr>
            <Th k="name">Company</Th><th>Contact</th><Th k="industry">Industry</Th><Th k="size" className="num">People</Th>
            <Th k="fit">Fit</Th><Th k="stage">Stage</Th><th>Touches</th><Th k="last">Last touch</Th><Th k="owner">Owner</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const c = r.company;
            return (
              <tr key={c.id}>
                <td className="max-w-0">
                  <Link to={`/company/${c.id}`} className="block truncate font-bold hover:underline">{c.name}</Link>
                </td>
                <td className="max-w-0"><span className="block truncate">{r.contactName ?? <span className="text-mute">None</span>}</span></td>
                <td className="max-w-0"><span className="block truncate">{c.industry ?? ""}</span></td>
                <td className="num">{c.employee_count ?? ""}</td>
                <td><FitDot score={c.fit_score} showNumber /></td>
                <td>
                  <label>
                    <span className="sr-only">Stage for {c.name}</span>
                    <select
                      className={cx("chip cursor-pointer border-0 pr-1 font-semibold", stageClass(c.stage))}
                      value={c.stage} onChange={(e) => onStage(c, e.target.value as Stage)}
                    >
                      {ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </select>
                  </label>
                </td>
                <td><TouchSlots used={r.touches} replied={r.replied} /></td>
                <td className={cx(r.overdue && "font-bold text-magenta-dark")}>
                  {relativeDay(c.last_contacted_at)}{r.overdue && <span className="sr-only"> (follow-up overdue)</span>}
                </td>
                <td><Avatar member={c.owner_id ? crm.member.get(c.owner_id) : null} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
