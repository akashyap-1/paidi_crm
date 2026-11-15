-- The private schema is not exposed through the API, so Edge Functions reach
-- OAuth state and encrypted tokens through these service-role-only functions.

create function public.oauth_state_create(p_state text, p_member uuid) returns void
language sql security definer set search_path = '' as $$
  insert into private.oauth_states (state, member_id) values (p_state, p_member);
$$;

-- One-time use: returns the member only if the state exists and is under 10 minutes old.
create function public.oauth_state_consume(p_state text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  delete from private.oauth_states
   where state = p_state
   returning case when created_at > now() - interval '10 minutes' then member_id end
   into v_member;
  return v_member;
end;
$$;

create function public.gmail_token_set(p_account uuid, p_token_enc text) returns void
language sql security definer set search_path = '' as $$
  insert into private.gmail_tokens (account_id, refresh_token_enc)
  values (p_account, p_token_enc)
  on conflict (account_id) do update
    set refresh_token_enc = excluded.refresh_token_enc, updated_at = now();
$$;

create function public.gmail_token_get(p_account uuid) returns text
language sql security definer set search_path = '' as $$
  select refresh_token_enc from private.gmail_tokens where account_id = p_account;
$$;

revoke execute on function
  public.oauth_state_create(text, uuid),
  public.oauth_state_consume(text),
  public.gmail_token_set(uuid, text),
  public.gmail_token_get(uuid)
  from public, anon, authenticated;
grant execute on function
  public.oauth_state_create(text, uuid),
  public.oauth_state_consume(text),
  public.gmail_token_set(uuid, text),
  public.gmail_token_get(uuid)
  to service_role;
