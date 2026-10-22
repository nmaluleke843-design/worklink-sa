-- Run ONCE in Supabase > SQL Editor, after schema.sql and schema_google.sql. Adds the admin area.

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admins can read everything users only write
create policy "admin reads reports" on public.reports for select to authenticated using (public.is_admin());
create policy "admin reads messages" on public.contact_messages for select to authenticated using (public.is_admin());
create policy "admin reads subscriptions" on public.subscriptions for select to authenticated using (public.is_admin());

-- Admin actions (each one checks the caller is an admin)
create or replace function public.admin_set_verified(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles set verified = p_value where id = p_user;
end $$;

create or replace function public.admin_set_premium(p_user uuid, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_value not in ('none','active') then raise exception 'Invalid value'; end if;
  update public.profiles set premium = p_value where id = p_user;
end $$;

create or replace function public.admin_feature_job(p_job uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.jobs set featured = p_value where id = p_job;
end $$;

create or replace function public.admin_delete_job(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from public.jobs where id = p_job;
end $$;

-- Confirm or reject a subscription request. Worker/business plans switch Premium on or off.
create or replace function public.admin_set_subscription(p_sub uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('active','rejected','expired') then raise exception 'Invalid status'; end if;
  update public.subscriptions set status = p_status where id = p_sub returning * into s;
  if s.plan in ('worker','business') then
    update public.profiles set premium =
      case when exists (select 1 from public.subscriptions
                         where user_id = s.user_id and plan in ('worker','business') and status = 'active')
           then 'active' else 'none' end
    where id = s.user_id;
  end if;
end $$;

revoke execute on function public.admin_set_verified(uuid, boolean), public.admin_set_premium(uuid, text),
  public.admin_feature_job(uuid, boolean), public.admin_delete_job(uuid),
  public.admin_set_subscription(uuid, text) from public, anon;
grant execute on function public.admin_set_verified(uuid, boolean), public.admin_set_premium(uuid, text),
  public.admin_feature_job(uuid, boolean), public.admin_delete_job(uuid),
  public.admin_set_subscription(uuid, text) to authenticated;

-- ===== Make yourself the admin: replace the email with the one you sign in with, then run this line =====
-- (Sign up or log in on the site first so your profile exists.)
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
