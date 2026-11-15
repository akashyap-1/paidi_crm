import { describe, expect, it } from "vitest";
import {
  buildFunnel, followUpOverdue, segmentStats, sizeBucket, suggestFitScore, templateStats,
} from "./analytics";
import type { Company, Interaction, Stage, StageChange, Template } from "./types";

const company = (id: string, stage: Stage, extra: Partial<Company> = {}): Company => ({
  id, name: id, website: null, domain: null, linkedin_url: null, industry: null, employee_count: null,
  size_bucket: null, location: null, source: null, source_detail: null, fit_score: null,
  fit_score_suggested: null, owner_id: null, stage, lost_reason: null, do_not_contact: false, notes: null,
  stage_changed_at: "2026-01-01T00:00:00Z", last_contacted_at: null, is_sample: false,
  created_at: "2026-01-01T00:00:00Z", ...extra,
});
const change = (company_id: string, from: Stage | null, to: Stage, undone = false): StageChange => ({
  id: `${company_id}-${to}`, company_id, from_stage: from, to_stage: to, automatic: false, reason: null,
  changed_by: null, undone_at: undone ? "2026-01-02T00:00:00Z" : null, created_at: "2026-01-01T00:00:00Z",
});
const touch = (company_id: string, type: Interaction["type"], occurred_at: string, template_id: string | null = null): Interaction => ({
  id: `${company_id}-${type}-${occurred_at}`, company_id, contact_id: null, type, occurred_at,
  team_member_id: null, subject: null, summary: null, template_id, gmail_thread_id: null,
  gmail_message_id: null, thread_url: null, recording_url: null, outcome: null, source: "manual",
  created_at: occurred_at,
});

describe("suggestFitScore", () => {
  it("scores 30 to 60 person accounting, legal and compliance firms highest", () => {
    expect(suggestFitScore("Accounting", 42)).toBe(5);
    expect(suggestFitScore("Legal", 55)).toBe(5);
    expect(suggestFitScore("Compliance", 38)).toBe(5);
  });
  it("scores finance and multinationals lower", () => {
    expect(suggestFitScore("Finance", 210)).toBe(1);
    expect(suggestFitScore("Other", 5000)).toBe(1);
    expect(suggestFitScore("Finance", 40)).toBe(3);
  });
  it("stays neutral without information", () => {
    expect(suggestFitScore(null, null)).toBe(3);
  });
});

describe("sizeBucket", () => {
  it("matches the database buckets", () => {
    expect([1, 10, 11, 30, 31, 60, 61, 200, 201].map(sizeBucket)).toEqual(
      ["1-10", "1-10", "11-30", "11-30", "30-60", "30-60", "61-200", "61-200", "200+"]);
    expect(sizeBucket(null)).toBeNull();
  });
});

describe("buildFunnel", () => {
  const companies = [
    company("a", "researched"), company("b", "contacted"), company("c", "contacted"),
    company("d", "responded"), company("e", "nurture"), company("f", "lost", { lost_reason: "x" }),
  ];
  const changes = [
    change("e", "contacted", "followed_up"), change("e", "followed_up", "nurture"),
    change("f", "responded", "call_held"), change("f", "call_held", "lost"),
  ];
  const funnel = buildFunnel(companies, changes);

  it("counts who reached each stage, including prospects now in a side state", () => {
    expect(funnel.steps.map((s) => s.reached)).toEqual([6, 5, 3, 2, 1, 0, 0, 0]);
  });
  it("counts who sits in each stage now", () => {
    expect(funnel.steps.map((s) => s.current)).toEqual([1, 2, 0, 1, 0, 0, 0, 0]);
  });
  it("computes conversion to the next stage and finds the weakest step", () => {
    expect(funnel.steps[0].conversion).toBeCloseTo(5 / 6);
    expect(funnel.steps[1].conversion).toBeCloseTo(3 / 5);
    expect(funnel.weakest).toBe(1);
    expect(funnel.steps[7].conversion).toBeNull();
  });
  it("ignores undone stage changes", () => {
    const f = buildFunnel([company("x", "contacted")], [change("x", "contacted", "responded", true)]);
    expect(f.steps[3].reached).toBe(0);
  });
  it("handles an empty pipeline", () => {
    expect(buildFunnel([], []).weakest).toBeNull();
  });
});

describe("followUpOverdue", () => {
  const now = new Date("2026-03-10T12:00:00Z").getTime();
  const c = company("a", "contacted");
  it("is overdue when the last touch is older than the window and nobody replied", () => {
    expect(followUpOverdue(c, [touch("a", "email_out", "2026-03-06T12:00:00Z")], 3, now)).toBe(true);
  });
  it("is not overdue inside the window, after a reply, or when flagged do not contact", () => {
    expect(followUpOverdue(c, [touch("a", "email_out", "2026-03-09T12:00:00Z")], 3, now)).toBe(false);
    expect(followUpOverdue(c, [
      touch("a", "email_out", "2026-03-01T12:00:00Z"), touch("a", "email_in", "2026-03-02T12:00:00Z"),
    ], 3, now)).toBe(false);
    expect(followUpOverdue({ ...c, do_not_contact: true }, [touch("a", "email_out", "2026-03-01T12:00:00Z")], 3, now)).toBe(false);
  });
  it("only applies to Contacted and Followed up", () => {
    expect(followUpOverdue(company("a", "call_held"), [touch("a", "email_out", "2026-03-01T12:00:00Z")], 3, now)).toBe(false);
  });
});

describe("templateStats", () => {
  it("reports reply and call-booked rates per template version", () => {
    const t: Template = {
      id: "t1", name: "Cold", type: "cold_email", version: 1, subject: null, body: "", active: true,
      is_sample: false, created_by: null, created_at: "2026-01-01T00:00:00Z",
    };
    const companies = [company("a", "responded"), company("b", "contacted"), company("c", "call_held")];
    const interactions = [
      touch("a", "email_out", "2026-02-01T00:00:00Z", "t1"), touch("a", "email_in", "2026-02-03T00:00:00Z"),
      touch("b", "email_out", "2026-02-01T00:00:00Z", "t1"),
      touch("c", "email_out", "2026-02-01T00:00:00Z", "t1"), touch("c", "email_in", "2026-02-02T00:00:00Z"),
    ];
    const [stat] = templateStats([t], interactions, companies, []);
    expect(stat.sent).toBe(3);
    expect(stat.replied).toBe(2);
    expect(stat.callsBooked).toBe(1);
    expect(stat.replyRate).toBeCloseTo(2 / 3);
  });
});

describe("segmentStats", () => {
  it("computes response rate among contacted prospects only", () => {
    const companies = [
      company("a", "researched", { industry: "Legal" }), company("b", "contacted", { industry: "Legal" }),
      company("c", "responded", { industry: "Legal" }), company("d", "client", { industry: "Accounting" }),
    ];
    const stats = segmentStats(companies, [], (c) => c.industry);
    expect(stats.find((s) => s.key === "Legal")).toMatchObject({ contacted: 2, responded: 1, rate: 0.5 });
    expect(stats.find((s) => s.key === "Accounting")).toMatchObject({ contacted: 1, responded: 1, rate: 1 });
  });
});
