import { FUNNEL_STAGES, OUTBOUND_TOUCHES, REPLY_TYPES, stageRank } from "./constants";
import type { Company, Interaction, Stage, StageChange, Template } from "./types";

/** Mirrors public.suggest_fit_score in the database. */
export function suggestFitScore(industry: string | null, employees: number | null): number {
  let score = 3;
  const ind = industry ?? "";
  if (/(account|bookkeep|tax|audit|legal|law|compliance|payroll|title|insurance)/i.test(ind)) score += 1;
  else if (/(financ|bank|invest|private equity|hedge|capital)/i.test(ind)) score -= 1;
  if (employees != null) {
    if (employees >= 30 && employees <= 60) score += 1;
    else if (employees >= 11 && employees <= 200) score += 0;
    else if (employees > 1000) score -= 2;
    else score -= 1;
  }
  return Math.max(1, Math.min(5, score));
}

export function sizeBucket(employees: number | null): string | null {
  if (employees == null) return null;
  if (employees <= 10) return "1-10";
  if (employees <= 30) return "11-30";
  if (employees <= 60) return "30-60";
  if (employees <= 200) return "61-200";
  return "200+";
}

/**
 * The furthest funnel stage each company has reached. A company in Nurture or
 * Lost still counts for the stages it passed through on the way.
 */
export function furthestRank(company: Company, changes: StageChange[]): number {
  let rank = stageRank(company.stage);
  for (const c of changes) {
    if (c.company_id !== company.id || c.undone_at) continue;
    rank = Math.max(rank, stageRank(c.to_stage), c.from_stage ? stageRank(c.from_stage) : 0);
  }
  return Math.max(rank, 1);
}

export interface FunnelStep {
  stage: Stage;
  /** Companies sitting in this stage right now. */
  current: number;
  /** Companies that reached this stage or beyond. */
  reached: number;
  /** Share of those who reached this stage that went on to the next. */
  conversion: number | null;
}

export interface Funnel {
  steps: FunnelStep[];
  /** Index of the step with the lowest conversion to the next stage. */
  weakest: number | null;
}

export function buildFunnel(companies: Company[], changes: StageChange[]): Funnel {
  const reached = FUNNEL_STAGES.map(() => 0);
  const current = FUNNEL_STAGES.map(() => 0);
  const byCompany = new Map<string, StageChange[]>();
  for (const c of changes) {
    const list = byCompany.get(c.company_id);
    if (list) list.push(c); else byCompany.set(c.company_id, [c]);
  }
  for (const company of companies) {
    const rank = furthestRank(company, byCompany.get(company.id) ?? []);
    for (let i = 0; i < rank; i++) reached[i]++;
    const now = stageRank(company.stage);
    if (now) current[now - 1]++;
  }
  const steps: FunnelStep[] = FUNNEL_STAGES.map((stage, i) => ({
    stage,
    current: current[i],
    reached: reached[i],
    conversion: i < FUNNEL_STAGES.length - 1 && reached[i] > 0 ? reached[i + 1] / reached[i] : null,
  }));
  let weakest: number | null = null;
  steps.forEach((s, i) => {
    // Needs a few prospects behind it before a step is called the weakest.
    if (s.conversion == null || s.reached < 3) return;
    if (weakest == null || s.conversion < (steps[weakest].conversion ?? 1)) weakest = i;
  });
  return { steps, weakest };
}

/** Number of cadence touches made for a company (capped by the caller). */
export function touchCount(companyId: string, interactions: Interaction[]): number {
  return interactions.filter(
    (i) => i.company_id === companyId && OUTBOUND_TOUCHES.includes(i.type),
  ).length;
}

export function hasReply(companyId: string, interactions: Interaction[]): boolean {
  return interactions.some((i) => i.company_id === companyId && REPLY_TYPES.includes(i.type));
}

export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** No reply, cadence not exhausted, and the last touch is older than the follow-up window. */
export function followUpOverdue(
  company: Company, interactions: Interaction[], followupDays: number, now = Date.now(),
): boolean {
  if (company.stage !== "contacted" && company.stage !== "followed_up") return false;
  if (company.do_not_contact || hasReply(company.id, interactions)) return false;
  const last = interactions
    .filter((i) => i.company_id === company.id && OUTBOUND_TOUCHES.includes(i.type))
    .reduce<string | null>((m, i) => (!m || i.occurred_at > m ? i.occurred_at : m), null);
  const days = daysSince(last, now);
  return days != null && days >= followupDays;
}

export interface TemplateStat {
  template: Template;
  sent: number;
  replied: number;
  callsBooked: number;
  replyRate: number | null;
  callRate: number | null;
}

/**
 * Per template version: of the companies it was used on, how many replied
 * afterwards and how many went on to hold a call.
 */
export function templateStats(
  templates: Template[], interactions: Interaction[], companies: Company[], changes: StageChange[],
): TemplateStat[] {
  const companyById = new Map(companies.map((c) => [c.id, c]));
  return templates.map((template) => {
    const uses = interactions.filter((i) => i.template_id === template.id);
    const firstUse = new Map<string, string>();
    for (const u of uses) {
      const prev = firstUse.get(u.company_id);
      if (!prev || u.occurred_at < prev) firstUse.set(u.company_id, u.occurred_at);
    }
    let replied = 0;
    let callsBooked = 0;
    for (const [companyId, at] of firstUse) {
      if (interactions.some((i) =>
        i.company_id === companyId && REPLY_TYPES.includes(i.type) && i.occurred_at >= at)) replied++;
      const company = companyById.get(companyId);
      if (company && furthestRank(company, changes.filter((c) => c.company_id === companyId)) >= 5) {
        callsBooked++;
      }
    }
    const sent = firstUse.size;
    return {
      template, sent, replied, callsBooked,
      replyRate: sent ? replied / sent : null,
      callRate: sent ? callsBooked / sent : null,
    };
  });
}

export interface SegmentStat { key: string; contacted: number; responded: number; rate: number | null }

/** Response rate (reached Responded or beyond, of those contacted) by a company attribute. */
export function segmentStats(
  companies: Company[], changes: StageChange[], keyOf: (c: Company) => string | null,
): SegmentStat[] {
  const groups = new Map<string, { contacted: number; responded: number }>();
  for (const c of companies) {
    const rank = furthestRank(c, changes.filter((x) => x.company_id === c.id));
    if (rank < 2) continue;
    const key = keyOf(c) ?? "Unknown";
    const g = groups.get(key) ?? { contacted: 0, responded: 0 };
    g.contacted++;
    if (rank >= 4) g.responded++;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, ...g, rate: g.contacted ? g.responded / g.contacted : null }))
    .sort((a, b) => b.contacted - a.contacted);
}

/** Monday (local time) of the week containing the date, as yyyy-mm-dd. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function percent(value: number | null): string {
  return value == null ? "n/a" : `${Math.round(value * 100)}%`;
}
