import { ArrowDown } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, useQuick } from "../components/Shell";
import { cx, EmptyState, ErrorNote, Loading, Tabs } from "../components/ui";
import {
  buildFunnel, percent, segmentStats, templateStats, weekStart, type SegmentStat, type TemplateStat,
} from "../lib/analytics";
import {
  FUNNEL_STAGES, SIZE_BUCKETS, SOURCE_LABEL, STAGE_LABEL, stageClass, TEMPLATE_TYPE_LABEL,
} from "../lib/constants";
import { useCrm } from "../lib/data";
import { shortDate } from "../lib/format";
import type { Company, Interaction, InteractionType } from "../lib/types";

type Tab = "funnel" | "activity" | "templates" | "segments";
type Preset = "30" | "90" | "year" | "all";
type Crm = ReturnType<typeof useCrm>;

const TABS: { value: Tab; label: string }[] = [
  { value: "funnel", label: "Funnel" }, { value: "activity", label: "Activity" },
  { value: "templates", label: "Templates" }, { value: "segments", label: "Segments" },
];
const PRESETS: { value: Preset; label: string; phrase: string }[] = [
  { value: "30", label: "Last 30 days", phrase: "in the last 30 days" },
  { value: "90", label: "Last 90 days", phrase: "in the last 90 days" },
  { value: "year", label: "This year", phrase: "this year" },
  { value: "all", label: "All time", phrase: "at any time" },
];
const DEFAULT_PRESET: Preset = "90";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SENDS = 5;
const MIN_SEGMENT = 3;
const MAX_CHART_WEEKS = 26;

/** One fixed colour per person, always shown next to their name. */
const PERSON_COLORS = ["var(--color-navy)", "var(--color-depth-5)", "var(--color-green)"];
const NOBODY = "none";

const ACTIVITY_GROUPS: { label: string; types: InteractionType[] }[] = [
  { label: "Emails", types: ["email_out"] },
  { label: "Calls", types: ["call", "voicemail", "gatekeeper"] },
  { label: "Meetings", types: ["meeting"] },
];

interface Range { from: number | null; to: number | null; phrase: string; has: (iso: string) => boolean }

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

function buildRange(preset: Preset, from: string, to: string): Range {
  let start: number | null = null;
  let end: number | null = null;
  let phrase: string;
  if (from || to) {
    if (from) start = new Date(`${from}T00:00:00`).getTime();
    if (to) end = new Date(`${to}T23:59:59.999`).getTime();
    phrase = from && to ? `from ${dayLabel(from)} to ${dayLabel(to)}` : from ? `from ${dayLabel(from)} onward` : `up to ${dayLabel(to)}`;
  } else {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (preset === "year") start = new Date(d.getFullYear(), 0, 1).getTime();
    else if (preset !== "all") { d.setDate(d.getDate() - Number(preset)); start = d.getTime(); }
    phrase = PRESETS.find((p) => p.value === preset)!.phrase;
  }
  const has = (iso: string) => {
    const t = new Date(iso).getTime();
    return (start == null || t >= start) && (end == null || t <= end);
  };
  return { from: start, to: end, phrase, has };
}

