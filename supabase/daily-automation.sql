-- Daily content automation: one generated post per channel per Korea-local day.
alter table public.studio_posts
 add column if not exists generation_day date,
 add column if not exists auto_generated boolean not null default false;
create unique index if not exists studio_daily_unique
  on public.studio_posts(channel, generation_day)
  where generation_day is not null and auto_generated;
create index if not exists studio_daily_owner
  on public.studio_posts(owner_id,auto_generated,generation_day desc);
