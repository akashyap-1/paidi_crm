-- PAIDI CRM: automation (stage advances, follow-up tasks, cron) and RPCs.

create function private.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Stage changes from the app
-- ---------------------------------------------------------------------------

-- Manual stage move with an optional reason (required for Lost).
create function public.set_company_stage(
  p_company uuid, p_stage public.pipeline_stage, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_stage = 'lost' and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required to mark a prospect Lost.' using errcode = '23514';
  end if;
  perform set_config('app.manual_reason', coalesce(p_reason, ''), true);
  update public.companies
     set stage = p_stage,
         lost_reason = case when p_stage = 'lost' then p_reason else lost_reason end
   where id = p_company;
end;
$$;

-- Undo a logged stage change, as long as the prospect is still where that
-- change left it.
create function public.undo_stage_change(p_change uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_change public.stage_changes;
  v_current public.pipeline_stage;
begin
  if not private.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_change from public.stage_changes where id = p_change;
  if v_change.id is null or v_change.from_stage is null then
    raise exception 'This change cannot be undone.';
  end if;
  if v_change.undone_at is not null then
    raise exception 'This change was already undone.';
  end if;
  select stage into v_current from public.companies where id = v_change.company_id for update;
  if v_current <> v_change.to_stage then
    raise exception 'The stage has changed since; move it by hand instead.';
  end if;
  perform set_config('app.manual_reason', 'Undo', true);
  update public.companies set stage = v_change.from_stage where id = v_change.company_id;
  update public.stage_changes
     set undone_at = now(), undone_by = private.member_id()
   where id = p_change;
end;
$$;

-- ---------------------------------------------------------------------------
-- Email-driven stage advance. Called by the Gmail sync function after it logs
-- a message. Never moves a stage backward and never touches Lost.
-- ---------------------------------------------------------------------------

create function public.apply_email_automation(p_company uuid, p_trigger text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_stage public.pipeline_stage;
  v_out int;
  v_in int;
  v_target public.pipeline_stage;
  v_reason text;
begin
  select stage into v_stage from public.companies where id = p_company for update;
  if v_stage is null or v_stage = 'lost' then return; end if;

  select count(*) filter (where type = 'email_out'), count(*) filter (where type = 'email_in')
    into v_out, v_in
    from public.interactions where company_id = p_company;

  if p_trigger = 'email_in' then
    v_target := 'responded';
    v_reason := 'Reply received';
    update public.tasks set status = 'done'
     where company_id = p_company and source = 'auto' and status <> 'done'
       and auto_key like 'followup:%';
  elsif v_in > 0 then
    return;
  elsif v_out >= 2 then
    v_target := 'followed_up';
    v_reason := 'Second email sent with no reply';
  elsif v_out >= 1 then
    v_target := 'contacted';
    v_reason := 'First email sent';
  else
    return;
  end if;

  if v_stage = 'nurture' then
    if v_target <> 'responded' then return; end if;
  elsif public.stage_rank(v_target) <= public.stage_rank(v_stage) then
    return;
  end if;

  perform set_config('app.auto_reason', v_reason, true);
  update public.companies set stage = v_target where id = p_company;
  perform set_config('app.auto_reason', '', true);
end;
$$;

revoke execute on function public.apply_email_automation(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_email_automation(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Follow-up cadence. Runs hourly from pg_cron.
--   No reply N days after the last touch -> one follow-up task for whoever
--   made that touch. After the last allowed touch goes unanswered -> Nurture.
-- ---------------------------------------------------------------------------

create function private.run_followups() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_days int := private.setting_int('followup_days', 3);
  v_max int := private.setting_int('max_touches', 3);
  v_count int := 0;
  r record;
begin
  for r in
    select c.id, c.name, c.owner_id, t.touches, t.last_member,
           (select ct.name from public.contacts ct
             where ct.company_id = c.id and not ct.do_not_contact
             order by ct.created_at limit 1) as contact_name,
           (select ct.id from public.contacts ct
             where ct.company_id = c.id and not ct.do_not_contact
             order by ct.created_at limit 1) as contact_id
      from public.companies c
      join lateral (
        select count(*) as touches,
               max(i.occurred_at) as last_touch_at,
               (array_agg(i.team_member_id order by i.occurred_at desc))[1] as last_member
          from public.interactions i
         where i.company_id = c.id
           and i.type in ('email_out', 'call', 'voicemail', 'gatekeeper', 'linkedin')
      ) t on true
     where c.stage in ('contacted', 'followed_up')
       and not c.do_not_contact
       and t.touches > 0
       and t.last_touch_at < now() - make_interval(days => v_days)
       and not exists (
         select 1 from public.interactions i
          where i.company_id = c.id and i.type in ('email_in', 'meeting'))
  loop
    if r.touches >= v_max then
      perform set_config('app.auto_reason',
        format('No reply after %s touches', r.touches), true);
      update public.companies set stage = 'nurture' where id = r.id;
      perform set_config('app.auto_reason', '', true);
      update public.tasks set status = 'done'
       where company_id = r.id and source = 'auto' and status <> 'done'
         and auto_key like 'followup:%';
      v_count := v_count + 1;
    else
      insert into public.tasks (
        title, description, assignee_id, due_date, priority,
        company_id, contact_id, source, auto_key)
      values (
        format('Follow up with %s (call or email, not both)', coalesce(r.contact_name, r.name)),
        format('Touch %s of %s for %s. No reply in %s days.', r.touches + 1, v_max, r.name, v_days),
        coalesce(r.last_member, r.owner_id,
          (select id from public.allowed_users where role = 'admin' order by created_at limit 1)),
        current_date, 'medium', r.id, r.contact_id, 'auto',
        format('followup:%s:%s', r.id, r.touches))
      on conflict (auto_key) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create function public.disconnect_gmail(p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  delete from private.gmail_tokens where account_id = p_account;
  update public.gmail_accounts
     set status = 'disconnected', backfill_pending = false, backfill_page_token = null
   where id = p_account;
end;
$$;

-- Rejecting a review-queue thread wipes everything but its id.
create function public.reject_gmail_thread(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.gmail_threads
     set status = 'rejected', subject = null, snippet = null, participants = null,
         reason = null, reviewed_by = private.member_id(), reviewed_at = now()
   where id = p_thread and status = 'review';
end;
$$;

create function public.remove_sample_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  delete from public.tasks where is_sample;
  delete from public.companies where is_sample;
  delete from public.templates where is_sample;
end;
$$;

revoke execute on function
  public.set_company_stage(uuid, public.pipeline_stage, text),
  public.undo_stage_change(uuid),
  public.disconnect_gmail(uuid),
  public.reject_gmail_thread(uuid),
  public.remove_sample_data()
  from public, anon;
grant execute on function
  public.set_company_stage(uuid, public.pipeline_stage, text),
  public.undo_stage_change(uuid),
  public.disconnect_gmail(uuid),
  public.reject_gmail_thread(uuid),
  public.remove_sample_data()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling. The Edge Function URL and shared secret come from Vault, so
-- nothing secret lives in this repository. See README, "Cron secrets".
-- ---------------------------------------------------------------------------

create function private.invoke_edge(p_function text, p_body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'Vault secrets project_url / cron_secret are not set; skipping %', p_function;
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_function,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;

select cron.schedule('paidi-gmail-sync', '*/15 * * * *',
  $$ select private.invoke_edge('gmail-sync', '{"action":"sync"}'::jsonb) $$);

select cron.schedule('paidi-followups', '10 * * * *',
  $$ select private.run_followups() $$);

select cron.schedule('paidi-oauth-state-cleanup', '0 * * * *',
  $$ delete from private.oauth_states where created_at < now() - interval '15 minutes' $$);
