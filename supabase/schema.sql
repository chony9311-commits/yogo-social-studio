-- YOGO Social Studio dedicated Supabase project setup.
-- Do NOT execute this on your production YOGO project.
create extension if not exists pgcrypto;

create table if not exists public.studio_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('fashion','yogo')),
  title text not null,
  hook text not null default '',
  caption text not null default '',
  slides jsonb not null default '[]'::jsonb,
  image_urls jsonb not null default '[]'::jsonb,
  source_links jsonb not null default '[]'::jsonb,
  landing_url text,
  disclosure_required boolean not null default false,
  verified boolean not null default false,
  review_notes text not null default '',
  status text not null default 'draft' check (status in ('draft','approved','scheduled','publishing','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  published_media_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_posts_six_slides check (jsonb_typeof(slides) = 'array'),
  constraint studio_posts_image_urls_array check (jsonb_typeof(image_urls) = 'array')
);
create index if not exists studio_posts_due on public.studio_posts(status,scheduled_at);
create index if not exists studio_posts_owner on public.studio_posts(owner_id,created_at desc);
alter table public.studio_posts enable row level security;

drop policy if exists studio_posts_owner_select on public.studio_posts;
drop policy if exists studio_posts_owner_insert on public.studio_posts;
drop policy if exists studio_posts_owner_update on public.studio_posts;
drop policy if exists studio_posts_owner_delete on public.studio_posts;

create policy studio_posts_owner_select on public.studio_posts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy studio_posts_owner_insert on public.studio_posts
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy studio_posts_owner_update on public.studio_posts
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy studio_posts_owner_delete on public.studio_posts
  for delete to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.studio_publish_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.studio_posts(id) on delete cascade,
  result text not null check (result in ('claimed','published','failed','uncertain')),
  detail text not null default '',
  meta_media_id text,
  created_at timestamptz not null default now()
);
create index if not exists studio_log_post on public.studio_publish_log(post_id,created_at desc);
alter table public.studio_publish_log enable row level security;
drop policy if exists studio_publish_log_owner_read on public.studio_publish_log;
create policy studio_publish_log_owner_read on public.studio_publish_log
  for select to authenticated
  using (exists (
    select 1 from public.studio_posts p
    where p.id=post_id and p.owner_id=(select auth.uid())
  ));

-- Only owner can write media through server; public read is required by Meta's image fetching.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('studio-media','studio-media',true,5242880,array['image/jpeg'])
on conflict (id) do update set public=true,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg'];

drop policy if exists studio_media_owner_upload on storage.objects;
drop policy if exists studio_media_owner_update on storage.objects;
drop policy if exists studio_media_owner_delete on storage.objects;

create policy studio_media_owner_upload on storage.objects for insert to authenticated
with check (bucket_id='studio-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy studio_media_owner_update on storage.objects for update to authenticated
using (bucket_id='studio-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='studio-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy studio_media_owner_delete on storage.objects for delete to authenticated
using (bucket_id='studio-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Public bucket's ordinary object-get endpoint is readable. No anonymous INSERT/UPDATE/DELETE grants.
