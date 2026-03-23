-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nickname text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  push_token text,
  created_at timestamptz not null default now()
);

-- events table
create table public.events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  location text not null,
  starts_at timestamptz not null,
  registration_opens_at timestamptz not null,
  max_attendees int not null default 12,
  is_recurring boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- attendances table
create table public.attendances (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendances enable row level security;

-- profiles RLS
create policy "Users can view all profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- events RLS
create policy "Anyone can view events" on public.events for select using (true);
create policy "Only admins can insert events" on public.events for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can update events" on public.events for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can delete events" on public.events for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- attendances RLS
create policy "Anyone can view attendances" on public.attendances for select using (true);
create policy "Users can attend for themselves" on public.attendances for insert with check (auth.uid() = user_id);
create policy "Users can remove own attendance" on public.attendances for delete using (auth.uid() = user_id);

-- RPC: attend_event (race-for-a-spot logic)
create or replace function public.attend_event(p_event_id uuid)
returns json
language plpgsql security definer
as $$
declare
  v_max int;
  v_count int;
begin
  -- Lock the event row to prevent race conditions
  select max_attendees into v_max from public.events where id = p_event_id for update;
  if not found then
    return json_build_object('success', false, 'error', 'Event not found');
  end if;

  -- Count current attendees
  select count(*) into v_count from public.attendances where event_id = p_event_id;

  if v_count >= v_max then
    return json_build_object('success', false, 'error', 'Event is full');
  end if;

  -- Insert attendance
  insert into public.attendances (event_id, user_id)
  values (p_event_id, auth.uid())
  on conflict (event_id, user_id) do nothing;

  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'error', sqlerrm);
end;
$$;

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
