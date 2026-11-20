/* =========================================================
   날샘 아카이브 · Supabase 연결 설정
   ---------------------------------------------------------
   1) supabase.com 에서 프로젝트를 만든 뒤
   2) SQL Editor 에 supabase/schema.sql 을 붙여넣고 실행
   3) Settings → API Keys 에서 URL 과 Publishable key(sb_publishable_…) 를 아래에 입력
   비워두면 사이트는 assets/js/data.js 의 시드 데이터 + 브라우저 임시저장으로 동작합니다.
   Publishable key 는 공개용 키라 GitHub 에 올려도 됩니다 (쓰기 권한은 RLS 정책이 막아줍니다).
   secret key(sb_secret_…) 나 service_role 키는 절대 여기에 넣지 마세요.
   ========================================================= */
window.NAELSAEM_CONFIG = {
  // 프로젝트: naelsaem-archive (조직 NS · 서울 리전)
  SUPABASE_URL: 'https://vvhculybokphdgbcarpd.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_jZ5wG3NNalUte301MpkEFw_HWyfTBWS',
  // 기록을 추가·수정할 수 있는 이메일 도메인 (schema.sql 의 RLS 정책과 같게 맞추세요)
  WRITER_EMAIL_DOMAIN: 'dshs.kr',
  // 로그인: 기본은 학교 메일 링크(Gmail SMTP 연결 필요). Google Cloud OAuth를 설정했다면 true
  GOOGLE_LOGIN: false,
};
