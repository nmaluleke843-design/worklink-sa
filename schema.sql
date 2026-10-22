-- WorkLink SA database schema for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

-- ============ Tables ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('worker','customer')),
  name text not null,
  city text,
  skills text[] not null default '{}',
  rate numeric not null default 0,
  verified boolean not null default false,      -- only an administrator can change this
  premium text not null default 'none',         -- only an administrator can change this
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  city text not null,
  budget numeric not null check (budget > 0),
  description text not null,
  status text not null default 'Open' check (status in ('Open','Assigned','Completed')),
  featured boolean not null default false,      -- only an administrator can change this
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  price numeric not null check (price > 0),
  message text not null,
  picked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('worker','business','featured')),
  status text not null default 'pending payment confirmation',
  created_at timestamptz not null default now()
);

-- ============ Create a profile automatically when someone signs up ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, city, skills, rate)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'worker' then 'worker' else 'customer' end,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), 'New user'),
    new.raw_user_meta_data->>'city',
    coalesce(array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills','[]'::jsonb))), '{}'),
    coalesce(nullif(new.raw_user_meta_data->>'rate','')::numeric, 0)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Row Level Security ============
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.reports enable row level security;
alter table public.contact_messages enable row level security;
alter table public.subscriptions enable row level security;

-- Profiles: anyone can read (no email or ID documents are stored here); users edit only themselves
create policy "profiles readable" on public.profiles for select using (true);
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Jobs: anyone can read; only customers post; only the owner updates
create policy "jobs readable" on public.jobs for select using (true);
create policy "customers post jobs" on public.jobs for insert to authenticated
  with check (owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer'));
create policy "owner updates job" on public.jobs for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Applications: workers apply; workers see their own; job owners see and select applicants
create policy "workers apply" on public.applications for insert to authenticated
  with check (worker_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'worker')
    and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'Open'));
create policy "see relevant applications" on public.applications for select to authenticated
  using (worker_id = auth.uid()
    or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));
create policy "owner selects applicant" on public.applications for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));

-- Reports, contact messages, subscriptions: write-only for users (administrators read them in the dashboard)
create policy "send report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "send contact message" on public.contact_messages for insert to anon, authenticated with check (true);
create policy "request subscription" on public.subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "see own subscriptions" on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- ============ Column permissions: stop users granting themselves verification, premium or featured ============
revoke insert, update, delete on public.profiles, public.jobs, public.applications,
  public.reports, public.contact_messages, public.subscriptions from anon, authenticated;

grant update (name, city, skills, rate) on public.profiles to authenticated;
grant insert (owner_id, title, category, city, budget, description) on public.jobs to authenticated;
grant update (status) on public.jobs to authenticated;
grant insert (job_id, worker_id, price, message) on public.applications to authenticated;
grant update (picked) on public.applications to authenticated;
grant insert (job_id, reporter_id, reason) on public.reports to authenticated;
grant insert (name, email, message) on public.contact_messages to anon, authenticated;
grant insert (user_id, plan) on public.subscriptions to authenticated;
