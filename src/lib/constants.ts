import type {
  CompanySource, InteractionType, Priority, Stage, TaskStatus, TemplateType,
} from "./types";

/** The eight funnel stages in order. Nurture and Lost are side states. */
export const FUNNEL_STAGES: Stage[] = [
  "researched", "contacted", "followed_up", "responded",
  "call_held", "proposal_sent", "pilot", "client",
];
export const SIDE_STAGES: Stage[] = ["nurture", "lost"];
export const ALL_STAGES: Stage[] = [...FUNNEL_STAGES, ...SIDE_STAGES];

export const STAGE_LABEL: Record<Stage, string> = {
  researched: "Researched",
  contacted: "Contacted",
  followed_up: "Followed up",
  responded: "Responded",
  call_held: "Call held",
  proposal_sent: "Proposal sent",
  pilot: "Pilot",
  client: "Client",
  nurture: "Nurture",
  lost: "Lost",
};

export function stageRank(stage: Stage): number {
  return FUNNEL_STAGES.indexOf(stage) + 1; // 0 for side states
}

/** CSS class giving a stage its depth blue (see index.css). */
export function stageClass(stage: Stage): string {
  const rank = stageRank(stage);
  return rank ? `depth-${rank}` : `depth-${stage}`;
}

export const INTERACTION_LABEL: Record<InteractionType, string> = {
  email_out: "Email sent",
  email_in: "Email received",
  call: "Call",
  voicemail: "Voicemail",
  gatekeeper: "Gatekeeper",
  meeting: "Meeting",
  linkedin: "LinkedIn message",
};

/** Touches that count toward the 3-touch cadence. */
export const OUTBOUND_TOUCHES: InteractionType[] = [
  "email_out", "call", "voicemail", "gatekeeper", "linkedin",
];
export const REPLY_TYPES: InteractionType[] = ["email_in", "meeting"];
export const MAX_TOUCHES = 3;
export const FOLLOWUP_DAYS = 3;

export const TEMPLATE_TYPE_LABEL: Record<TemplateType, string> = {
  cold_email: "Cold email",
  follow_up: "Follow-up",
  call_script: "Call script",
  referral_ask: "Referral ask",
};

export const SOURCE_LABEL: Record<CompanySource, string> = {
  linkedin_post: "LinkedIn post",
  accelerator: "Accelerator",
  news: "News",
  referral: "Referral",
  cold_email: "Cold email",
  other: "Other",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const SIZE_BUCKETS = ["1-10", "11-30", "30-60", "61-200", "200+"];

export const INDUSTRIES = [
  "Accounting", "Legal", "Compliance", "Payroll", "Insurance", "Real estate",
  "Healthcare", "Architecture", "Finance", "Other",
];
