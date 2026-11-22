-- Migration v3 -> v4: pricing plans, B2B leads, multi-source verification reports.
-- Idempotent: safe to run on a v3 database (or again). schema.sql already contains all of it.

begin;

-- v4: pricing / monetization
alter table public.companies add column if not exists plan_tier text not null default 'starter';
alter table public.companies add column if not exists billing_cycle text not null default 'monthly';
alter table public.companies drop constraint if exists companies_plan_tier_check;
alter table public.companies add constraint companies_plan_tier_check check (plan_tier in ('starter', 'pro', 'business'));
alter table public.companies drop constraint if exists companies_billing_cycle_check;
alter table public.companies add constraint companies_billing_cycle_check check (billing_cycle in ('monthly', 'yearly'));

-- ---------------------------------------------------------------------------
-- Subscriptions (one row per company; the plan gates features, see src/lib/pricing.ts).
-- companies.plan_tier / billing_cycle mirror the current row for quick reads.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  company_id    uuid primary key references public.companies(id) on delete cascade,
  plan_tier     text not null default 'starter' check (plan_tier in ('starter', 'pro', 'business')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  status        text not null default 'active' check (status in ('active', 'trialing', 'canceled')),
  -- 'demo' = simulated checkout (hackathon), 'stripe' = real payment later
  provider      text not null default 'demo',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- B2B leads from the "Solicită Demo B2B" form (banks / financial institutions)
-- ---------------------------------------------------------------------------
create table if not exists public.b2b_leads (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  organization text not null,
  email        text not null,
  phone        text,
  message      text,
  created_at   timestamptz not null default now()
);
create index if not exists b2b_leads_created_idx on public.b2b_leads (created_at desc);

-- ---------------------------------------------------------------------------
-- Multi-source checks (portal.just.ro, Ghișeul.ro, ANAF, BPI, ONRC, CIP/RNPM).
-- aggregate_score = ScorVerificariExterne, which enters S_Uman with 50%.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_reports (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  company_name      text not null,
  cui               text,
  ceo_name          text,
  aggregate_score   numeric not null,
  has_critical_flag boolean not null default false,
  live_sources      integer not null default 0,
  sources           jsonb not null,
  checked_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists verification_reports_company_idx on public.verification_reports (company_id, checked_at desc);

alter table public.subscriptions        enable row level security;
alter table public.b2b_leads            enable row level security;
alter table public.verification_reports enable row level security;

drop policy if exists demo_all_subscriptions on public.subscriptions;
drop policy if exists demo_insert_b2b_leads on public.b2b_leads;
drop policy if exists demo_all_verification_reports on public.verification_reports;

create policy demo_all_subscriptions         on public.subscriptions        for all    using (true) with check (true);
-- leads can be submitted with the anon key but never read back with it
create policy demo_insert_b2b_leads          on public.b2b_leads            for insert with check (true);
create policy demo_all_verification_reports  on public.verification_reports for all    using (true) with check (true);

-- every existing company starts on the free Starter plan
insert into public.subscriptions (company_id, plan_tier, billing_cycle)
select id, plan_tier, billing_cycle from public.companies
on conflict (company_id) do nothing;

commit;
