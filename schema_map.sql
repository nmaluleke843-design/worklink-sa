-- Run ONCE in Supabase > SQL Editor. Adds an approximate job location for the map.

alter table public.jobs
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.jobs drop constraint if exists jobs_geo_check;
alter table public.jobs add constraint jobs_geo_check
  check ((lat is null and lng is null)
      or (lat between -35.5 and -21.5 and lng between 16 and 33.5));   -- South Africa only

grant insert (lat, lng) on public.jobs to authenticated;
