-- Broadcast changes on every table the app reads, so all open browsers stay
-- in sync. Realtime applies each table's RLS policies, so only team members
-- receive events (and gmail_threads only for rows they can already see).
alter publication supabase_realtime add table
  public.companies,
  public.contacts,
  public.research,
  public.templates,
  public.interactions,
  public.call_intel,
  public.stage_changes,
  public.settings,
  public.allowed_users,
  public.gmail_accounts,
  public.gmail_threads;
