-- Broadcast task changes so every open browser updates the to-do list live.
-- Realtime applies the same RLS policies as normal reads, so only team
-- members receive these events.
alter publication supabase_realtime add table public.tasks;