export function Dashboards() {
  const crm = useCrm();
  const quick = useQuick();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = TABS.some((t) => t.value === tabParam) ? tabParam! : "funnel";
  const presetParam = params.get("range") as Preset | null;
  const preset: Preset = PRESETS.some((p) => p.value === presetParam) ? presetParam! : DEFAULT_PRESET;
  const from = DAY.test(params.get("from") ?? "") ? params.get("from")! : "";
  const to = DAY.test(params.get("to") ?? "") ? params.get("to")! : "";
  const custom = !!(from || to);

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };

  const range = useMemo(() => buildRange(preset, from, to), [preset, from, to]);
  const cohort = useMemo(() => crm.companies.filter((c) => range.has(c.created_at)), [crm.companies, range]);
  const touches = useMemo(() => crm.interactions.filter((i) => range.has(i.occurred_at)), [crm.interactions, range]);

  if (crm.loading) return <Loading label="Loading the dashboards" />;
  if (crm.error) return <ErrorNote error={crm.error} />;

  return (
    <>
      <PageHeader title="Dashboards">
        <Tabs label="Dashboard" value={tab} onChange={(v) => patch({ tab: v === "funnel" ? null : v })} options={TABS} />
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div role="group" aria-label="Date range" className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const on = !custom && preset === p.value;
            return (
              <button key={p.value} aria-pressed={on}
                className={cx("btn btn-sm !h-10 sm:!h-9", on && "!border-depth-7 !bg-depth-1")}
                onClick={() => patch({ range: p.value === DEFAULT_PRESET ? null : p.value, from: null, to: null })}>
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12.5px] font-semibold">
            <span className="mb-0.5 block text-mute">From</span>
            <input type="date" className="input !h-10 !w-[150px] sm:!h-9" value={from} max={to || undefined}
              onChange={(e) => patch({ from: e.target.value || null })} />
          </label>
          <label className="text-[12.5px] font-semibold">
            <span className="mb-0.5 block text-mute">To</span>
            <input type="date" className="input !h-10 !w-[150px] sm:!h-9" value={to} min={from || undefined}
              onChange={(e) => patch({ to: e.target.value || null })} />
          </label>
          {custom && <button className="btn btn-ghost btn-sm !h-10 sm:!h-9" onClick={() => patch({ from: null, to: null })}>Clear dates</button>}
        </div>
        {range.from != null && range.to != null && range.from > range.to && (
          <p className="w-full text-[13px] text-magenta-dark" role="alert">The From date is after the To date, so nothing matches.</p>
        )}
      </div>

      {crm.companies.length === 0 ? (
        <EmptyState title="No prospects yet"
          action={<button className="btn btn-primary" onClick={quick.addProspect}>Add your first prospect</button>}>
          The dashboards fill in as prospects are added and touches are logged.
        </EmptyState>
      ) : tab === "funnel" ? <FunnelView crm={crm} cohort={cohort} range={range} />
        : tab === "activity" ? <ActivityView crm={crm} touches={touches} range={range} onLog={() => quick.logTouch()} />
        : tab === "templates" ? <TemplatesView crm={crm} touches={touches} range={range} />
        : <SegmentsView crm={crm} cohort={cohort} range={range} />}
    </>
  );
}

