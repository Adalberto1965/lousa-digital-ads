-- Supabase schema para a Lousa Digital ADS
-- Execute este arquivo no SQL Editor do Supabase.

create table if not exists public.calendar_entries (
  id uuid primary key,
  operation_date date not null,
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key,
  plate text not null default '',
  type text not null default '',
  rotation_day text not null default '',
  status text not null default 'Disponível',
  created_at timestamptz not null default now()
);

create table if not exists public.crew_members (
  id uuid primary key,
  name text not null default '',
  role text not null default '',
  status text not null default 'Disponível',
  created_at timestamptz not null default now()
);

create table if not exists public.board_messages (
  board_id text primary key default 'principal',
  general_alerts text not null default '',
  corporate_notices text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.calendar_entries enable row level security;
alter table public.vehicles enable row level security;
alter table public.crew_members enable row level security;
alter table public.board_messages enable row level security;

-- MVP: libera leitura e escrita para a chave anon.
-- Para produção com login, substitua estas políticas por políticas baseadas em auth.uid().
create policy "calendar_entries_public_access" on public.calendar_entries
for all using (true) with check (true);

create policy "vehicles_public_access" on public.vehicles
for all using (true) with check (true);

create policy "crew_members_public_access" on public.crew_members
for all using (true) with check (true);

create policy "board_messages_public_access" on public.board_messages
for all using (true) with check (true);

insert into public.board_messages (board_id, general_alerts, corporate_notices)
values ('principal', 'Atenção: confirmar checklists antes da saída dos veículos.', 'Reunião operacional semanal: sexta-feira às 16h.')
on conflict (board_id) do nothing;
