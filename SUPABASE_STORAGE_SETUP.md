# Supabase Storage + Metadata Setup

This app uploads screen recordings to Supabase Storage and saves metadata in Postgres. Follow these steps to enable it end‑to‑end.

## 1) Create Storage bucket

- Name: `recordings`
- Public: `True` (globally accessible). We'll use public URLs.

If using SQL (SQL Editor):

```sql
-- Create public bucket
insert into storage.buckets (id, name, public) values ('recordings', 'recordings', true)
on conflict do nothing;
```

## 2) Create metadata table

```sql
-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  tool text not null,
  storage_path text not null,
  filename text not null,
  size bigint not null,
  created_by uuid null,
  created_at timestamp with time zone not null default now()
);

-- Helpful index
create index if not exists recordings_project_created_at on public.recordings(project_id, created_at desc);
```

## 3) Enable RLS and policies

```sql
alter table public.recordings enable row level security;

-- Example membership table (replace with your actual project membership model)
-- create table public.project_members (project_id text, user_id uuid);

-- Drop then (re)create policies to avoid IF NOT EXISTS (not supported for CREATE POLICY)
drop policy if exists "recordings.read.project" on public.recordings;
drop policy if exists "recordings.insert.project" on public.recordings;

-- Policy: users can read their project's recordings
create policy "recordings.read.project"
  on public.recordings for select
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = recordings.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Policy: users can insert metadata for their project
create policy "recordings.insert.project"
  on public.recordings for insert
  with check (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_id
        and pm.user_id = auth.uid()
    )
  );
```

## 4) Storage RLS (object access)

For private buckets, add storage policies that map path → project membership.

We store files as: `recordings/{project_id}/{tool}/{YYYY-MM-DD}/{session_id}.webm`

```sql
-- Drop then recreate storage policies
drop policy if exists "objects.read.project" on storage.objects;
drop policy if exists "objects.insert.project" on storage.objects;

-- Allow reading/listing objects in a user's projects
create policy "objects.read.project"
  on storage.objects for select
  using (
    bucket_id = 'recordings'
    and (string_to_array(name, '/'))[1] = 'recordings'
    and (string_to_array(name, '/'))[2] in (
      select pm.project_id from public.project_members pm where pm.user_id = auth.uid()
    )
  );

-- Allow uploads only inside user's project folder
create policy "objects.insert.project"
  on storage.objects for insert
  with check (
    bucket_id = 'recordings'
    and (string_to_array(name, '/'))[1] = 'recordings'
    and (string_to_array(name, '/'))[2] in (
      select pm.project_id from public.project_members pm where pm.user_id = auth.uid()
    )
  );
```

Note: Adjust membership logic to match your schema.

## 5) Environment variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Ensure these are set locally (`.env.local`) and on Vercel.

## 6) App behavior

- The extension completes a recording and hands a Blob to the app.
- The app uploads to Storage path `recordings/{project_id}/{tool}/{YYYY-MM-DD}/{session_id}.webm` and inserts a row into `public.recordings`.
- The UI lists files directly from the `recordings` bucket and uses `getPublicUrl(path)` to render globally accessible links.

## 7) Optional: Chunk/resumable uploads

If the browser/session is unstable, prefer resumable uploads. Supabase Storage supports uploading large files by splitting client‑side and retrying chunks with TUS or similar strategies. If you need true resumable uploads, deploy a small worker/edge function or use a client‑side TUS library targeting a supported endpoint.

For most sessions under a few hundred MB, the current flow (single object upload from the page) is sufficient.
