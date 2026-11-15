export type Stage =
  | "researched" | "contacted" | "followed_up" | "responded"
  | "call_held" | "proposal_sent" | "pilot" | "client"
  | "nurture" | "lost";

export type Role = "admin" | "editor";
export type InteractionType =
  | "email_out" | "email_in" | "call" | "voicemail" | "gatekeeper" | "meeting" | "linkedin";
export type TemplateType = "cold_email" | "follow_up" | "call_script" | "referral_ask";
export type TaskStatus = "todo" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high";
export type CompanySource = "linkedin_post" | "accelerator" | "news" | "referral" | "cold_email" | "other";

export interface Member {
  id: string;
  email: string;
  role: Role;
  display_name: string;
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  employee_count: number | null;
  size_bucket: string | null;
  location: string | null;
  source: CompanySource | null;
  source_detail: string | null;
  fit_score: number | null;
  fit_score_suggested: number | null;
  owner_id: string | null;
  stage: Stage;
  lost_reason: string | null;
  do_not_contact: boolean;
  notes: string | null;
  stage_changed_at: string;
  last_contacted_at: string | null;
  is_sample: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  company_id: string;
  name: string;
  title: string | null;
  is_technical: boolean;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  referral_source: string | null;
  do_not_contact: boolean;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Research {
  id: string;
  company_id: string;
  contact_id: string | null;
  hook: string | null;
  hook_url: string | null;
  common_ground: string | null;
  tool_idea: string | null;
  notes: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  version: number;
  subject: string | null;
  body: string;
  active: boolean;
  is_sample: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Interaction {
  id: string;
  company_id: string;
  contact_id: string | null;
  type: InteractionType;
  occurred_at: string;
  team_member_id: string | null;
  subject: string | null;
  summary: string | null;
  template_id: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  thread_url: string | null;
  recording_url: string | null;
  outcome: string | null;
  source: "manual" | "gmail" | "import";
  created_at: string;
}

export interface CallIntel {
  interaction_id: string;
  why_took_call: string | null;
  pain_points: string | null;
  objections: string | null;
  lost_interest_at: string | null;
  asks: string | null;
  next_step: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: Priority;
  company_id: string | null;
  contact_id: string | null;
  source: "manual" | "auto";
  auto_key: string | null;
  completed_at: string | null;
  is_sample: boolean;
  created_by: string | null;
  created_at: string;
}

export interface StageChange {
  id: string;
  company_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  automatic: boolean;
  reason: string | null;
  changed_by: string | null;
  undone_at: string | null;
  created_at: string;
}

export interface GmailAccount {
  id: string;
  team_member_id: string;
  email: string;
  kind: "personal" | "workspace";
  status: "active" | "error" | "disconnected";
  last_error: string | null;
  last_synced_at: string | null;
  backfill_days: number | null;
  backfill_pending: boolean;
  connected_at: string;
}

export interface GmailThread {
  id: string;
  account_id: string;
  gmail_thread_id: string;
  status: "paidi" | "review";
  confidence: number | null;
  method: "contact" | "keyword" | "ai" | "manual" | null;
  reason: string | null;
  subject: string | null;
  participants: string[] | null;
  snippet: string | null;
  message_count: number;
  last_message_at: string | null;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Tables {
  allowed_users: Member;
  companies: Company;
  contacts: Contact;
  research: Research;
  templates: Template;
  interactions: Interaction;
  call_intel: CallIntel;
  tasks: Task;
  stage_changes: StageChange;
  gmail_accounts: GmailAccount;
  gmail_threads: GmailThread;
  settings: Setting;
}
export type TableName = keyof Tables;
