-- PAIDI CRM: core schema, allowlist auth, row level security.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Allowlist and roles
-- ---------------------------------------------------------------------------

create table public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('admin', 'editor')),
  display_name text not null,
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The allowlist rows themselves are not in this repository (it is public, and
-- the login screen is designed not to reveal who has access). They are loaded
-- from supabase/allowlist.local.sql, which is git-ignored. See README.

create function private.jwt_email() returns text
language sql stable set search_path = '' as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;

create function private.member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.allowed_users where email = private.jwt_email();
$$;

create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.allowed_users where email = private.jwt_email());
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_users
    where email = private.jwt_email() and role = 'admin'
  );
$$;

-- Supabase Auth "before user created" hook: rejects any email off the allowlist.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is null
     or not exists (select 1 from public.allowed_users where email = v_email) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'Sign-ups are not allowed.')
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.allowed_users to supabase_auth_admin;

-- Second line of defence if the hook is ever switched off: a trigger on auth.users.
create function private.enforce_allowlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null
     or not exists (select 1 from public.allowed_users where email = lower(new.email)) then
    raise exception 'Sign-ups are not allowed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_allowlist
  before insert or update of email on auth.users
  for each row execute function private.enforce_allowlist();

create function private.link_allowed_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.allowed_users set user_id = new.id where email = lower(new.email);
  return new;
end;
$$;

create trigger link_allowed_user
  after insert or update of email on auth.users
  for each row execute function private.link_allowed_user();

-- ---------------------------------------------------------------------------
-- Pipeline
-- ---------------------------------------------------------------------------

create type public.pipeline_stage as enum (
  'researched', 'contacted', 'followed_up', 'responded',
  'call_held', 'proposal_sent', 'pilot', 'client',
  'nurture', 'lost'
);

create function public.stage_rank(s public.pipeline_stage) returns int
language sql immutable set search_path = '' as $$
  select case s
    when 'researched' then 1 when 'contacted' then 2 when 'followed_up' then 3
    when 'responded' then 4 when 'call_held' then 5 when 'proposal_sent' then 6
    when 'pilot' then 7 when 'client' then 8 else 0 end;
$$;

-- 30 to 60 person firms in accounting, legal and compliance-heavy work score
-- highest; finance and very large companies score lower.
create function public.suggest_fit_score(p_industry text, p_employees int) returns int
language sql immutable set search_path = '' as $$
  select greatest(1, least(5,
    3
    + case
        when p_industry ~* '(account|bookkeep|tax|audit|legal|law|compliance|payroll|title|insurance)' then 1
        when p_industry ~* '(financ|bank|invest|private equity|hedge|capital)' then -1
        else 0 end
    + case
        when p_employees is null then 0
        when p_employees between 30 and 60 then 1
        when p_employees between 11 and 200 then 0
        when p_employees > 1000 then -2
        else -1 end
  ));
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  website text,
  domain text,
  linkedin_url text,
  industry text,
  employee_count int check (employee_count is null or employee_count > 0),
  size_bucket text generated always as (
    case
      when employee_count is null then null
      when employee_count <= 10 then '1-10'
      when employee_count <= 30 then '11-30'
      when employee_count <= 60 then '30-60'
      when employee_count <= 200 then '61-200'
      else '200+' end
  ) stored,
  location text,
  source text check (source in ('linkedin_post', 'accelerator', 'news', 'referral', 'cold_email', 'other')),
  source_detail text,
  fit_score int check (fit_score between 1 and 5),
  fit_score_suggested int,
  owner_id uuid references public.allowed_users (id) on delete set null,
  stage public.pipeline_stage not null default 'researched',
  lost_reason text,
  do_not_contact boolean not null default false,
  notes text,
  stage_changed_at timestamptz not null default now(),
  last_contacted_at timestamptz,
  is_sample boolean not null default false,
  created_by uuid references public.allowed_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_needs_reason check (stage <> 'lost' or length(trim(coalesce(lost_reason, ''))) > 0)
);
create unique index companies_domain_key on public.companies (lower(domain)) where domain is not null;
create index companies_stage_idx on public.companies (stage);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  title text,
  is_technical boolean generated always as (
    coalesce(title, '') ~* '(\mcto\M|\mcio\M|chief technology|chief information|engineer|developer|technical|technology|software|\mit\M|devops|\mdata\M)'
  ) stored,
  email text check (email is null or email = lower(email)),
  phone text,
  linkedin_url text,
  referral_source text,
  do_not_contact boolean not null default false,
  owner_id uuid references public.allowed_users (id) on delete set null,
  notes text,
  created_by uuid references public.allowed_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_email_key on public.contacts (email) where email is not null;
