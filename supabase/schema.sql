-- =========================================================
-- 날샘 아카이브 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run.
-- 읽기: 누구나 (공개 아카이브)
-- 쓰기: @dshs.kr 학교 계정으로 로그인한 부원만
--       (도메인을 바꾸려면 아래 public.is_club_writer() 한 곳만 수정)
-- =========================================================

-- 0) 쓰기 권한 판별 함수 ------------------------------------------------
create or replace function public.is_club_writer()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@dshs.kr', false);
$$;

revoke execute on function public.is_club_writer() from public, anon;
grant execute on function public.is_club_writer() to authenticated;

-- 1) 활동 기록 (보고서 본문 포함) ---------------------------------------
create table if not exists public.activities (
  id           text primary key,                       -- 예: startupcycling-2026-coffeeshield
  title        text not null,
  subtitle     text,
  tagline      text,
  category     text not null default '교내활동'
               check (category in ('교내활동','외부대회','연계사업','탐방','심화탐구')),
  departments  text[] not null default '{}',           -- {'공학부','생명부','화학부'}
  year         int  not null default extract(year from now())::int,
  period       text,
  status       text not null default '기록대기'
               check (status in ('완료','진행중','기록대기')),
  organizer    text,
  partner      text,
  team         text,
  members      jsonb not null default '[]'::jsonb,      -- [{name, role}]
  keywords     text[] not null default '{}',
  summary      text,
  award        text,
  report       jsonb,                                   -- 날샘 표준 보고서 (README 참고)
  budget       jsonb,                                   -- {note, items:[...], total}
  links        jsonb not null default '[]'::jsonb,      -- [{label, url, kind}]
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists activities_year_idx       on public.activities (year desc);
create index if not exists activities_category_idx   on public.activities (category);
create index if not exists activities_departments_ix on public.activities using gin (departments);
create index if not exists activities_created_by_idx on public.activities (created_by);

-- 2) 대회 아카이브 (외부 대회 · 컨퍼런스 노하우) -------------------------
create table if not exists public.contests (
  id          text primary key,
  name        text not null,
  host        text,
  field       text[] not null default '{}',
  season      text,
  format      text,
  history     jsonb not null default '[]'::jsonb,       -- [{year, activity, result}]
  tips        text[] not null default '{}',
  url         text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contests_created_by_idx on public.contests (created_by);

-- 3) updated_at 자동 갱신 ----------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists activities_touch on public.activities;
create trigger activities_touch before update on public.activities
  for each row execute function public.touch_updated_at();

drop trigger if exists contests_touch on public.contests;
create trigger contests_touch before update on public.contests
  for each row execute function public.touch_updated_at();

-- 4) RLS ---------------------------------------------------------------
alter table public.activities enable row level security;
alter table public.contests   enable row level security;

drop policy if exists "activities: public read"  on public.activities;
drop policy if exists "activities: club insert"  on public.activities;
drop policy if exists "activities: club update"  on public.activities;
drop policy if exists "activities: club delete"  on public.activities;

create policy "activities: public read" on public.activities
  for select to anon, authenticated using (true);
create policy "activities: club insert" on public.activities
  for insert to authenticated with check ((select public.is_club_writer()));
create policy "activities: club update" on public.activities
  for update to authenticated using ((select public.is_club_writer())) with check ((select public.is_club_writer()));
create policy "activities: club delete" on public.activities
  for delete to authenticated using ((select public.is_club_writer()));

drop policy if exists "contests: public read" on public.contests;
drop policy if exists "contests: club insert" on public.contests;
drop policy if exists "contests: club update" on public.contests;
drop policy if exists "contests: club delete" on public.contests;

create policy "contests: public read" on public.contests
  for select to anon, authenticated using (true);
create policy "contests: club insert" on public.contests
  for insert to authenticated with check ((select public.is_club_writer()));
create policy "contests: club update" on public.contests
  for update to authenticated using ((select public.is_club_writer())) with check ((select public.is_club_writer()));
create policy "contests: club delete" on public.contests
  for delete to authenticated using ((select public.is_club_writer()));

-- Data API 노출: 읽기는 누구나, 쓰기는 로그인한 사용자(RLS가 다시 @dshs.kr만 허용)
grant select on public.activities, public.contests to anon, authenticated;
grant insert, update, delete on public.activities, public.contests to authenticated;

-- 5) 사진 저장소 (선택) --------------------------------------------------
-- 활동 사진을 Supabase Storage 에 올리고 싶다면 아래 주석을 풀어 실행하세요.
-- insert into storage.buckets (id, name, public) values ('activity-media', 'activity-media', true)
--   on conflict (id) do nothing;
-- create policy "media: club upload" on storage.objects
--   for insert to authenticated
--   with check (bucket_id = 'activity-media' and (select public.is_club_writer()));
