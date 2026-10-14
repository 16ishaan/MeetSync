create table if not exists public.recordings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

alter table public.recordings enable row level security;

drop policy if exists "Users can read their own recordings" on public.recordings;
create policy "Users can read their own recordings"
  on public.recordings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own recordings" on public.recordings;
create policy "Users can create their own recordings"
  on public.recordings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own recordings" on public.recordings;
create policy "Users can delete their own recordings"
  on public.recordings for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('meeting-recordings', 'meeting-recordings', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own meeting recordings" on storage.objects;
create policy "Users can upload their own meeting recordings"
  on storage.objects for insert
  with check (
    bucket_id = 'meeting-recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can read their own meeting recordings" on storage.objects;
create policy "Users can read their own meeting recordings"
  on storage.objects for select
  using (
    bucket_id = 'meeting-recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can delete their own meeting recordings" on storage.objects;
create policy "Users can delete their own meeting recordings"
  on storage.objects for delete
  using (
    bucket_id = 'meeting-recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );