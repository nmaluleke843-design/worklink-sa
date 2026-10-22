-- Run this ONCE in Supabase > SQL Editor, after schema.sql. It adds Google sign-in support.

-- Existing users count as onboarded; new Google users must pick worker/customer first.
alter table public.profiles add column if not exists onboarded boolean not null default true;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, city, skills, rate, onboarded)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'worker' then 'worker' else 'customer' end,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), nullif(new.raw_user_meta_data->>'full_name',''), 'New user'),
    new.raw_user_meta_data->>'city',
    coalesce(array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills','[]'::jsonb))), '{}'),
    coalesce(nullif(new.raw_user_meta_data->>'rate','')::numeric, 0),
    coalesce(new.raw_app_meta_data->>'provider', 'email') = 'email'
  );
  return new;
end $$;

-- Lets a new Google user choose their role exactly once.
create or replace function public.complete_onboarding(p_role text, p_city text, p_skills text[], p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('worker','customer') then raise exception 'Invalid role'; end if;
  update public.profiles
     set role = p_role, city = p_city,
         skills = case when p_role = 'worker' then coalesce(p_skills, '{}') else '{}' end,
         rate = case when p_role = 'worker' then coalesce(p_rate, 0) else 0 end,
         onboarded = true
   where id = auth.uid() and onboarded = false;
end $$;

revoke execute on function public.complete_onboarding(text, text, text[], numeric) from public, anon;
grant execute on function public.complete_onboarding(text, text, text[], numeric) to authenticated;
