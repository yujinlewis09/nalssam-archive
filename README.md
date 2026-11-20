# 🌿 날샘 NALSSAM 아카이브

대전대신고등학교 환경·생태 동아리 **날샘(NALSSAM)**의
활동 기록 · 외부 대회 디렉터리 · 연구·활동 보고서 양식을 한곳에 모은 웹사이트입니다.

- **빌드 없음**: HTML · CSS · JS만으로 동작해서 GitHub Pages에 그대로 올라갑니다.
- **관리자 없는 개인 사용자 구조**: 모두 학교 구글 계정으로 로그인해 자기 기록을 쓰고, 공개 범위(전체 · 부원 · 나만)를 직접 정합니다. 학번 · 진로 · 개인 연간 보고서는 본인만 볼 수 있습니다.
- **대회 디렉터리**: 공식 접수처 → 공고 페이지 → 작년 공고 → 콘테스트코리아 검색 순으로 바로 연결하고, 지난 접수 기간으로 다음 회차를 예상합니다.
- **보고서 양식 v2**: HWP · HWPX · DOCX · PDF · LaTeX(Overleaf)로 내려받는 정식 연구·활동 보고서.
- **발표 모드**: 기록 하나, 또는 동아리 전체를 16:9 HTML 슬라이드로 자동 변환 (← → 키, F 전체화면, Esc 닫기).

## 폴더 구조

```
├─ index.html                  # 진입점 (해시 라우팅: #/ #/archive #/a/:id #/contests #/report #/write #/me)
├─ config.js                   # Supabase URL · Publishable key (공개용)
├─ assets/css/style.css        # 디자인 시스템
├─ assets/js/data.js           # 동아리 정보 · 예시 기록 1건 · 대회 디렉터리(공개 정보)
├─ assets/js/app.js            # 라우터 · 데이터 · 화면 · 발표 모드 · LaTeX 변환
├─ report/downloads/           # 보고서 양식 (nalssam-report.docx/.pdf/.hwp/.hwpx/.tex)
├─ tools/build_report.py       # DOCX 양식 생성기 (python-docx)
├─ tools/convert_report.ps1    # Word·한글로 PDF/HWP/HWPX 변환
└─ supabase/
   ├─ schema.sql               # 1) 기본 테이블 + RLS
   ├─ 002_members_privacy.sql  # 2) 공개 범위 · 작성자 권한 · 프로필 · 개인 보고서
   └─ 003_cleanup_examples.sql # 3) 예시 데이터 정리 (커피쉴드만 남김)
```

## 1. 내 컴퓨터에서 보기

```bash
python -m http.server 5517 --directory .
```

## 2. Supabase

1. SQL Editor에서 `schema.sql` → `002_members_privacy.sql` → `003_cleanup_examples.sql` 순서로 실행.
2. `config.js`에 Project URL과 **Publishable key**(`sb_publishable_…`)를 넣습니다. secret key는 절대 넣지 마세요.
3. **Authentication → URL Configuration**: Site URL과 Redirect URLs에 배포 주소(`https://<계정>.github.io/<저장소>/`)와 `http://localhost:5517`을 추가.

### 로그인 메일 보내기: Gmail SMTP 연결 (무료)

로그인은 "학교 메일(@dshs.kr)로 로그인 링크 받기" 방식입니다. Supabase 기본 메일 서비스는 **프로젝트 팀원 메일로만, 시간당 몇 통만** 보내므로, 무료 Gmail 계정을 발신 서버로 연결해야 부원 누구나 받을 수 있습니다 (Gmail 하루 약 500통).

1. 발신용 Gmail 계정 준비 (동아리 공용 계정 권장) → [Google 계정 → 보안](https://myaccount.google.com/security)에서 **2단계 인증** 켜기.
2. [앱 비밀번호](https://myaccount.google.com/apppasswords) 만들기 → 앱 이름 `nalssam` → 16자리 비밀번호 복사. (결제 · Google Cloud 필요 없음)
3. Supabase **Authentication → Emails → SMTP Settings → Enable custom SMTP**
   - Sender email: 그 Gmail 주소 · Sender name: `날샘 NALSSAM`
   - Host `smtp.gmail.com` · Port `465` · Username: 그 Gmail 주소 · Password: 2번의 앱 비밀번호
4. **Authentication → Rate Limits**에서 이메일 발송 한도를 필요한 만큼(예: 시간당 60) 올리기.
5. (선택) **Authentication → Emails → Templates → Magic Link** 제목을 `날샘 아카이브 로그인 링크`로 바꾸기.

> 앱 비밀번호는 Supabase 대시보드에만 넣고, 코드 · 채팅 · 저장소에는 절대 적지 마세요.
>
> Google Cloud OAuth를 따로 설정했다면 `config.js`의 `GOOGLE_LOGIN: true`로 "Google 학교 계정으로 계속하기" 버튼을 켤 수 있습니다 (선택).

## 3. GitHub Pages

저장소 **Settings → Pages → Deploy from a branch → main / (root)**.

## 4. 보고서 양식 다시 만들기

```bash
python tools/build_report.py
```
```bash
powershell -ExecutionPolicy Bypass -File tools/convert_report.ps1
```
Word · 한글 창이 잠깐 뜹니다. ‘문서 복구’나 ‘파일 접근 허용’ 확인 창이 뜨면 눌러주세요.

## 5. 개인정보 원칙

- 공개 저장소에는 학생 이름 · 학번 · 학습지/드라이브 링크를 넣지 않습니다. 실제 기록은 DB(RLS로 보호)에만 있습니다.
- `supabase/seed.sql`, `private/` 등 개인정보가 들어간 파일은 `.gitignore`로 제외되어 있습니다.
