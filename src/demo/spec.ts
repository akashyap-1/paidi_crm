// Sample data, defined once. Rendered two ways: into in-browser demo data
// (src/demo/data.ts) and into SQL for the real database (scripts/seed-sql.ts).
// Every company, person and email here is fictional.

export type Who = "advik" | "neel" | "raphy";
export type TouchType = "email_out" | "email_in" | "call" | "voicemail" | "gatekeeper" | "meeting" | "linkedin";

export interface TouchSpec {
  type: TouchType;
  daysAgo: number;
  by: Who;
  template?: string;
  subject?: string;
  summary: string;
  outcome?: string;
  intel?: {
    why_took_call?: string; pain_points?: string; objections?: string;
    lost_interest_at?: string; asks?: string; next_step?: string;
  };
}

export interface CompanySpec {
  name: string;
  domain: string;
  industry: string;
  employees: number;
  location: string;
  source: "linkedin_post" | "accelerator" | "news" | "referral" | "cold_email" | "other";
  sourceDetail?: string;
  stage: string;
  /** Stages passed through before the current one, oldest first, with days ago. */
  path?: [string, number, string?][];
  lostReason?: string;
  owner: Who;
  createdDaysAgo: number;
  contact: { name: string; title: string; referral?: string };
  hook: string;
  common?: string;
  idea: string;
  touches: TouchSpec[];
}

export const TEMPLATES = [
  { key: "cold-v1", name: "Cold intro", type: "cold_email", version: 1, active: false, by: "advik" as Who,
    subject: "Quick idea for {{company}}",
    body: "Hi {{first_name}},\n\nI'm a co-founder of PAIDI in Philadelphia. We build small AI tools that take repetitive work off teams like yours.\n\nWould you be open to a 15 minute call next week?\n\nAdvik" },
  { key: "cold-v2", name: "Cold intro", type: "cold_email", version: 2, active: true, by: "advik" as Who,
    subject: "Saw your post about {{hook}}",
    body: "Hi {{first_name}},\n\nYour post about {{hook}} caught my eye. We built a tool for a firm your size that cut that work from hours to minutes.\n\nI sketched what it could look like for {{company}}: {{tool_idea}}.\n\nWorth 15 minutes to see if it fits?\n\nAdvik" },
  { key: "follow-v1", name: "Follow-up bump", type: "follow_up", version: 1, active: true, by: "neel" as Who,
    subject: "Re: {{subject}}",
    body: "Hi {{first_name}},\n\nFloating this back up in case it got buried. Happy to send a one-page summary instead of a call if that's easier.\n\nNeel" },
  { key: "call-v1", name: "Cold call opener", type: "call_script", version: 1, active: true, by: "neel" as Who,
    subject: null,
    body: "Hi {{first_name}}, this is {{me}} from PAIDI here in Philadelphia. I'll be brief: we build small AI tools for firms like {{company}}.\n\nAsk: what caught your attention enough to pick up?\nAsk: where does your team lose the most hours each week?\nClose: can I send a one-pager and book 15 minutes?" },
  { key: "referral-v1", name: "Referral ask", type: "referral_ask", version: 1, active: true, by: "raphy" as Who,
    subject: "Who else should we talk to?",
    body: "Hi {{first_name}},\n\nThanks again for the time. Is there one other firm owner you think would want the same kind of tool? An intro in one line is plenty.\n\nRaphy" },
] as const;

const e = (daysAgo: number, by: Who, template: string, subject: string, summary: string): TouchSpec =>
  ({ type: "email_out", daysAgo, by, template, subject, summary });
const r = (daysAgo: number, by: Who, subject: string, summary: string): TouchSpec =>
  ({ type: "email_in", daysAgo, by, subject, summary });