create index contacts_company_idx on public.contacts (company_id);

create table public.research (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  hook text,
  hook_url text,
  common_ground text,
  tool_idea text,
  notes text,
  created_by uuid references public.allowed_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_company_idx on public.research (company_id);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('cold_email', 'follow_up', 'call_script', 'referral_ask')),
  version int not null default 1 check (version > 0),
  subject text,
  body text not null,
  active boolean not null default true,
  is_sample boolean not null default false,
  created_by uuid references public.allowed_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  type text not null check (type in (
    'email_out', 'email_in', 'call', 'voicemail', 'gatekeeper', 'meeting', 'linkedin'
  )),
  occurred_at timestamptz not null default now(),
  team_member_id uuid references public.allowed_users (id) on delete set null,
  subject text,
  summary text,
  template_id uuid references public.templates (id) on delete set null,
  gmail_thread_id text,
  gmail_message_id text unique,
  thread_url text,
  recording_url text,
  outcome text,
  source text not null default 'manual' check (source in ('manual', 'gmail', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interactions_company_idx on public.interactions (company_id, occurred_at desc);
create index interactions_contact_idx on public.interactions (contact_id);
create index interactions_template_idx on public.interactions (template_id);

create table public.call_intel (
  interaction_id uuid primary key references public.interactions (id) on delete cascade,
  why_took_call text,
  pain_points text,
  objections text,
  lost_interest_at text,
  asks text,
  next_step text,
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  assignee_id uuid references public.allowed_users (id) on delete set null,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  company_id uuid references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  auto_key text unique,
  completed_at timestamptz,
  is_sample boolean not null default false,
  created_by uuid references public.allowed_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assignee_id, status);

create table public.stage_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_stage public.pipeline_stage,
  to_stage public.pipeline_stage not null,
  automatic boolean not null default false,
  reason text,
  changed_by uuid references public.allowed_users (id) on delete set null,
  undone_at timestamptz,
  undone_by uuid references public.allowed_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stage_changes_company_idx on public.stage_changes (company_id, created_at desc);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('followup_days', '3'),
  ('max_touches', '3'),
  ('classify_auto_threshold', '0.8'),
  ('classify_review_threshold', '0.4'),
  ('backfill_days', '90'),
  ('paidi_keywords', '["paidi", "philadelphia ai development initiative"]');

-- ---------------------------------------------------------------------------
-- Gmail (read-only sync). Tokens live in the private schema, which the API
-- does not expose; only Edge Functions using the service role can reach them.
-- ---------------------------------------------------------------------------

create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.allowed_users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  kind text not null default 'personal' check (kind in ('personal', 'workspace')),
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_error text,
  last_synced_at timestamptz,
  sync_after timestamptz,
  backfill_days int,
  backfill_page_token text,
  backfill_pending boolean not null default false,
  connected_at timestamptz not null default now()
);

create table private.gmail_tokens (
  account_id uuid primary key references public.gmail_accounts (id) on delete cascade,
  refresh_token_enc text not null,
  updated_at timestamptz not null default now()
);

create table private.oauth_states (
  state text primary key,
  member_id uuid not null references public.allowed_users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.gmail_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.gmail_accounts (id) on delete cascade,
  gmail_thread_id text not null,
  status text not null check (status in ('paidi', 'review', 'ignored', 'rejected')),
  confidence numeric(3, 2),
  method text check (method in ('contact', 'keyword', 'ai', 'manual')),
  reason text,
  subject text,
  participants text[],
  snippet text,
  message_count int not null default 0,
  last_message_at timestamptz,
  reviewed_by uuid references public.allowed_users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, gmail_thread_id),
  -- Non-PAIDI mail is remembered by id only, so it is never re-read; no content is kept.
  constraint no_content_for_non_paidi check (
    status in ('paidi', 'review')
    or (subject is null and snippet is null and participants is null and reason is null)
  )
);
create index gmail_threads_status_idx on public.gmail_threads (status);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'research', 'templates', 'interactions',
    'call_intel', 'tasks', 'settings', 'gmail_threads'
  ] loop
    execute format(
      'create trigger touch_updated_at before update on public.%I
         for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

create function private.company_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.fit_score_suggested := public.suggest_fit_score(new.industry, new.employee_count);
  if new.fit_score is null then
    new.fit_score := new.fit_score_suggested;
  end if;
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := private.member_id(); end if;
    if new.owner_id is null then new.owner_id := private.member_id(); end if;
    if new.domain is null and new.website is not null then
      new.domain := lower(regexp_replace(
        regexp_replace(new.website, '^https?://(www\.)?', '', 'i'), '[/?#].*$', ''));
    end if;
  elsif new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger company_defaults
  before insert or update on public.companies
  for each row execute function private.company_defaults();

-- Every stage change is logged. Automation marks itself by setting the
-- transaction-local setting app.auto_reason before it updates the stage.
create function private.log_stage_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(current_setting('app.auto_reason', true), '');
  v_manual_reason text := nullif(current_setting('app.manual_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.stage_changes (company_id, from_stage, to_stage, automatic, reason, changed_by)
    values (new.id, null, new.stage, v_reason is not null, coalesce(v_reason, 'Created'), private.member_id());
  elsif new.stage is distinct from old.stage then
    insert into public.stage_changes (company_id, from_stage, to_stage, automatic, reason, changed_by)
    values (new.id, old.stage, new.stage, v_reason is not null, coalesce(v_reason, v_manual_reason), private.member_id());
  end if;
  return null;
end;
$$;

create trigger log_stage_change
  after insert or update of stage on public.companies
  for each row execute function private.log_stage_change();

create function private.stamp_created_by() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is null then new.created_by := private.member_id(); end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['contacts', 'research', 'templates', 'tasks'] loop
    execute format(
      'create trigger stamp_created_by before insert on public.%I
         for each row execute function private.stamp_created_by()', t);
  end loop;
end $$;

create function private.interaction_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_member_id is null then new.team_member_id := private.member_id(); end if;
  return new;
end;
$$;

create trigger interaction_defaults
  before insert on public.interactions
  for each row execute function private.interaction_defaults();

create function private.bump_last_contacted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.companies
     set last_contacted_at = greatest(coalesce(last_contacted_at, new.occurred_at), new.occurred_at)
   where id = new.company_id;
  return null;
end;
$$;

create trigger bump_last_contacted
  after insert or update of occurred_at on public.interactions
  for each row execute function private.bump_last_contacted();

create function private.task_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger task_completion
  before insert or update of status on public.tasks
  for each row execute function private.task_completion();

-- ---------------------------------------------------------------------------
-- Row level security: members read and write, only admins delete or change
-- settings. Everything keys off the allowlist, not just a valid login.
-- ---------------------------------------------------------------------------

grant usage on schema private to authenticated, service_role;
grant execute on function private.jwt_email(), private.member_id(), private.is_member(), private.is_admin()
  to authenticated, service_role;
grant all on all tables in schema private to service_role;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'research', 'templates', 'interactions', 'call_intel', 'tasks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy members_select on public.%I for select to authenticated
      using ((select private.is_member()))', t);
    execute format('create policy members_insert on public.%I for insert to authenticated
      with check ((select private.is_member()))', t);
    execute format('create policy members_update on public.%I for update to authenticated
      using ((select private.is_member())) with check ((select private.is_member()))', t);
    execute format('create policy admins_delete on public.%I for delete to authenticated
      using ((select private.is_admin()))', t);
  end loop;
end $$;

alter table public.allowed_users enable row level security;
create policy members_select on public.allowed_users for select to authenticated
  using ((select private.is_member()));

alter table public.stage_changes enable row level security;
create policy members_select on public.stage_changes for select to authenticated
  using ((select private.is_member()));

alter table public.settings enable row level security;
create policy members_select on public.settings for select to authenticated
  using ((select private.is_member()));
create policy admins_update on public.settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.gmail_accounts enable row level security;
create policy members_select on public.gmail_accounts for select to authenticated
  using ((select private.is_member()));

alter table public.gmail_threads enable row level security;
create policy members_select on public.gmail_threads for select to authenticated
  using ((select private.is_member()) and status in ('paidi', 'review'));

alter table private.gmail_tokens enable row level security;
alter table private.oauth_states enable row level security;
