-- MeetSync meetings + action_items tables with Row Level Security
-- Run this entire file in the Supabase SQL editor AFTER recordings.sql

-- ── meetings table ─────────────────────────────────────────────────────────

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Meeting',
  status text not null default 'idle'
    check (status in ('idle','recording','paused','recorded','transcribing','transcribed','processing','completed','error')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  recording_id uuid references public.recordings(id) on delete set null,
  transcript text,
  transcription_status text,
  mom_data jsonb,
  processing_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_user_id_idx on public.meetings (user_id);
create index if not exists meetings_created_at_idx on public.meetings (created_at desc);
create index if not exists meetings_status_idx on public.meetings (status);

alter table public.meetings enable row level security;

drop policy if exists "Users can read their own meetings" on public.meetings;
create policy "Users can read their own meetings"
  on public.meetings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own meetings" on public.meetings;
create policy "Users can create their own meetings"
  on public.meetings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own meetings" on public.meetings;
create policy "Users can update their own meetings"
  on public.meetings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own meetings" on public.meetings;
create policy "Users can delete their own meetings"
  on public.meetings for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meetings_updated_at on public.meetings;
create trigger meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- ── action_items table ─────────────────────────────────────────────────────

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee text not null default 'Unassigned',
  deadline text,
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  status text not null default 'open'
    check (status in ('open', 'completed')),
  source_context text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists action_items_meeting_id_idx on public.action_items (meeting_id);
create index if not exists action_items_user_id_idx on public.action_items (user_id);
create index if not exists action_items_status_idx on public.action_items (status);

alter table public.action_items enable row level security;

drop policy if exists "Users can read their own action items" on public.action_items;
create policy "Users can read their own action items"
  on public.action_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own action items" on public.action_items;
create policy "Users can create their own action items"
  on public.action_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own action items" on public.action_items;
create policy "Users can update their own action items"
  on public.action_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own action items" on public.action_items;
create policy "Users can delete their own action items"
  on public.action_items for delete
  using (auth.uid() = user_id);

drop trigger if exists action_items_updated_at on public.action_items;
create trigger action_items_updated_at
  before update on public.action_items
  for each row execute function public.set_updated_at();
