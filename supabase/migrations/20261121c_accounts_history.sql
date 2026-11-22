-- Migration v5 -> v6 (CrediFit): accounts + roles, assessment history, masked CNP, pay-per-use.
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS): safe to run again. schema.sql already contains all of it.

begin;

-- ---------------------------------------------------------------------------
-- Profiles (one per Supabase Auth user) with a role: 'user' | 'admin'
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin'));

-- Every new account gets a profile (role 'user'); the name typed at sign-up is copied.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Accounts created before this migration get their profile too.
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '') from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
-- A user can read only their own profile; roles are changed only with the service role / SQL editor.
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);

-- Make an account admin (run in the SQL editor with the real email):
--   update public.profiles set role = 'admin' where email = 'admin@exemplu.ro';

-- ---------------------------------------------------------------------------
-- Companies: owner account, masked CNP of the administrator, pay-per-use
-- ---------------------------------------------------------------------------
alter table public.companies add column if not exists user_id uuid references auth.users(id) on delete set null;
-- Only the masked form "1900101******" is ever stored (never the full CNP).
alter table public.companies add column if not exists ceo_cnp_masked text;
alter table public.companies drop constraint if exists companies_ceo_cnp_masked_check;
alter table public.companies add constraint companies_ceo_cnp_masked_check check (ceo_cnp_masked is null or ceo_cnp_masked ~ '^[0-9]{7}\*{6}$');
-- Hints derived from the CNP to tell namesakes apart: { birthDate, sex, countyCode, county }.
alter table public.companies add column if not exists ceo_cnp_info jsonb;
alter table public.companies add column if not exists pay_per_use_unlocked boolean not null default false;
alter table public.companies add column if not exists purchased_credits integer not null default 0;
create index if not exists companies_user_idx on public.companies (user_id);

-- ---------------------------------------------------------------------------
-- Subscriptions: pay-per-use analyses next to the monthly / yearly plans
-- ---------------------------------------------------------------------------
alter table public.subscriptions add column if not exists pay_per_use boolean not null default false;
alter table public.subscriptions add column if not exists purchased_credits integer not null default 0;

-- ---------------------------------------------------------------------------
-- Assessment history: one immutable snapshot per saved evaluation
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_history (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  user_id              uuid references auth.users(id) on delete set null,
  final_score          numeric not null,
  s_business           numeric not null,
  s_uman               numeric not null,
  s_investitie         numeric not null,
  dscr                 numeric,
  dso                  numeric not null,
  client_concentration numeric not null,
  requested_amount     numeric,
  status               text,
  snapshot_json        jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists assessment_history_company_idx on public.assessment_history (company_id, created_at desc);
create index if not exists assessment_history_user_idx on public.assessment_history (user_id);

alter table public.assessment_history enable row level security;
drop policy if exists demo_all_assessment_history on public.assessment_history;
-- DEMO ONLY (same as the other tables): the API routes use the service-role key.
create policy demo_all_assessment_history on public.assessment_history for all using (true) with check (true);

commit;
