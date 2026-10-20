-- =====================================================================
--  Horizon Group Sports Day 2569 – Yellow Team Athlete Management
--  Supabase / PostgreSQL schema + seed data
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางไฟล์นี้ทั้งไฟล์ → Run
--  รันซ้ำได้ (idempotent) — ไม่ลบข้อมูลเดิม, seed ใส่เฉพาะแถวที่ยังไม่มี
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  member_code text not null unique,
  full_name   text not null check (length(btrim(full_name)) >= 3),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.sports (
  id           uuid primary key default gen_random_uuid(),
  sport_name   text not null unique check (length(btrim(sport_name)) >= 2),
  target_count integer not null check (target_count between 1 and 500),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per (member, sport) forever. Cancelling flips the status instead of deleting,
-- and re-registering flips it back, so the unique key never blocks history.
-- Every change is also written to audit_logs for a full timeline.
create table if not exists public.registrations (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references public.members(id) on delete restrict,
  sport_id            uuid not null references public.sports(id)  on delete restrict,
  registration_status text not null default 'registered' check (registration_status in ('registered','cancelled')),
  registered_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          text,
  constraint registrations_member_sport_key unique (member_id, sport_id)
);
create index if not exists registrations_sport_status_idx on public.registrations (sport_id, registration_status);

create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  action     text not null,
  member_id  uuid references public.members(id) on delete set null,
  sport_id   uuid references public.sports(id)  on delete set null,
  detail     text,
  actor      text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------- updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members for each row execute function public.touch_updated_at();
drop trigger if exists sports_touch on public.sports;
create trigger sports_touch before update on public.sports for each row execute function public.touch_updated_at();
drop trigger if exists registrations_touch on public.registrations;
create trigger registrations_touch before update on public.registrations for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- helpers
create or replace function public._actor(p_actor text) returns text language sql stable as $$
  select coalesce(nullif(btrim(p_actor), ''), auth.jwt() ->> 'email', 'system')
$$;

create or replace function public._log(p_action text, p_member uuid, p_sport uuid, p_detail text, p_actor text)
returns void language sql as $$
  insert into public.audit_logs(action, member_id, sport_id, detail, actor) values (p_action, p_member, p_sport, p_detail, p_actor)
$$;

create or replace function public._count_registered(p_sport uuid) returns integer language sql stable as $$
  select count(*)::int from public.registrations r join public.members m on m.id = r.member_id and m.is_active
  where r.sport_id = p_sport and r.registration_status = 'registered'
$$;

-- ---------------------------------------------------------------- write API (each call = one transaction)
-- register several members into one sport. Locks the sport row so concurrent saves are serialized:
-- no duplicates (unique key) and the over-target check can't be raced.
create or replace function public.register_members(p_sport_id uuid, p_member_ids uuid[], p_actor text, p_allow_over boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_sport  public.sports%rowtype;
  v_ids    uuid[] := array(select distinct x from unnest(coalesce(p_member_ids, '{}')) x);
  v_new    uuid[];
  v_actor  text := public._actor(p_actor);
  v_id     uuid;
  v_status text;
  v_name   text;
begin
  if cardinality(v_ids) = 0 then raise exception 'INVALID_INPUT'; end if;
  select * into v_sport from public.sports where id = p_sport_id for update;
  if not found then raise exception 'SPORT_NOT_FOUND'; end if;
  if not v_sport.is_active then raise exception 'SPORT_INACTIVE'; end if;

  v_new := array(
    select m.id from public.members m
    where m.id = any(v_ids) and m.is_active
      and not exists (select 1 from public.registrations r
                      where r.member_id = m.id and r.sport_id = p_sport_id and r.registration_status = 'registered'));

  if not p_allow_over and public._count_registered(p_sport_id) + cardinality(v_new) > v_sport.target_count then
    raise exception 'OVER_TARGET';
  end if;

  foreach v_id in array v_new loop
    select full_name into v_name from public.members where id = v_id;
    select registration_status into v_status from public.registrations
      where member_id = v_id and sport_id = p_sport_id for update;
    if v_status is null then
      insert into public.registrations(member_id, sport_id, created_by) values (v_id, p_sport_id, v_actor);
      perform public._log('REGISTER', v_id, p_sport_id, v_name || ' → ' || v_sport.sport_name, v_actor);
    else
      update public.registrations set registration_status = 'registered', registered_at = now(), created_by = v_actor
        where member_id = v_id and sport_id = p_sport_id;
      perform public._log('RE_REGISTER', v_id, p_sport_id, v_name || ' → ' || v_sport.sport_name, v_actor);
    end if;
  end loop;

  return json_build_object('added', cardinality(v_new), 'skipped', cardinality(v_ids) - cardinality(v_new));
end $$;

create or replace function public.cancel_registration(p_member_id uuid, p_sport_id uuid, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := public._actor(p_actor);
begin
  update public.registrations set registration_status = 'cancelled'
    where member_id = p_member_id and sport_id = p_sport_id and registration_status = 'registered';
  if not found then raise exception 'NOT_REGISTERED'; end if;
  perform public._log('CANCEL', p_member_id, p_sport_id,
    (select full_name from public.members where id = p_member_id) || ' ยกเลิก ' || (select sport_name from public.sports where id = p_sport_id), v_actor);
end $$;

create or replace function public.move_registration(p_member_id uuid, p_from_sport uuid, p_to_sport uuid, p_actor text, p_allow_over boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._actor(p_actor);
  v_to    public.sports%rowtype;
  v_from  text;
  v_name  text;
  v_active boolean;
begin
  if p_from_sport = p_to_sport then raise exception 'SAME_SPORT'; end if;
  -- lock both sports in a fixed order to avoid deadlocks
  perform 1 from public.sports where id in (p_from_sport, p_to_sport) order by id for update;
  select * into v_to from public.sports where id = p_to_sport;
  if not found or not v_to.is_active then raise exception 'SPORT_NOT_FOUND'; end if;
  select full_name, is_active into v_name, v_active from public.members where id = p_member_id;
  if v_name is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not v_active then raise exception 'MEMBER_INACTIVE'; end if;
  if exists (select 1 from public.registrations where member_id = p_member_id and sport_id = p_to_sport and registration_status = 'registered') then
    raise exception 'ALREADY_REGISTERED';
  end if;
  if not p_allow_over and public._count_registered(p_to_sport) + 1 > v_to.target_count then raise exception 'OVER_TARGET'; end if;

  update public.registrations set registration_status = 'cancelled'
    where member_id = p_member_id and sport_id = p_from_sport and registration_status = 'registered';
  if not found then raise exception 'NOT_REGISTERED'; end if;

  insert into public.registrations(member_id, sport_id, created_by) values (p_member_id, p_to_sport, v_actor)
  on conflict (member_id, sport_id) do update
    set registration_status = 'registered', registered_at = now(), created_by = excluded.created_by;

  select sport_name into v_from from public.sports where id = p_from_sport;
  perform public._log('MOVE', p_member_id, p_to_sport, v_name || ': ' || v_from || ' → ' || v_to.sport_name, v_actor);
end $$;

create or replace function public.add_member(p_full_name text, p_actor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(p_full_name), '\s+', ' ', 'g');
  v_code text;
  v_id   uuid;
begin
  if length(v_name) < 3 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtext('members.member_code'));
  if exists (select 1 from public.members where full_name = v_name) then raise exception 'DUPLICATE_NAME'; end if;
  select 'Y' || lpad((coalesce(max(substring(member_code from 2)::int), 0) + 1)::text, 3, '0') into v_code
    from public.members where member_code ~ '^Y[0-9]+$';
  insert into public.members(member_code, full_name) values (v_code, v_name) returning id into v_id;
  perform public._log('MEMBER_ADD', v_id, null, 'เพิ่มสมาชิก ' || v_code || ' ' || v_name, public._actor(p_actor));
  return v_id;
end $$;

create or replace function public.update_member(p_id uuid, p_full_name text, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(btrim(p_full_name), '\s+', ' ', 'g');
  v_old  public.members%rowtype;
begin
  if length(v_name) < 3 then raise exception 'INVALID_INPUT'; end if;
  select * into v_old from public.members where id = p_id for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if v_old.full_name = v_name then return; end if;
  if exists (select 1 from public.members where full_name = v_name and id <> p_id) then raise exception 'DUPLICATE_NAME'; end if;
  update public.members set full_name = v_name where id = p_id;
  perform public._log('MEMBER_UPDATE', p_id, null, v_old.member_code || ': ' || v_old.full_name || ' → ' || v_name, public._actor(p_actor));
end $$;

create or replace function public.set_member_active(p_id uuid, p_active boolean, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m public.members%rowtype; v_n int := 0;
begin
  select * into v_m from public.members where id = p_id for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if v_m.is_active = p_active then return; end if;
  update public.members set is_active = p_active where id = p_id;
  if not p_active then
    update public.registrations set registration_status = 'cancelled' where member_id = p_id and registration_status = 'registered';
    get diagnostics v_n = row_count;
  end if;
  perform public._log('MEMBER_ACTIVE', p_id, null,
    case when p_active then 'เปิดใช้งาน ' else 'ปิดใช้งาน ' end || v_m.full_name ||
    case when v_n > 0 then ' (ยกเลิกการสมัคร ' || v_n || ' รายการ)' else '' end, public._actor(p_actor));
end $$;

create or replace function public.add_sport(p_name text, p_target integer, p_actor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g'); v_id uuid;
begin
  if length(v_name) < 2 or p_target is null or p_target < 1 or p_target > 500 then raise exception 'INVALID_INPUT'; end if;
  if exists (select 1 from public.sports where sport_name = v_name) then raise exception 'DUPLICATE_NAME'; end if;
  insert into public.sports(sport_name, target_count, sort_order)
    values (v_name, p_target, (select coalesce(max(sort_order), 0) + 1 from public.sports)) returning id into v_id;
  perform public._log('SPORT_ADD', null, v_id, 'เพิ่มกีฬา ' || v_name || ' (เป้าหมาย ' || p_target || ' คน)', public._actor(p_actor));
  return v_id;
end $$;

create or replace function public.update_sport(p_id uuid, p_name text, p_target integer, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g'); v_old public.sports%rowtype; v_changes text[] := '{}';
begin
  if length(v_name) < 2 or p_target is null or p_target < 1 or p_target > 500 then raise exception 'INVALID_INPUT'; end if;
  select * into v_old from public.sports where id = p_id for update;
  if not found then raise exception 'SPORT_NOT_FOUND'; end if;
  if exists (select 1 from public.sports where sport_name = v_name and id <> p_id) then raise exception 'DUPLICATE_NAME'; end if;
  if v_old.sport_name <> v_name then v_changes := v_changes || ('ชื่อ ' || v_old.sport_name || ' → ' || v_name); end if;
  if v_old.target_count <> p_target then v_changes := v_changes || ('เป้าหมาย ' || v_old.target_count || ' → ' || p_target); end if;
  if cardinality(v_changes) = 0 then return; end if;
  update public.sports set sport_name = v_name, target_count = p_target where id = p_id;
  perform public._log('SPORT_UPDATE', null, p_id, v_name || ': ' || array_to_string(v_changes, ', '), public._actor(p_actor));
end $$;

create or replace function public.set_sport_active(p_id uuid, p_active boolean, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.sports%rowtype;
begin
  select * into v_s from public.sports where id = p_id for update;
  if not found then raise exception 'SPORT_NOT_FOUND'; end if;
  if v_s.is_active = p_active then return; end if;
  update public.sports set is_active = p_active where id = p_id;
  perform public._log('SPORT_ACTIVE', null, p_id, case when p_active then 'เปิดใช้งาน' else 'ปิดใช้งาน' end || 'กีฬา ' || v_s.sport_name, public._actor(p_actor));
end $$;

create or replace function public.reset_registrations(p_actor text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  lock table public.registrations in share row exclusive mode;
  update public.registrations set registration_status = 'cancelled' where registration_status = 'registered';
  get diagnostics v_n = row_count;
  perform public._log('RESET', null, null, 'รีเซ็ตการสมัครทั้งหมด (ยกเลิก ' || v_n || ' รายการ)', public._actor(p_actor));
  return v_n;
end $$;

-- ---------------------------------------------------------------- security
-- Tables are read-only for signed-in users; every write must go through the functions above.
alter table public.members       enable row level security;
alter table public.sports        enable row level security;
alter table public.registrations enable row level security;
alter table public.audit_logs    enable row level security;

drop policy if exists "read members" on public.members;
create policy "read members" on public.members for select to authenticated using (true);
drop policy if exists "read sports" on public.sports;
create policy "read sports" on public.sports for select to authenticated using (true);
drop policy if exists "read registrations" on public.registrations;
create policy "read registrations" on public.registrations for select to authenticated using (true);
drop policy if exists "read audit" on public.audit_logs;
create policy "read audit" on public.audit_logs for select to authenticated using (true);

do $$
declare f text;
begin
  foreach f in array array[
    'register_members(uuid, uuid[], text, boolean)', 'cancel_registration(uuid, uuid, text)',
    'move_registration(uuid, uuid, uuid, text, boolean)', 'add_member(text, text)', 'update_member(uuid, text, text)',
    'set_member_active(uuid, boolean, text)', 'add_sport(text, integer, text)', 'update_sport(uuid, text, integer, text)',
    'set_sport_active(uuid, boolean, text)', 'reset_registrations(text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array['members', 'sports', 'registrations', 'audit_logs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- seed data
insert into public.members (member_code, full_name) values
  ('Y001', 'นางสาววรารัตน์ พรหมสาขา ณ สกลนคร'),
  ('Y002', 'นางสาวเบญญาภา เกษมสุข'),
  ('Y003', 'นายกันต์พงศ์ แก้วแกมทอง'),
  ('Y004', 'นางสาวสินีนารถ ศุภระศร'),
  ('Y005', 'นายสุรชัย ตี่ด้วง'),
  ('Y006', 'นายอนวัช อยู่คล้อย'),
  ('Y007', 'นายภูรินท์ ปอนสำโรง'),
  ('Y008', 'นายอาภณัฐ เกียรติวิบูลย์กิจ'),
  ('Y009', 'นายณวัชร เหลืองปฐมชัย'),
  ('Y010', 'นายธีระวัฒน์ อินปาต๊ะ'),
  ('Y011', 'นายชูเกียรติ อินทร์จำปา'),
  ('Y012', 'นายจักริน พัดเพียเมือง'),
  ('Y013', 'นายนนทวัฒน์ พรมรัตน์'),
  ('Y014', 'นายมนัส อิ่นทา'),
  ('Y015', 'นายธนากร ศรีประมาณ'),
  ('Y016', 'นางสาวนิชาภา พวงร้อย'),
  ('Y017', 'นางสาวรัชปภา ไชยเพ็ชร'),
  ('Y018', 'นายวิรัน รวงสง่า'),
  ('Y019', 'นายวิชาติ สายบุดดี'),
  ('Y020', 'นายกัมพล ชินบุตร'),
  ('Y021', 'นายอนันต์วรพล มิ่งเมือง'),
  ('Y022', 'นายอัครพล เทียมดง'),
  ('Y023', 'นายชนะกิจ สมสนิท')
on conflict (member_code) do nothing;

insert into public.sports (sport_name, target_count, sort_order) values
  ('ชู้ตเตอร์กางเกงยักษ์', 10, 1),
  ('มังกรยักษ์',          15, 2),
  ('แชร์บอล',              7, 3),
  ('บอลยักษ์',            10, 4),
  ('ฟุตบอลรวมทีม',         9, 5)
on conflict (sport_name) do nothing;

-- =====================================================================
-- OPTIONAL: anon access — ใช้เฉพาะเมื่อตั้ง VITE_AUTH_MODE=none (ไม่ต้องล็อกอิน)
-- คำเตือน: ทุกคนที่มีลิงก์เว็บจะแก้ไขข้อมูลได้ ลบเครื่องหมาย -- ด้านหน้าเพื่อเปิดใช้
-- =====================================================================
-- create policy "anon read members" on public.members for select to anon using (true);
-- create policy "anon read sports" on public.sports for select to anon using (true);
-- create policy "anon read registrations" on public.registrations for select to anon using (true);
-- create policy "anon read audit" on public.audit_logs for select to anon using (true);
-- grant execute on function public.register_members(uuid, uuid[], text, boolean), public.cancel_registration(uuid, uuid, text),
--   public.move_registration(uuid, uuid, uuid, text, boolean), public.add_member(text, text), public.update_member(uuid, text, text),
--   public.set_member_active(uuid, boolean, text), public.add_sport(text, integer, text), public.update_sport(uuid, text, integer, text),
--   public.set_sport_active(uuid, boolean, text), public.reset_registrations(text) to anon;
