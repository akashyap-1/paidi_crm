// Renders the sample spec into in-memory tables for demo mode (dev server only).
import { sizeBucket, suggestFitScore } from "../lib/analytics";
import type { Stage, Tables } from "../lib/types";
import { COMPANIES, REVIEW_THREADS, TASKS, TEMPLATES, type Who } from "./spec";

export const DEMO_MEMBERS: Tables["allowed_users"][] = [
  { id: "m-advik", email: "advikkashyap1@gmail.com", role: "admin", display_name: "Advik" },
  { id: "m-neel", email: "neelsrinivasan0@gmail.com", role: "admin", display_name: "Neel" },
  { id: "m-raphy", email: "raphaelmuthu23@gmail.com", role: "editor", display_name: "Raphy" },
];
const member = (who: Who) => `m-${who}`;
const ago = (days: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};
const TECH = /(\bcto\b|\bcio\b|chief technology|chief information|engineer|developer|technical|technology|software|\bit\b|devops|\bdata\b)/i;

export type DemoStore = { [K in keyof Tables]: Tables[K][] };

export function buildDemoStore(): DemoStore {
  const store: DemoStore = {
    allowed_users: DEMO_MEMBERS, companies: [], contacts: [], research: [], templates: [],
    interactions: [], call_intel: [], tasks: [], stage_changes: [], gmail_accounts: [],
    gmail_threads: [], settings: [
      { key: "followup_days", value: 3 }, { key: "max_touches", value: 3 },
      { key: "classify_auto_threshold", value: 0.8 }, { key: "classify_review_threshold", value: 0.4 },
      { key: "backfill_days", value: 90 },
      { key: "paidi_keywords", value: ["paidi", "philadelphia ai development initiative"] },
    ],
  };

  const templateId = new Map<string, string>();
  TEMPLATES.forEach((t, i) => {
    const id = `t-${i}`;
    templateId.set(t.key, id);
    store.templates.push({
      id, name: t.name, type: t.type, version: t.version, subject: t.subject, body: t.body,
      active: t.active, is_sample: true, created_by: member(t.by), created_at: ago(95),
    });
  });

  const companyId = new Map<string, string>();
  COMPANIES.forEach((c, i) => {
    const id = `c-${i}`;
    companyId.set(c.name, id);
    const fit = suggestFitScore(c.industry, c.employees);
    const lastTouch = c.touches.reduce<number | null>((m, t) => (m == null || t.daysAgo < m ? t.daysAgo : m), null);
    store.companies.push({
      id, name: c.name, website: `https://${c.domain}`, domain: c.domain, linkedin_url: null,
      industry: c.industry, employee_count: c.employees, size_bucket: sizeBucket(c.employees),
      location: c.location, source: c.source, source_detail: c.sourceDetail ?? null,
      fit_score: fit, fit_score_suggested: fit, owner_id: member(c.owner), stage: c.stage as Stage,
      lost_reason: c.lostReason ?? null, do_not_contact: false, notes: null,
      stage_changed_at: ago(c.path?.length ? Math.max(0, (lastTouch ?? 0)) : c.createdDaysAgo),
      last_contacted_at: lastTouch == null ? null : ago(lastTouch),
      is_sample: true, created_at: ago(c.createdDaysAgo),
    });
    const contactId = `p-${i}`;
    const [first, ...rest] = c.contact.name.toLowerCase().split(" ");
    store.contacts.push({
      id: contactId, company_id: id, name: c.contact.name, title: c.contact.title,
      is_technical: TECH.test(c.contact.title), email: `${first}.${rest.join("")}@${c.domain}`,
      phone: null, linkedin_url: null, referral_source: c.contact.referral ?? null,
      do_not_contact: false, owner_id: member(c.owner), notes: null, created_at: ago(c.createdDaysAgo),
    });
    store.research.push({
      id: `r-${i}`, company_id: id, contact_id: contactId, hook: c.hook, hook_url: null,
      common_ground: c.common ?? null, tool_idea: c.idea, notes: null, created_at: ago(c.createdDaysAgo),
    });
    const path = [...(c.path ?? []), [c.stage, lastTouch ?? c.createdDaysAgo] as [string, number, string?]];
    path.forEach(([stage, daysAgo, reason], j) => {
      const prev = j === 0 ? null : (path[j - 1][0] as Stage);
      const auto = !!reason || (j === path.length - 1 && j > 0 && ["contacted", "followed_up", "responded", "nurture"].includes(stage));
      store.stage_changes.push({
        id: `s-${i}-${j}`, company_id: id, from_stage: prev, to_stage: stage as Stage,
        automatic: auto, changed_by: auto ? null : member(c.owner), undone_at: null,
        reason: reason ?? (j === 0 ? "Created" : auto
          ? (stage === "nurture" ? "No reply after 3 touches" : stage === "responded" ? "Reply received" : "First email sent")
          : null),
        created_at: ago(j === 0 ? c.createdDaysAgo : daysAgo),
      });
    });
    c.touches.forEach((t, j) => {
      const iid = `i-${i}-${j}`;
      const email = t.type === "email_out" || t.type === "email_in";
      store.interactions.push({
        id: iid, company_id: id, contact_id: contactId, type: t.type, occurred_at: ago(t.daysAgo, 9 + j),
        team_member_id: member(t.by), subject: t.subject ?? null, summary: t.summary,
        template_id: t.template ? templateId.get(t.template) ?? null : null,
        gmail_thread_id: email ? `demo-thread-${i}` : null, gmail_message_id: email ? `demo-msg-${i}-${j}` : null,
        thread_url: email ? "https://mail.google.com/" : null, recording_url: null,
        outcome: t.outcome ?? null, source: email ? "gmail" : "manual", created_at: ago(t.daysAgo),
      });
      if (t.intel) {
        store.call_intel.push({
          interaction_id: iid, why_took_call: t.intel.why_took_call ?? null, pain_points: t.intel.pain_points ?? null,
          objections: t.intel.objections ?? null, lost_interest_at: t.intel.lost_interest_at ?? null,
          asks: t.intel.asks ?? null, next_step: t.intel.next_step ?? null,
        });
      }
    });
  });

  const due = (days: number) => ago(-days).slice(0, 10);
  TASKS.forEach((t, i) => {
    store.tasks.push({
      id: `k-${i}`, title: t.title, description: t.description, assignee_id: member(t.assignee),
      due_date: due(t.dueInDays), status: t.status, priority: t.priority,
      company_id: t.company ? companyId.get(t.company) ?? null : null, contact_id: null,
      source: "manual", auto_key: null, completed_at: t.status === "done" ? ago(3) : null,
      is_sample: true, created_by: member(t.assignee), created_at: ago(6),
    });
  });
  // Automatic follow-up tasks for the two prospects that are overdue.
  [["Keystone Legal Group", "Priya Raman", "advik", 2], ["Ridgeway Title Co.", "Elena Marsh", "neel", 1]].forEach(([co, person, who, touches], i) => {
    store.tasks.push({
      id: `k-auto-${i}`, title: `Follow up with ${person} (call or email, not both)`,
      description: `Touch ${Number(touches) + 1} of 3 for ${co}. No reply in 3 days.`,
      assignee_id: member(who as Who), due_date: due(0), status: "todo", priority: "medium",
      company_id: companyId.get(co as string) ?? null, contact_id: null, source: "auto",
      auto_key: `followup:${co}:${touches}`, completed_at: null, is_sample: true, created_by: null, created_at: ago(1),
    });
  });

  store.gmail_accounts.push(
    { id: "g-advik", team_member_id: "m-advik", email: "advikkashyap1@gmail.com", kind: "personal", status: "active",
      last_error: null, last_synced_at: ago(0, new Date().getHours()), backfill_days: 90, backfill_pending: false, connected_at: ago(20) },
    { id: "g-neel", team_member_id: "m-neel", email: "neelsrinivasan0@gmail.com", kind: "personal", status: "active",
      last_error: null, last_synced_at: ago(0, new Date().getHours()), backfill_days: 90, backfill_pending: false, connected_at: ago(20) },
  );
  REVIEW_THREADS.forEach((t, i) => {
    store.gmail_threads.push({
      id: `q-${i}`, account_id: `g-${t.by}`, gmail_thread_id: `demo-review-${i}`, status: "review",
      confidence: t.confidence, method: "ai", reason: t.reason, subject: t.subject,
      participants: [...t.participants], snippet: t.snippet, message_count: 1, last_message_at: ago(t.daysAgo),
    });
  });
  return store;
}
