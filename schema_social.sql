-- Run ONCE in Supabase > SQL Editor, after the other schema files.
-- Adds: private job addresses, messaging between customer and worker, and ratings/reviews.

-- ===== 1. Private exact address: only the job owner and the SELECTED worker can read it =====
create table if not exists public.job_private (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  address text not null check (char_length(address) <= 300)
);
alter table public.job_private enable row level security;

create policy "owner or selected worker reads address" on public.job_private for select to authenticated
  using (
    exists (select 1 from public.jobs j where j.id = job_private.job_id and j.owner_id = auth.uid())
    or exists (select 1 from public.applications a
               where a.job_id = job_private.job_id and a.worker_id = auth.uid() and a.picked)
  );
create policy "owner adds address" on public.job_private for insert to authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_private.job_id and j.owner_id = auth.uid()));
create policy "owner edits address" on public.job_private for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_private.job_id and j.owner_id = auth.uid()))
  with check (exists (select 1 from public.jobs j where j.id = job_private.job_id and j.owner_id = auth.uid()));

revoke all on public.job_private from anon, authenticated;
grant select on public.job_private to authenticated;
grant insert (job_id, address) on public.job_private to authenticated;
grant update (address) on public.job_private to authenticated;

-- ===== 2. Messages: one conversation per job + applicant, between the job owner and that worker =====
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (job_id, worker_id, created_at);
alter table public.messages enable row level security;

create policy "participants and admins read messages" on public.messages for select to authenticated
  using (
    worker_id = auth.uid()
    or exists (select 1 from public.jobs j where j.id = messages.job_id and j.owner_id = auth.uid())
    or public.is_admin()
  );
create policy "participants send messages" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.fee_paid()
    and exists (select 1 from public.applications a where a.job_id = messages.job_id and a.worker_id = messages.worker_id)
    and (worker_id = auth.uid()
         or exists (select 1 from public.jobs j where j.id = messages.job_id and j.owner_id = auth.uid()))
  );

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (job_id, worker_id, sender_id, body) on public.messages to authenticated;

-- Reports can now point at a specific message
alter table public.reports add column if not exists message_id uuid references public.messages(id) on delete set null;
grant insert (message_id) on public.reports to authenticated;

-- ===== 3. Reviews: after a job is Completed, the owner and the selected worker can review each other =====
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (job_id, reviewer_id)
);
alter table public.reviews enable row level security;

create or replace function public.can_review(p_job uuid, p_reviewee uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.jobs j
    join public.applications a on a.job_id = j.id and a.picked
    where j.id = p_job and j.status = 'Completed'
      and ((j.owner_id = auth.uid() and a.worker_id = p_reviewee)
        or (a.worker_id = auth.uid() and j.owner_id = p_reviewee))
  );
$$;
revoke execute on function public.can_review(uuid, uuid) from public, anon;
grant execute on function public.can_review(uuid, uuid) to authenticated;

create policy "reviews are public" on public.reviews for select to anon, authenticated using (true);
create policy "participants review" on public.reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and public.can_review(job_id, reviewee_id));

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (job_id, reviewer_id, reviewee_id, rating, comment) on public.reviews to authenticated;

-- Average rating per person
create or replace view public.profile_ratings as
  select reviewee_id as user_id, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as review_count
  from public.reviews group by reviewee_id;
grant select on public.profile_ratings to anon, authenticated;