export const COMPANIES: CompanySpec[] = [
  { name: "Hartwell & Associates", domain: "hartwell-associates.example", industry: "Accounting", employees: 42,
    location: "Philadelphia, PA", source: "linkedin_post", sourceDetail: "Post about month-end close taking nine days",
    stage: "responded", path: [["researched", 21], ["contacted", 16, "First email sent"], ["followed_up", 9, "Second email sent with no reply"]],
    owner: "advik", createdDaysAgo: 21,
    contact: { name: "Dana Whitaker", title: "Managing Partner" },
    hook: "Posted that month-end close still takes nine days", common: "Both Penn alumni",
    idea: "Auto-reconcile bank feeds and flag exceptions for review",
    touches: [
      e(16, "advik", "cold-v2", "Saw your post about month-end close", "Introduced PAIDI and pitched an auto-reconciliation tool."),
      e(9, "advik", "follow-v1", "Re: Saw your post about month-end close", "Bumped the first email and offered a one-pager."),
      r(2, "advik", "Re: Saw your post about month-end close", "Dana replied that the timing is good and asked for times next week."),
    ] },
  { name: "Brightline Compliance", domain: "brightlinecompliance.example", industry: "Compliance", employees: 38,
    location: "King of Prussia, PA", source: "referral", sourceDetail: "Intro from a Wharton classmate",
    stage: "call_held", path: [["researched", 30], ["contacted", 24, "First email sent"], ["responded", 20, "Reply received"]],
    owner: "neel", createdDaysAgo: 30,
    contact: { name: "Marcus Oyelaran", title: "COO", referral: "Sam Ortiz (Wharton)" },
    hook: "Hiring two analysts just to chase policy attestations", idea: "Attestation tracker that drafts and sends reminders",
    touches: [
      e(24, "neel", "cold-v2", "Saw your post about attestations", "Intro referencing the referral and the attestation backlog."),
      r(20, "neel", "Re: Saw your post about attestations", "Marcus asked for a call and copied his ops lead."),
      { type: "call", daysAgo: 0, by: "neel", template: "call-v1", summary: "30 minute discovery call. Strong interest in the attestation tracker.",
        outcome: "Wants a proposal",
        intel: { why_took_call: "The referral, and they are about to hire for this exact problem.",
          pain_points: "Analysts spend two days a week chasing signatures across 60 clients.",
          objections: "Worried about client data leaving their systems.",
          asks: "Send a one-pager and a rough price.", next_step: "Send proposal by Friday." } },
    ] },
  { name: "Keystone Legal Group", domain: "keystonelegal.example", industry: "Legal", employees: 55,
    location: "Philadelphia, PA", source: "news", sourceDetail: "Business Journal piece on their expansion",
    stage: "followed_up", path: [["researched", 18], ["contacted", 12, "First email sent"]],
    owner: "advik", createdDaysAgo: 18,
    contact: { name: "Priya Raman", title: "Operations Director" },
    hook: "Opening a second office and doubling intake volume", idea: "Intake triage that drafts conflict checks",
    touches: [
      e(12, "advik", "cold-v2", "Saw the news about your second office", "Pitched intake triage ahead of the expansion."),
      e(5, "advik", "follow-v1", "Re: Saw the news about your second office", "Short bump offering a one-pager."),
    ] },
  { name: "Fairmount Bookkeeping", domain: "fairmountbooks.example", industry: "Accounting", employees: 12,
    location: "Philadelphia, PA", source: "linkedin_post", stage: "contacted", path: [["researched", 6]],
    owner: "raphy", createdDaysAgo: 6,
    contact: { name: "Tom Ellery", title: "Owner" },
    hook: "Asked for receipt-scanning app recommendations", idea: "Receipt inbox that codes expenses automatically",
    touches: [e(1, "raphy", "cold-v2", "Saw your post about receipts", "Intro email with the receipt inbox idea.")] },
  { name: "Ridgeway Title Co.", domain: "ridgewaytitle.example", industry: "Real estate", employees: 64,
    location: "Cherry Hill, NJ", source: "accelerator", sourceDetail: "Venture Lab demo day attendee list",
    stage: "contacted", path: [["researched", 15]], owner: "neel", createdDaysAgo: 15,
    contact: { name: "Elena Marsh", title: "CTO" },
    hook: "Spoke on a panel about closing-document errors", idea: "Document checker that catches mismatched names and dates",
    touches: [e(8, "neel", "cold-v1", "Quick idea for Ridgeway Title", "Generic intro; no reply yet.")] },
  { name: "Penn Square Advisors", domain: "pennsquareadvisors.example", industry: "Finance", employees: 210,
    location: "Philadelphia, PA", source: "other", stage: "contacted", path: [["researched", 10]],
    owner: "advik", createdDaysAgo: 10,
    contact: { name: "Joel Stein", title: "Partner" },
    hook: "Mentioned manual KYC refresh at a meetup", idea: "KYC refresh assistant",
    touches: [e(3, "advik", "cold-v1", "Quick idea for Penn Square", "Intro email about KYC refresh.")] },
  { name: "Lantern Payroll", domain: "lanternpayroll.example", industry: "Payroll", employees: 31,
    location: "Wilmington, DE", source: "linkedin_post", stage: "researched", owner: "raphy", createdDaysAgo: 2,
    contact: { name: "Sofia Cruz", title: "Head of Ops" },
    hook: "Posted about onboarding 40 new client companies by hand", idea: "Client onboarding form that fills the payroll system",
    touches: [] },
  { name: "Callowhill Architects", domain: "callowhillarch.example", industry: "Architecture", employees: 27,
    location: "Philadelphia, PA", source: "news", stage: "contacted", path: [["researched", 11]],
    owner: "neel", createdDaysAgo: 11,
    contact: { name: "Ben Okafor", title: "Principal" },
    hook: "Won a city contract with heavy reporting requirements", idea: "Report generator from project logs",
    touches: [{ type: "voicemail", daysAgo: 6, by: "neel", template: "call-v1", summary: "Left a 20 second voicemail mentioning the city contract." }] },
  { name: "Girard Tax Partners", domain: "girardtax.example", industry: "Accounting", employees: 19,
    location: "Philadelphia, PA", source: "linkedin_post", stage: "researched", owner: "raphy", createdDaysAgo: 1,
    contact: { name: "Nina Albrecht", title: "Partner" },
    hook: "Complained about chasing clients for tax documents", idea: "Document chaser with a client checklist", touches: [] },
  { name: "Mill Creek CPA", domain: "millcreekcpa.example", industry: "Accounting", employees: 24,
    location: "Ardmore, PA", source: "referral", sourceDetail: "Referred by Dana Whitaker",
    stage: "followed_up", path: [["researched", 14], ["contacted", 10, "First email sent"]],
    owner: "neel", createdDaysAgo: 14,
    contact: { name: "Ravi Shah", title: "Partner", referral: "Dana Whitaker" },
    hook: "Dana said they lose a week every quarter to payroll tax filings", idea: "Quarterly filing prep assistant",
    touches: [
      e(10, "neel", "cold-v2", "Dana Whitaker suggested I reach out", "Referral intro about quarterly filings."),
      { type: "call", daysAgo: 3, by: "neel", template: "call-v1", summary: "Reached the front desk; Ravi was with a client.", outcome: "Call back Thursday" },
    ] },
  { name: "Wissahickon Insurance", domain: "wissahickonins.example", industry: "Insurance", employees: 80,
    location: "Conshohocken, PA", source: "accelerator", stage: "responded",
    path: [["researched", 20], ["contacted", 15, "First email sent"]], owner: "raphy", createdDaysAgo: 20,
    contact: { name: "Carla Dunn", title: "VP Operations" },
    hook: "Claims intake still arrives by fax and email", idea: "Claims intake reader that fills their system",
    touches: [
      e(15, "raphy", "cold-v2", "Saw your talk on claims intake", "Intro email about a claims intake reader."),
      r(1, "raphy", "Re: Saw your talk on claims intake", "Carla asked what it costs and whether it works with their current system."),
    ] },
  { name: "Chestnut Hill Wealth", domain: "chestnuthillwealth.example", industry: "Finance", employees: 16,
    location: "Philadelphia, PA", source: "referral", stage: "call_held",
    path: [["researched", 28], ["contacted", 22, "First email sent"], ["responded", 17, "Reply received"]],
    owner: "advik", createdDaysAgo: 28,
    contact: { name: "Owen Park", title: "Principal", referral: "Neel's former manager" },
    hook: "Spends Sundays building client review decks", idea: "Client review deck builder",
    touches: [
      e(22, "advik", "cold-v1", "Quick idea for Chestnut Hill Wealth", "Intro email."),
      r(17, "advik", "Re: Quick idea for Chestnut Hill Wealth", "Owen replied with interest and a calendar link."),
      { type: "meeting", daysAgo: 4, by: "advik", summary: "Video call. Likes the idea, unsure about budget this quarter.", outcome: "Follow up in January",
        intel: { why_took_call: "Curiosity; a friend vouched for us.", pain_points: "Six hours a week on review decks.",
          objections: "Budget is fixed until Q1.", lost_interest_at: "When pricing came up.",
          asks: "A sample deck built from dummy data.", next_step: "Send sample deck; check in early January." } },
    ] },
  { name: "Passyunk Property Mgmt", domain: "passyunkpm.example", industry: "Real estate", employees: 47,
    location: "Philadelphia, PA", source: "linkedin_post", stage: "proposal_sent",
    path: [["researched", 40], ["contacted", 34, "First email sent"], ["responded", 30, "Reply received"], ["call_held", 20]],
    owner: "neel", createdDaysAgo: 40,
    contact: { name: "Lila Torres", title: "General Manager" },
    hook: "Posted about 300 maintenance emails a week", idea: "Maintenance inbox that sorts and dispatches requests",
    touches: [
      e(34, "neel", "cold-v2", "Saw your post about maintenance email", "Intro with the maintenance inbox idea."),
      r(30, "neel", "Re: Saw your post about maintenance email", "Lila said yes to a call."),
      { type: "call", daysAgo: 20, by: "neel", template: "call-v1", summary: "Walked through their dispatch process. They want a fixed price.", outcome: "Proposal requested",
        intel: { why_took_call: "The post reference felt personal.", pain_points: "Dispatchers re-type every request.",
          asks: "Fixed-price proposal.", next_step: "Send proposal." } },
      e(2, "neel", "follow-v1", "PAIDI proposal for Passyunk", "Sent the pilot proposal and pricing."),
    ] },
  { name: "Manayunk Dental Labs", domain: "manayunkdental.example", industry: "Healthcare", employees: 33,
    location: "Philadelphia, PA", source: "referral", stage: "pilot",
    path: [["researched", 60], ["contacted", 55, "First email sent"], ["responded", 50, "Reply received"], ["call_held", 42], ["proposal_sent", 30]],
    owner: "raphy", createdDaysAgo: 60,
    contact: { name: "Grace Holt", title: "Director", referral: "Family friend of Raphy" },
    hook: "Lab orders arrive as handwritten forms", idea: "Order form reader",
    touches: [
      e(55, "raphy", "cold-v1", "Quick idea for Manayunk Dental Labs", "Intro email."),
      r(50, "raphy", "Re: Quick idea for Manayunk Dental Labs", "Grace asked for a call."),
      { type: "meeting", daysAgo: 42, by: "raphy", summary: "On-site visit. Agreed to a four week pilot.", outcome: "Pilot agreed" },
      { type: "meeting", daysAgo: 1, by: "raphy", summary: "Pilot check-in: 80% of forms read correctly.", outcome: "Continue pilot" },
    ] },
  { name: "Old City Tax & Audit", domain: "oldcitytax.example", industry: "Accounting", employees: 29,
    location: "Philadelphia, PA", source: "referral", stage: "client",
    path: [["researched", 90], ["contacted", 84, "First email sent"], ["responded", 80, "Reply received"], ["call_held", 72], ["proposal_sent", 60], ["pilot", 45]],
    owner: "advik", createdDaysAgo: 90,
    contact: { name: "Henry Vance", title: "Managing Partner", referral: "Advik's accounting professor" },
    hook: "Wanted engagement letters drafted faster", idea: "Engagement letter drafter",
    touches: [
      e(84, "advik", "cold-v1", "Quick idea for Old City Tax & Audit", "Intro email via professor referral."),
      r(80, "advik", "Re: Quick idea for Old City Tax & Audit", "Henry replied the same day."),
      { type: "meeting", daysAgo: 72, by: "advik", summary: "Discovery meeting with two partners.", outcome: "Proposal requested" },
      { type: "meeting", daysAgo: 0, by: "advik", summary: "Monthly check-in. Asked about a second tool for audit sampling.", outcome: "Expansion opportunity" },
    ] },
  { name: "Spruce Street Dental", domain: "sprucestreetdental.example", industry: "Healthcare", employees: 18,
    location: "Philadelphia, PA", source: "other", stage: "contacted", path: [["researched", 7]],
    owner: "advik", createdDaysAgo: 7,
    contact: { name: "Amy Lin", title: "Practice Manager" },
    hook: "Insurance verification eats the front desk's mornings", idea: "Insurance eligibility checker",
    touches: [e(2, "advik", "cold-v2", "Saw your post about insurance checks", "Intro email.")] },
  { name: "Schuylkill Staffing", domain: "schuylkillstaffing.example", industry: "Other", employees: 52,
    location: "Philadelphia, PA", source: "linkedin_post", stage: "nurture",
    path: [["researched", 45], ["contacted", 40, "First email sent"], ["followed_up", 33, "Second email sent with no reply"]],
    owner: "neel", createdDaysAgo: 45,
    contact: { name: "Marco Pell", title: "Founder" },
    hook: "Posted about resume screening backlog", idea: "Resume shortlister",
    touches: [
      e(40, "neel", "cold-v1", "Quick idea for Schuylkill Staffing", "Intro email."),
      e(33, "neel", "follow-v1", "Re: Quick idea for Schuylkill Staffing", "Bump."),
      { type: "voicemail", daysAgo: 26, by: "neel", template: "call-v1", summary: "Third touch: voicemail. No reply; moved to Nurture." },
    ] },
  { name: "Delancey Law Offices", domain: "delanceylaw.example", industry: "Legal", employees: 9,
    location: "Philadelphia, PA", source: "cold_email", stage: "nurture",
    path: [["researched", 50], ["contacted", 44, "First email sent"], ["followed_up", 37, "Second email sent with no reply"]],
    owner: "raphy", createdDaysAgo: 50,
    contact: { name: "Ruth Avery", title: "Attorney" },
    hook: "Solo-heavy firm drowning in discovery requests", idea: "Discovery request summarizer",
    touches: [
      e(44, "raphy", "cold-v1", "Quick idea for Delancey Law", "Intro email."),
      e(37, "raphy", "follow-v1", "Re: Quick idea for Delancey Law", "Bump."),
      { type: "call", daysAgo: 30, by: "raphy", template: "call-v1", summary: "Gatekeeper said to email instead. Third touch used.", outcome: "No contact" },
    ] },
  { name: "Liberty Bell Logistics", domain: "libertybelllogistics.example", industry: "Other", employees: 1400,
    location: "Philadelphia, PA", source: "news", stage: "lost", lostReason: "Too large; procurement requires a vendor security review we cannot pass yet",
    path: [["researched", 35], ["contacted", 30, "First email sent"], ["responded", 25, "Reply received"]],
    owner: "advik", createdDaysAgo: 35,
    contact: { name: "Derek Hsu", title: "IT Director" },
    hook: "Announced an automation initiative", idea: "Invoice matching",
    touches: [
      e(30, "advik", "cold-v1", "Quick idea for Liberty Bell Logistics", "Intro email."),
      r(25, "advik", "Re: Quick idea for Liberty Bell Logistics", "Derek said procurement needs SOC 2 before any pilot."),
    ] },
  { name: "Rittenhouse Realty", domain: "rittenhouserealty.example", industry: "Real estate", employees: 22,
    location: "Philadelphia, PA", source: "linkedin_post", stage: "lost", lostReason: "Chose an off-the-shelf tool",
    path: [["researched", 55], ["contacted", 50, "First email sent"], ["responded", 46, "Reply received"], ["call_held", 38]],
    owner: "neel", createdDaysAgo: 55,
    contact: { name: "Isabel Moreno", title: "Broker of Record" },
    hook: "Listing descriptions written by hand", idea: "Listing description writer",
    touches: [
      e(50, "neel", "cold-v2", "Saw your post about listings", "Intro email."),
      r(46, "neel", "Re: Saw your post about listings", "Isabel agreed to a call."),
      { type: "call", daysAgo: 38, by: "neel", template: "call-v1", summary: "Liked the demo but had already trialled a generic tool.", outcome: "Lost to competitor",
        intel: { why_took_call: "The hook about listings.", objections: "Already paying for a generic writing tool.",
          lost_interest_at: "When we said setup takes two weeks.", next_step: "None." } },
    ] },
  { name: "Northern Liberties Notary", domain: "nolibsnotary.example", industry: "Legal", employees: 6,
    location: "Philadelphia, PA", source: "other", stage: "researched", owner: "advik", createdDaysAgo: 3,
    contact: { name: "Paul Reyes", title: "Owner" },
    hook: "Appointment no-shows", idea: "Reminder and rescheduling assistant", touches: [] },
  { name: "Bala Cynwyd Benefits", domain: "balabenefits.example", industry: "Insurance", employees: 44,
    location: "Bala Cynwyd, PA", source: "accelerator", stage: "researched", owner: "neel", createdDaysAgo: 4,
    contact: { name: "Monica Feld", title: "Director of Client Services" },
    hook: "Open enrollment questions flood their inbox every November", idea: "Benefits question answerer for client HR teams", touches: [] },
  { name: "Germantown Audit Group", domain: "germantownaudit.example", industry: "Accounting", employees: 36,
    location: "Philadelphia, PA", source: "linkedin_post", stage: "contacted", path: [["researched", 9]],
    owner: "raphy", createdDaysAgo: 9,
    contact: { name: "Leon Abara", title: "Audit Partner" },
    hook: "Posted about sampling workpapers taking days", idea: "Audit sample selector and workpaper drafter",
    touches: [e(5, "raphy", "cold-v2", "Saw your post about sampling", "Intro email; due for a follow-up.")] },
  { name: "Fishtown Compliance Partners", domain: "fishtowncompliance.example", industry: "Compliance", employees: 58,
    location: "Philadelphia, PA", source: "referral", sourceDetail: "Referred by Marcus Oyelaran",
    stage: "followed_up", path: [["researched", 13], ["contacted", 9, "First email sent"]],
    owner: "advik", createdDaysAgo: 13,
    contact: { name: "Tessa Brandt", title: "Head of Technology", referral: "Marcus Oyelaran" },
    hook: "Marcus said they re-key audit evidence into three systems", idea: "Evidence collector that files to all three",
    touches: [
      e(9, "advik", "cold-v2", "Marcus Oyelaran suggested I reach out", "Referral intro."),
      { type: "linkedin", daysAgo: 4, by: "advik", summary: "Short LinkedIn note pointing back to the email." },
    ] },
];

