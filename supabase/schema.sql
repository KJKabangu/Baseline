-- ============================================================
-- Baseline: profiles, bookings, availability_slots, invoices
-- Run once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Committed here for reference/reruns only -- Supabase does not read this
-- file directly. If re-running after a partial failure, drop the created
-- objects first (tables, functions, triggers) since this script has no
-- "if not exists" guards.
-- ============================================================

-- ---------- profiles ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER admin check (avoids RLS recursion on profiles)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;

create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "admin reads all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "admin updates profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- No insert/delete policies: the trigger below (definer) handles inserts;
-- deletes cascade from auth.users.

-- Auto-create profile on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- bookings ----------
-- Columns match the fields actually collected by the #bookingForm in
-- index.html (package, name, email, business, timeline, details).
create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  email       text not null check (char_length(email) between 3 and 320),
  business    text check (char_length(business) <= 200),
  package     text check (char_length(package) <= 100),
  timeline    text check (char_length(timeline) <= 50),
  details     text check (char_length(details) <= 5000),
  status      text not null default 'new'
              check (status in ('new', 'accepted', 'scheduled', 'completed', 'declined')),
  admin_notes text,
  created_at  timestamptz not null default now()
);

alter table public.bookings enable row level security;

create policy "public can submit bookings"
  on public.bookings for insert
  to anon, authenticated
  with check (true);

create policy "client reads own bookings"
  on public.bookings for select
  to authenticated
  using (lower(email) = lower(auth.email()));

create policy "admin full access to bookings"
  on public.bookings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- availability_slots ----------
create table public.availability_slots (
  id         uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time   timestamptz not null,
  is_booked  boolean not null default false,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint slot_valid_range check (end_time > start_time)
);

alter table public.availability_slots enable row level security;

-- Clients see open slots + the slot attached to their own booking
create policy "authenticated read visible slots"
  on public.availability_slots for select
  to authenticated
  using (
    is_booked = false
    or public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = availability_slots.booking_id
        and lower(b.email) = lower(auth.email())
    )
  );

create policy "admin manages slots"
  on public.availability_slots for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- NOTE: clients have NO insert/update/delete on slots. Claiming goes
-- exclusively through claim_slot() below.

-- Atomic, race-safe slot claiming
create or replace function public.claim_slot(p_slot_id uuid, p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Caller must own an accepted booking that isn't already scheduled
  if not exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and lower(b.email) = lower(auth.email())
      and b.status = 'accepted'
  ) then
    raise exception 'Booking not eligible for scheduling';
  end if;

  if exists (
    select 1 from public.availability_slots
    where booking_id = p_booking_id
  ) then
    raise exception 'Booking already has a slot';
  end if;

  -- Atomic claim: concurrent callers race here; loser matches 0 rows
  update public.availability_slots
     set is_booked = true,
         booking_id = p_booking_id
   where id = p_slot_id
     and is_booked = false;

  if not found then
    return false;  -- slot was taken; frontend shows "just taken, pick another"
  end if;

  update public.bookings set status = 'scheduled' where id = p_booking_id;
  return true;
end;
$$;

revoke execute on function public.claim_slot(uuid, uuid) from anon, public;
grant execute on function public.claim_slot(uuid, uuid) to authenticated;

-- ---------- invoices ----------
-- deposit_amount is a generated column (always exactly 25% of amount) so the
-- figure charged via Stripe can never drift from what's stored server-side.
-- deposit_paid / stripe_* columns are written only by the /api serverless
-- functions using the service_role key -- clients have select-only access.
create table public.invoices (
  id                        uuid primary key default gen_random_uuid(),
  client_id                 uuid not null references public.profiles(id) on delete cascade,
  booking_id                uuid references public.bookings(id) on delete set null,
  amount                    numeric(10, 2) not null check (amount >= 0),
  deposit_amount            numeric(10, 2) generated always as (round(amount * 0.25, 2)) stored,
  deposit_paid              boolean not null default false,
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  description               text,
  status                    text not null default 'draft'
                            check (status in ('draft', 'sent', 'paid')),
  due_date                  date,
  created_at                timestamptz not null default now()
);

alter table public.invoices enable row level security;

-- Clients see only their own, and only once sent (drafts stay private)
create policy "client reads own sent invoices"
  on public.invoices for select
  to authenticated
  using (client_id = auth.uid() and status <> 'draft');

create policy "admin full access to invoices"
  on public.invoices for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- One-time, run AFTER the owner's account exists (see README):
--
--   update public.profiles
--      set role = 'admin'
--    where lower(email) = 'kjkabangu8@gmail.com';
-- ============================================================
