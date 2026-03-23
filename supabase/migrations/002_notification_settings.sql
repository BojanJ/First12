-- Add notification preference columns to profiles table
alter table public.profiles
  add column if not exists notifications_enabled boolean not null default false,
  add column if not exists notify_on_created boolean not null default true,
  add column if not exists notify_on_opened boolean not null default true;
