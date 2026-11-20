-- =========================================================
-- 날샘(NALSSAM) 아카이브 · 예시 데이터 정리
-- 002_members_privacy.sql 다음에 한 번 실행하세요.
--  · 커피쉴드 기록 1건만 예시로 남기고, 나머지 임시 활동 기록은 지웁니다
--    (실제 기록은 부원들이 사이트에서 직접 작성)
--  · 대회 디렉터리는 이제 공개 데이터 파일(assets/js/data.js)에서 관리하므로
--    예전에 넣은 대회 4건을 지웁니다. contests 테이블은 부원이 직접 추가하는 대회용으로 남겨둡니다.
--  · 부서 구분을 쓰지 않으므로 커피쉴드 기록의 부서 값을 비웁니다
-- =========================================================
delete from public.activities
where id <> 'startupcycling-2026-coffeeshield'
  and created_by is null;          -- 부원이 직접 쓴 기록은 절대 지우지 않음

update public.activities
set departments = '{}'
where id = 'startupcycling-2026-coffeeshield';

delete from public.contests
where id in ('startupcycling', 'cnu-konyang', 'samsung-humantech', 'science-exhibition')
  and created_by is null;

select (select count(*) from public.activities) as activities,
       (select count(*) from public.contests)   as contests;
