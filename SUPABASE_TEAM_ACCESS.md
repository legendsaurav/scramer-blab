# Team Access (All Authenticated Users)

This app can run in "Team Mode" where all authenticated users share access to sessions, announcements, and metrics. Enable it in the frontend and configure Supabase Row Level Security (RLS) so any logged-in member can read/write the relevant tables.

## 1) Frontend toggle

Add this to your environment (e.g. `.env.local`):

```
VITE_TEAM_MODE_ALL=true
```

With this set, the Dashboard aggregates Weekly Time across all users instead of the current user only.

## 2) Supabase policies

If you are using Supabase Auth and RLS is enabled for your tables, create permissive policies so any authenticated user can read/write team data. Adjust table names to match your schema.

Notes:
- Storage is already public for the `recordings` bucket per earlier setup.
- These examples assume you are okay with organization-wide sharing among authenticated users.

### sessions

```sql
-- Ensure RLS is enabled
alter table public.sessions enable row level security;

-- Allow all authenticated users to read/write sessions
create policy "sessions_select_all_auth"
  on public.sessions for select
  to authenticated
  using (true);

create policy "sessions_insert_all_auth"
  on public.sessions for insert
  to authenticated
  with check (true);

create policy "sessions_update_all_auth"
  on public.sessions for update
  to authenticated
  using (true)
  with check (true);
```

### announcements

```sql
alter table public.announcements enable row level security;

create policy "announcements_select_all_auth"
  on public.announcements for select
  to authenticated
  using (true);

create policy "announcements_insert_all_auth"
  on public.announcements for insert
  to authenticated
  with check (true);
```

### profiles (optional)
Keep profiles readable to authenticated users; updates limited to self.

```sql
alter table public.profiles enable row level security;

create policy "profiles_select_all_auth"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
```

## 3) Verify

1. Sign in with two different accounts.
2. Record a short session from either account.
3. Confirm a new row appears in `public.sessions` with a `user_id` and `total_duration`.
4. Open the Dashboard; the Weekly Time should include minutes from both accounts when `VITE_TEAM_MODE_ALL=true`.

## 4) Optional: revert to per-user view

Set `VITE_TEAM_MODE_ALL=false` (or remove it) to show per-user Weekly Time while keeping team-wide access policies in the backend.