function Section({ title, caption, children }: { title: string; caption: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="section-title">{title}</h2>
        <p className="text-[13px] text-mute">{caption}</p>
      </div>
      {children}
    </section>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- Funnel ------------------------------------------------------------------

function FunnelView({ crm, cohort, range }: { crm: Crm; cohort: Company[]; range: Range }) {
  const funnel = useMemo(() => buildFunnel(cohort, crm.stageChanges), [cohort, crm.stageChanges]);
  const lost = cohort.filter((c) => c.stage === "lost");
  const nurture = cohort.filter((c) => c.stage === "nurture").length;
  const reasons = useMemo(() => {
    const groups = new Map<string, { text: string; count: number }>();
    for (const c of lost) {
      const text = c.lost_reason?.trim() || "No reason recorded";
      const g = groups.get(text.toLowerCase());
      if (g) g.count++; else groups.set(text.toLowerCase(), { text, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, 5);
  }, [lost]);

  const caption = <>Prospects added {range.phrase}, by the date each was created. {plural(cohort.length, "prospect")} in this cohort.</>;
  if (cohort.length === 0) {
    return (
      <Section title="Funnel" caption={caption}>
        <EmptyState title="No prospects were added in this range">Pick a wider date range to see how prospects moved through the stages.</EmptyState>
      </Section>
    );
  }

  const { steps, weakest } = funnel;
  const top = steps[0].reached || 1;
  const weak = weakest != null ? steps[weakest] : null;
  const grid = "grid grid-cols-[88px_minmax(0,1fr)_52px_52px] items-center gap-x-3 sm:grid-cols-[124px_minmax(0,1fr)_72px_72px]";

  return (
    <Section title="Funnel" caption={caption}>
      {weak && weakest != null ? (
        <p className="mb-3 rounded-[12px] bg-magenta-tint px-4 py-2.5 text-[13.5px] text-magenta-dark">
          <strong>Weakest step: {STAGE_LABEL[weak.stage]} to {STAGE_LABEL[steps[weakest + 1].stage]}.</strong>{" "}
          {percent(weak.conversion)} of the {plural(weak.reached, "prospect")} that reached {STAGE_LABEL[weak.stage]} went
          on to {STAGE_LABEL[steps[weakest + 1].stage]} ({steps[weakest + 1].reached} of {weak.reached}).
        </p>
      ) : (
        <p className="mb-3 text-[13.5px] text-mute">
          No weakest step named yet. A step needs at least 3 prospects behind it before it is compared.
        </p>
      )}

      <div className="card px-4 py-4 sm:px-5">
        <div className={cx(grid, "pb-2 text-[12.5px] font-bold text-mute")} aria-hidden="true">
          <span>Stage</span><span>Reached this stage or beyond</span><span className="text-right">Reached</span><span className="text-right">In stage</span>
        </div>
        <ol>
          {steps.map((s, i) => {
            const next = steps[i + 1];
            const isWeak = weakest === i;
            return (
              <li key={s.stage}>
                <div className={grid}>
                  <span className="truncate text-[13.5px] font-bold">{STAGE_LABEL[s.stage]}</span>
                  <span className="block h-5" aria-hidden="true"
                    title={`${STAGE_LABEL[s.stage]}: ${s.reached} reached, ${s.current} in stage now`}>
                    <span className={cx("block h-full rounded-r-[4px]", stageClass(s.stage))}
                      style={{ width: `${(s.reached / top) * 100}%`, minWidth: s.reached ? 3 : 0 }} />
                  </span>
                  <span className="text-right text-[13.5px] font-bold">{s.reached}<span className="sr-only"> reached this stage or beyond,</span></span>
                  <span className="text-right text-[13.5px] text-mute">{s.current}<span className="sr-only"> in this stage now.</span></span>
                </div>
                {next && (
                  <div className={cx(grid, "py-1")}>
                    <span />
                    <span className="col-span-3">
                      <span className={cx("inline-flex items-center gap-1 text-[12.5px]",
                        isWeak ? "chip chip-alert !h-auto min-h-[22px] whitespace-normal py-0.5" : "text-mute")}>
                        <ArrowDown size={13} aria-hidden="true" className="shrink-0" />
                        {s.conversion == null
                          ? `Nobody has reached ${STAGE_LABEL[s.stage]} yet`
                          : <span><strong className={cx(!isWeak && "text-navy")}>{percent(s.conversion)}</strong> went on to {STAGE_LABEL[next.stage]}{isWeak ? ", the weakest step" : ""}</span>}
                      </span>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="card px-4 py-3.5">
          <h3 className="text-[13.5px] font-bold">Side states in this cohort</h3>
          <dl className="mt-2 flex gap-8 text-[13.5px]">
            <div><dt className="text-mute">Nurture</dt><dd className="text-[18px] font-bold">{nurture}</dd></div>
            <div><dt className="text-mute">Lost</dt><dd className="text-[18px] font-bold">{lost.length}</dd></div>
          </dl>
          <p className="mt-1.5 text-[12.5px] text-mute">These still count toward every stage they passed through above.</p>
        </div>
        <div className="card px-4 py-3.5">
          <h3 className="text-[13.5px] font-bold">Most common lost reasons</h3>
          {reasons.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-mute">No prospects in this cohort are marked Lost.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px]">
              {reasons.map((r) => (
                <li key={r.text} className="flex items-baseline gap-3">
                  <span className="w-6 shrink-0 text-right font-bold">{r.count}</span>
                  <span className="min-w-0 break-words">{r.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

// --- Activity ----------------------------------------------------------------

function ActivityView({ crm, touches, range, onLog }: { crm: Crm; touches: Interaction[]; range: Range; onLog: () => void }) {
  const data = useMemo(() => {
    const team = [...crm.team].sort((a, b) => a.display_name.localeCompare(b.display_name));
    const counts = new Map<string, number[]>(); // `${week}|${person}` -> [emails, calls, meetings]
    const weekSet = new Set<string>();
    let unowned = false;
    for (const t of touches) {
      const g = ACTIVITY_GROUPS.findIndex((x) => x.types.includes(t.type));
      if (g < 0) continue;
      const person = t.team_member_id && crm.member.has(t.team_member_id) ? t.team_member_id : NOBODY;
      if (person === NOBODY) unowned = true;
      const week = weekStart(t.occurred_at);
      weekSet.add(week);
      const key = `${week}|${person}`;
      const row = counts.get(key) ?? [0, 0, 0];
      row[g]++;
      counts.set(key, row);
    }
    // Fill the gaps so a quiet week shows as a quiet week, not a missing one.
    const weeks: string[] = [];
    if (weekSet.size) {
      const sorted = [...weekSet].sort();
      const d = new Date(`${sorted[0]}T12:00:00`);
      for (let w = sorted[0]; w <= sorted[sorted.length - 1]; d.setDate(d.getDate() + 7), w = weekStart(d.toISOString())) weeks.push(w);
    }
    const people = team.map((m, i) => ({ id: m.id, name: m.display_name, color: PERSON_COLORS[i % PERSON_COLORS.length] }));
    if (unowned) people.push({ id: NOBODY, name: "No one recorded", color: "var(--color-mute)" });
    const cell = (week: string, person: string) => counts.get(`${week}|${person}`) ?? [0, 0, 0];
    const totals = new Map(people.map((p) => [p.id, weeks.reduce((sum, w) => cell(w, p.id).map((n, i) => n + sum[i]), [0, 0, 0])]));
    const weekTotal = (week: string, person: string) => cell(week, person).reduce((a, b) => a + b, 0);
    const max = Math.max(0, ...weeks.flatMap((w) => people.map((p) => weekTotal(w, p.id))));
    return { people, weeks, cell, totals, weekTotal, max };
  }, [crm.team, crm.member, touches]);

  const { people, weeks, cell, totals, weekTotal, max } = data;
  const caption = <>Emails sent, calls (including voicemails and gatekeepers) and meetings logged {range.phrase}, by the date each touch happened. Weeks start on Monday.</>;
  if (weeks.length === 0) {
    return (
      <Section title="Activity" caption={caption}>
        <EmptyState title="No emails, calls or meetings in this range"
          action={<button className="btn btn-primary" onClick={onLog}>Log a touch</button>}>
          Log a touch or pick a wider date range.
        </EmptyState>
      </Section>
    );
  }

  const chartWeeks = weeks.slice(-MAX_CHART_WEEKS);
  return (
    <Section title="Activity" caption={caption}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => {
          const total = totals.get(p.id)!.reduce((a, b) => a + b, 0);
          const shown = chartWeeks.map((w) => weekTotal(w, p.id));
          const peak = Math.max(...shown);
          const peakWeek = chartWeeks[shown.indexOf(peak)];
          return (
            <div key={p.id} className="card px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} aria-hidden="true" />
                <h3 className="min-w-0 truncate text-[13.5px] font-bold">{p.name}</h3>
                <span className="ml-auto shrink-0 text-[13px] text-mute"><strong className="text-navy">{total}</strong> {total === 1 ? "touch" : "touches"}</span>
              </div>
              <div role="img" className="mt-3 flex h-16 items-end gap-[2px] border-b border-line"
                aria-label={`${p.name}: total touches per week over ${plural(chartWeeks.length, "week")}. ${peak ? `Busiest week ${peak}, week of ${shortDate(peakWeek)}.` : "None logged."}`}>
                {chartWeeks.map((w, i) => (
                  <span key={w} className="flex h-full min-w-[2px] max-w-[16px] flex-1 items-end"
                    title={`Week of ${shortDate(w)}: ${plural(shown[i], "touch", "touches")}`}>
                    <span className="block w-full rounded-t-[3px]"
                      style={{ background: p.color, height: max ? `${(shown[i] / max) * 100}%` : 0, minHeight: shown[i] ? 2 : 0 }} />
                  </span>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11.5px] text-mute" aria-hidden="true">
                <span>{shortDate(chartWeeks[0])}</span>
                {chartWeeks.length > 1 && <span>{shortDate(chartWeeks[chartWeeks.length - 1])}</span>}
              </div>
              <p className="mt-1 text-[12.5px] text-mute">
                {peak ? `Busiest week: ${peak}, week of ${shortDate(peakWeek)}` : "No emails, calls or meetings in this range"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mb-2 text-[12.5px] text-mute">
        Bars are total touches per week on one shared scale (tallest bar is {max}).
        {weeks.length > MAX_CHART_WEEKS && ` Charts show the latest ${MAX_CHART_WEEKS} weeks; the table has all ${weeks.length}.`}
      </p>

      <div className="card overflow-x-auto">
        <table className="table" style={{ minWidth: 150 + people.length * 216 }}>
          <thead>
            <tr>
              <th rowSpan={2} scope="col">Week of</th>
              {people.map((p) => (
                <th key={p.id} colSpan={3} scope="colgroup" className="!text-navy">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden="true" />{p.name}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {people.map((p) => ACTIVITY_GROUPS.map((g) => (
                <th key={`${p.id}${g.label}`} scope="col" className="num !rounded-none">{g.label}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={w}>
                <th scope="row" className="!static !h-10 !bg-transparent !text-[13.5px] !font-semibold !text-navy">{dayLabel(w)}</th>
                {people.map((p) => cell(w, p.id).map((n, i) => (
                  <td key={`${p.id}${i}`} className={cx("num", n === 0 && "text-mute")}>{n}</td>
                )))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="!static !h-10 !rounded-none !border-b-0 !text-[13.5px] !text-navy">Total</th>
              {people.map((p) => totals.get(p.id)!.map((n, i) => (
                <td key={`${p.id}${i}`} className="num !border-b-0 bg-lane font-bold">{n}</td>
              )))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

// --- Templates ---------------------------------------------------------------

function RateCell({ rate, count, of }: { rate: number | null; count: number; of: number }) {
  if (rate == null) return <span className="text-mute">n/a</span>;
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-2 w-[72px] shrink-0 rounded-full bg-sand" aria-hidden="true">
        <span className="block h-full rounded-full bg-depth-5" style={{ width: `${rate * 100}%`, minWidth: count ? 3 : 0 }} />
      </span>
      <strong className="w-10 text-right">{percent(rate)}</strong>
      <span className="whitespace-nowrap text-[12.5px] text-mute">{count} of {of}</span>
    </span>
  );
}

function TemplatesView({ crm, touches, range }: { crm: Crm; touches: Interaction[]; range: Range }) {
  const groups = useMemo(() => {
    const stats = templateStats(crm.templates, touches, crm.companies, crm.stageChanges)
      .sort((a, b) => a.template.name.localeCompare(b.template.name) || a.template.version - b.template.version);
    const byName = new Map<string, TemplateStat[]>();
    for (const s of stats) byName.set(s.template.name, [...(byName.get(s.template.name) ?? []), s]);
    return [...byName.values()].map((rows) => {
      const eligible = rows.filter((r) => r.sent >= MIN_SENDS);
      const best = rows.length > 1 && eligible.length ? Math.max(...eligible.map((r) => r.replyRate ?? 0)) : null;
      return { rows, best: best ? best : null };
    });
  }, [crm.templates, touches, crm.companies, crm.stageChanges]);

  const caption = <>Touches logged {range.phrase}, by the date each happened. Sent counts the prospects a template was used on; replies and calls held are counted after its first use.</>;
  const everLinked = crm.interactions.some((i) => i.template_id);
  const linkedInRange = touches.some((i) => i.template_id);
  if (!linkedInRange) {
    return (
      <Section title="Templates" caption={caption}>
        {everLinked ? (
          <EmptyState title="No template was used in this range">Pick a wider date range to compare template versions.</EmptyState>
        ) : (
          <EmptyState title="No touch is linked to a template yet">
            Choose a template when you log a touch. That link is what feeds this view, so each version can be compared on replies and calls.
          </EmptyState>
        )}
      </Section>
    );
  }

  return (
    <Section title="Templates" caption={caption}>
      <div className="card overflow-x-auto">
        <table className="table min-w-[980px]">
          <thead>
            <tr>
              <th>Template</th><th>Version</th><th>Type</th><th>Status</th><th className="num">Sent</th>
              <th>Reply rate</th><th>Call held rate</th><th>Compare</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ rows, best }) => rows.map((s, i) => (
              <tr key={s.template.id}>
                <td className={cx("max-w-0", i > 0 && "!border-t-0")} style={{ width: "22%" }}>
                  <span className={cx("block truncate", i === 0 ? "font-bold" : "text-mute")} title={s.template.name}>{s.template.name}</span>
                </td>
                <td>v{s.template.version}</td>
                <td>{TEMPLATE_TYPE_LABEL[s.template.type]}</td>
                <td>{s.template.active ? <span className="chip chip-plain">Active</span> : <span className="text-mute">Inactive</span>}</td>
                <td className="num font-bold">{s.sent}</td>
                <td><RateCell rate={s.replyRate} count={s.replied} of={s.sent} /></td>
                <td><RateCell rate={s.callRate} count={s.callsBooked} of={s.sent} /></td>
                <td className="whitespace-nowrap">
                  {s.sent === 0 ? <span className="text-[12.5px] text-mute">Not used in this range</span>
                    : s.sent < MIN_SENDS ? <span className="text-[12.5px] text-mute">Too few sends to compare</span>
                    : best != null && s.replyRate === best ? <span className="chip chip-good">Best so far</span> : null}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-mute">
        Best so far marks the highest reply rate among versions of one template, counting only versions with at least {MIN_SENDS} sends.
        Call held rate is the share of those prospects that reached Call held or beyond.
      </p>
    </Section>
  );
}

// --- Segments ----------------------------------------------------------------

function SegmentList({ title, rows }: { title: string; rows: SegmentStat[] }) {
  return (
    <div className="card px-4 py-3.5">
      <h3 className="text-[13.5px] font-bold">{title}</h3>
      {rows.length === 0 ? <p className="mt-2 text-[13.5px] text-mute">No contacted prospects to group.</p> : (
        <ul className="mt-2.5 flex flex-col gap-3">
          {rows.map((r) => {
            const small = r.contacted < MIN_SEGMENT;
            return (
              <li key={r.key}>
                <div className="flex items-baseline gap-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate font-semibold" title={r.key}>{r.key}</span>
                  {small
                    ? <span className="shrink-0 text-[12.5px] text-mute">{percent(r.rate)}, small sample</span>
                    : <strong className="shrink-0">{percent(r.rate)}</strong>}
                  <span className="w-[58px] shrink-0 text-right text-[12.5px] text-mute">{r.responded} of {r.contacted}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-sand" aria-hidden="true">
                  <div className={cx("h-full rounded-full", small ? "bg-depth-3" : "bg-depth-5")}
                    style={{ width: `${(r.rate ?? 0) * 100}%`, minWidth: r.responded ? 3 : 0 }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SegmentsView({ crm, cohort, range }: { crm: Crm; cohort: Company[]; range: Range }) {
  const lists = useMemo(() => {
    const order = (key: string) => { const i = SIZE_BUCKETS.indexOf(key); return i < 0 ? SIZE_BUCKETS.length : i; };
    return [
      { title: "By industry", rows: segmentStats(cohort, crm.stageChanges, (c) => c.industry?.trim() || null) },
      {
        title: "By size (people)",
        rows: segmentStats(cohort, crm.stageChanges, (c) => c.size_bucket).sort((a, b) => order(a.key) - order(b.key)),
      },
      { title: "By source", rows: segmentStats(cohort, crm.stageChanges, (c) => (c.source ? SOURCE_LABEL[c.source] : null)) },
    ];
  }, [cohort, crm.stageChanges]);

  const contacted = lists[0].rows.reduce((n, r) => n + r.contacted, 0);
  const caption = <>Prospects added {range.phrase}, by the date each was created. Response rate is the share of contacted prospects that reached {STAGE_LABEL[FUNNEL_STAGES[3]]} or beyond. {contacted} of {plural(cohort.length, "prospect")} in this cohort {contacted === 1 ? "was" : "were"} contacted.</>;
  if (contacted === 0) {
    return (
      <Section title="Segments" caption={caption}>
        <EmptyState title={cohort.length ? "No prospects in this range have been contacted yet" : "No prospects were added in this range"}>
          Response rates appear once prospects reach Contacted. Pick a wider date range to see more.
        </EmptyState>
      </Section>
    );
  }
  return (
    <Section title="Segments" caption={caption}>
      <div className="grid gap-4 lg:grid-cols-3">
        {lists.map((l) => <SegmentList key={l.title} title={l.title} rows={l.rows} />)}
      </div>
      <p className="mt-2 text-[12.5px] text-mute">
        Bar length is the response rate out of 100%. Groups with fewer than {MIN_SEGMENT} contacted prospects are marked small sample and drawn lighter.
      </p>
    </Section>
  );
}