export const TASKS = [
  { title: "Send proposal to Brightline Compliance", description: "One-pager plus rough price, as Marcus asked.", assignee: "neel" as Who, dueInDays: 2, status: "in_progress", priority: "high", company: "Brightline Compliance" },
  { title: "Book a call with Dana Whitaker", description: "She asked for times next week.", assignee: "advik" as Who, dueInDays: 0, status: "todo", priority: "high", company: "Hartwell & Associates" },
  { title: "Build sample review deck for Owen Park", description: "Use dummy data.", assignee: "advik" as Who, dueInDays: 5, status: "todo", priority: "medium", company: "Chestnut Hill Wealth" },
  { title: "Research 10 accounting firms from the PICPA directory", description: "30 to 60 people, find a hook for each.", assignee: "raphy" as Who, dueInDays: 3, status: "todo", priority: "medium", company: null },
  { title: "Answer Carla Dunn's pricing question", description: null, assignee: "raphy" as Who, dueInDays: 0, status: "todo", priority: "high", company: "Wissahickon Insurance" },
  { title: "Write cold intro v3 with a shorter opener", description: "Compare against v2 after 20 sends.", assignee: "neel" as Who, dueInDays: 7, status: "todo", priority: "low", company: null },
  { title: "Log last week's calls", description: null, assignee: "raphy" as Who, dueInDays: -3, status: "done", priority: "low", company: null },
] as const;

export const REVIEW_THREADS = [
  { subject: "Intro: you two should talk", participants: ["jordan.keel@venturelab.example"], confidence: 0.62,
    reason: "An introduction from an accelerator contact; no PAIDI mention in the headers.",
    snippet: "Advik, meet Pat. Pat runs ops at a 40 person firm and was asking about automation...", daysAgo: 1, by: "advik" as Who },
  { subject: "Re: coffee next week?", participants: ["pat.nolan@harborviewcpa.example"], confidence: 0.48,
    reason: "Sender is at an accounting firm, but the subject reads as personal.",
    snippet: "Tuesday works. Happy to hear more about what you're building.", daysAgo: 2, by: "neel" as Who },
  { subject: "Question about your workshop", participants: ["events@phillytechweek.example"], confidence: 0.41,
    reason: "Could be about a PAIDI talk or a personal event registration.",
    snippet: "Thanks for signing up. Will your session cover small business use cases?", daysAgo: 3, by: "advik" as Who },
] as const;
