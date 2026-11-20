-- =========================================================
-- 날샘 아카이브 · v2 개인 사용자 구조
-- schema.sql 다음에 SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- 원칙
--  · 관리자 없음. 모든 부원은 "개인 사용자"
--  · 활동 기록: 작성자가 공개 범위를 고름
--      public  = 누구나 / members = 로그인한 @dshs.kr 부원 / private = 나만
--  · 활동 기록 수정·삭제: 작성자 본인만
--  · 프로필(이름·학번·부서·진로)과 개인 연간 보고서: 본인만 보고 고침
-- =========================================================

-- 1) 활동 기록: 공개 범위 ---------------------------------------------
alter table public.activities
  add column if not exists visibility text not null default 'members';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_visibility_check') then
    alter table public.activities
      add constraint activities_visibility_check check (visibility in ('public', 'members', 'private'));
  end if;
end $$;

-- 2) 활동 기록: 정책 교체 ----------------------------------------------
drop policy if exists "activities: public read"   on public.activities;
drop policy if exists "activities: anon read"     on public.activities;
drop policy if exists "activities: member read"   on public.activities;
drop policy if exists "activities: club insert"   on public.activities;
drop policy if exists "activities: owner insert"  on public.activities;
drop policy if exists "activities: club update"   on public.activities;
drop policy if exists "activities: owner update"  on public.activities;
drop policy if exists "activities: club delete"   on public.activities;
drop policy if exists "activities: owner delete"  on public.activities;

-- 로그인 안 한 방문자: 전체 공개 기록만
create policy "activities: anon read" on public.activities
  for select to anon
  using (visibility = 'public');

-- 로그인한 사용자: 전체 공개 + (부원이면) 부원 공개 + 내가 쓴 기록
create policy "activities: member read" on public.activities
  for select to authenticated
  using (
    visibility = 'public'
    or (visibility = 'members' and (select public.is_club_writer()))
    or created_by = (select auth.uid())
  );

-- 새 기록: 부원만, 작성자는 반드시 나
create policy "activities: owner insert" on public.activities
  for insert to authenticated
  with check ((select public.is_club_writer()) and created_by = (select auth.uid()));

-- 수정·삭제: 작성자 본인만 (작성자를 다른 사람으로 바꿀 수 없음)
create policy "activities: owner update" on public.activities
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "activities: owner delete" on public.activities
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- 3) 대회 아카이브: 읽기는 누구나, 수정은 작성자만 ----------------------
drop policy if exists "contests: club update"  on public.contests;
drop policy if exists "contests: owner update" on public.contests;
drop policy if exists "contests: club delete"  on public.contests;
drop policy if exists "contests: owner delete" on public.contests;
drop policy if exists "contests: club insert"  on public.contests;
drop policy if exists "contests: owner insert" on public.contests;

create policy "contests: owner insert" on public.contests
  for insert to authenticated
  with check ((select public.is_club_writer()) and created_by = (select auth.uid()));
create policy "contests: owner update" on public.contests
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy "contests: owner delete" on public.contests
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- 방문자(anon)는 읽기만
revoke insert, update, delete, truncate on public.activities, public.contests from anon;

-- 4) 프로필: 본인만 -----------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  student_no  text,
  department  text check (department is null or department in ('공학부', '생명부', '화학부')),
  career      text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists "profiles: own select" on public.profiles;
drop policy if exists "profiles: own insert" on public.profiles;
drop policy if exists "profiles: own update" on public.profiles;
drop policy if exists "profiles: own delete" on public.profiles;
create policy "profiles: own select" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: own insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: own update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: own delete" on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 5) 개인 연간 활동 보고서: 본인만 ---------------------------------------
create table if not exists public.personal_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year        int  not null,
  data        jsonb not null default '{}'::jsonb,   -- 참여 현황 · 핵심 활동 · 기여도 (README 참고)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, year)
);

alter table public.personal_reports enable row level security;
revoke all on public.personal_reports from anon;
grant select, insert, update, delete on public.personal_reports to authenticated;

drop policy if exists "personal_reports: own select" on public.personal_reports;
drop policy if exists "personal_reports: own insert" on public.personal_reports;
drop policy if exists "personal_reports: own update" on public.personal_reports;
drop policy if exists "personal_reports: own delete" on public.personal_reports;
create policy "personal_reports: own select" on public.personal_reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "personal_reports: own insert" on public.personal_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "personal_reports: own update" on public.personal_reports
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "personal_reports: own delete" on public.personal_reports
  for delete to authenticated using (user_id = (select auth.uid()));

drop trigger if exists personal_reports_touch on public.personal_reports;
create trigger personal_reports_touch before update on public.personal_reports
  for each row execute function public.touch_updated_at();
