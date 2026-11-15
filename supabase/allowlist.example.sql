-- Copy to allowlist.local.sql (git-ignored), fill in the real addresses, then run:
--   npx supabase db query --remote -f supabase/allowlist.local.sql --yes
-- Emails must be lowercase. Roles: admin or editor.
insert into public.allowed_users (email, role, display_name) values
  ('first.admin@example.com', 'admin', 'Advik'),
  ('second.admin@example.com', 'admin', 'Neel'),
  ('editor@example.com', 'editor', 'Raphy')
on conflict (email) do update set role = excluded.role, display_name = excluded.display_name;
