/* =========================================================
   날샘 아카이브 · 앱
   - 해시 라우터(#/, #/archive, #/a/:id, #/contests, #/report, #/report/:id)
   - 데이터: Supabase (config.js 설정 시) ↔ 시드 + localStorage (미설정 시)
   - 보고서: 날샘 표준 양식 렌더 · 편집 · 인쇄(PDF) · LaTeX(Overleaf) 내보내기
   - 발표 모드: 기록 하나를 16:9 HTML 슬라이드로 자동 변환
   ========================================================= */
(() => {
  'use strict';

  const SEED = window.NAELSAEM_SEED;
  const CFG = window.NAELSAEM_CONFIG || {};
  const LS_KEY = 'naelsaem.activities.v1';
  const LS_DRAFT = 'naelsaem.draft.v1';

  /* ---------------- utils ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const DEPT_TONE = { 공학부: 'lime', 생명부: 'leaf', 화학부: 'mint' };
  const CAT_ICON = { 교내활동: '🌱', 외부대회: '🏆', 연계사업: '🎓', 탐방: '🔭', 심화탐구: '🔬' };
  const CAT_TONE = { 교내활동: 'leaf', 외부대회: 'lime', 연계사업: 'mint', 탐방: 'sand', 심화탐구: 'mint' };
  const CATS = ['교내활동', '외부대회', '연계사업', '탐방', '심화탐구'];
  const STATUSES = ['완료', '진행중', '기록대기'];
  const LINK_KINDS = { canva: 'Cv', sheet: 'Sh', drive: 'Dr', doc: 'Doc', photo: 'Img', etc: '↗' };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function blankActivity() {
    return {
      id: '', title: '', subtitle: '', tagline: '', category: '교내활동', departments: [], year: new Date().getFullYear(),
      period: '', status: '진행중', visibility: 'members', organizer: '', partner: '', team: '', members: [{ name: '', role: '' }], keywords: [], summary: '', award: '',
      report: {
        competency: '', abstract: '', background: '', goal: '',
        process: [{ step: '01', title: '', detail: '' }], metrics: [{ label: '', value: '', note: '' }],
        results: '', decisions: [], reflection: '', followup: '', references: [],
      },
      budget: { note: '', items: [], total: 0 },
      links: [],
    };
  }

  function normalize(a) {
    const b = blankActivity();
    const out = { ...b, ...a };
    out.report = { ...b.report, ...(a.report || {}) };
    ['process', 'metrics', 'decisions', 'references'].forEach((k) => { if (!Array.isArray(out.report[k])) out.report[k] = []; });
    out.budget = a.budget ? { note: '', items: [], total: 0, ...a.budget } : { note: '', items: [], total: 0 };
    ['members', 'keywords', 'departments', 'links'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    return out;
  }

  const slug = (s) => (s || 'activity').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  /* ---------------- data store ---------------- */
  const Store = {
    mode: 'local',
    sb: null,
    user: null,
    activities: [],
    contests: [],

    async init() {
      if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
        try {
          await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
          this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
          const { data } = await this.sb.auth.getSession();
          this.user = data.session?.user || null;
          this.sb.auth.onAuthStateChange((event, session) => {
            const before = this.user?.id;
            this.user = session?.user || null;
            updateAuthUI();
            // 로그인/로그아웃 시 보이는 기록이 달라지므로 다시 불러오기
            if (before !== this.user?.id && ['SIGNED_IN', 'SIGNED_OUT'].includes(event)) {
              this.profile = undefined;
              this.loadRemote().then(render).catch((e) => console.warn(e));
            }
          });
          await this.loadRemote();
          this.mode = 'supabase';
        } catch (err) {
          console.warn('[날샘] Supabase 연결 실패, 로컬 모드로 전환', err);
          this.sb = null;
          this.loadLocal();
        }
      } else {
        this.loadLocal();
      }
      updateAuthUI();
    },

    loadLocal() {
      const overrides = lsGet(LS_KEY, {});
      const base = SEED.activities.map((a) => normalize(overrides[a.id] ? overrides[a.id] : a));
      const extra = Object.values(overrides).filter((o) => !SEED.activities.some((a) => a.id === o.id)).map(normalize);
      this.activities = [...extra, ...base];
      this.contests = clone(SEED.contests);
      this.mode = 'local';
    },

    async loadRemote() {
      const [acts, cons] = await Promise.all([
        this.sb.from('activities').select('*').order('year', { ascending: false }).order('updated_at', { ascending: false }),
        this.sb.from('contests').select('*').order('name'),
      ]);
      if (acts.error) throw acts.error;
      if (cons.error) throw cons.error;
      // DB 모드에서는 시드를 섞지 않음: 권한(RLS)이 허락한 기록만 보여야 하므로
      this.activities = acts.data.map(normalize);
      this.contests = cons.data;
    },

    get(id) { return this.activities.find((a) => a.id === id); },

    isMember() {
      const dom = (CFG.WRITER_EMAIL_DOMAIN || '').toLowerCase();
      return !!this.user && (!dom || (this.user.email || '').toLowerCase().endsWith('@' + dom));
    },

    // 새 기록을 만들 수 있는가 (로컬 모드는 항상 가능)
    canWrite() { return this.mode === 'local' || this.isMember(); },

    // 이 기록을 고칠 수 있는가: 작성자 본인만
    canEdit(a) {
      if (this.mode === 'local') return true;
      return !!(a && this.user && a.created_by && a.created_by === this.user.id);
    },

    /* ----- 개인 정보: 본인만 (DB는 RLS, 로컬은 이 브라우저) ----- */
    async getProfile() {
      if (this.profile !== undefined) return this.profile;
      if (this.mode === 'local') return (this.profile = lsGet('naelsaem.profile.v1', {}));
      if (!this.user) return {};
      const { data, error } = await this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
      if (error) throw error;
      return (this.profile = data || {});
    },

    async saveProfile(p) {
      const row = { name: p.name || null, student_no: p.student_no || null, department: p.department || null, career: p.career || null };
      if (this.mode === 'local') { lsSet('naelsaem.profile.v1', row); this.profile = row; return; }
      if (!this.user) throw new Error('로그인해 주세요.');
      const { error } = await this.sb.from('profiles').upsert({ id: this.user.id, ...row });
      if (error) throw error;
      this.profile = { id: this.user.id, ...row };
    },

    async getPersonalReport(year) {
      if (this.mode === 'local') return lsGet(`naelsaem.personal.${year}`, null);
      if (!this.user) return null;
      const { data, error } = await this.sb.from('personal_reports').select('data').eq('user_id', this.user.id).eq('year', year).maybeSingle();
      if (error) throw error;
      return data?.data || null;
    },

    async savePersonalReport(year, report) {
      if (this.mode === 'local') { if (!lsSet(`naelsaem.personal.${year}`, report)) throw new Error('브라우저 저장소를 쓸 수 없어요.'); return; }
      if (!this.user) throw new Error('로그인해 주세요.');
      const { error } = await this.sb.from('personal_reports').upsert({ user_id: this.user.id, year, data: report }, { onConflict: 'user_id,year' });
      if (error) throw error;
    },

    async save(a) {
      const rec = normalize(clone(a));
      if (!rec.id) rec.id = `${slug(rec.title)}-${rec.year}-${Math.random().toString(36).slice(2, 6)}`;
      if (this.mode === 'supabase') {
        if (!this.canWrite()) throw new Error('학교 계정(@' + (CFG.WRITER_EMAIL_DOMAIN || '') + ')으로 로그인해야 저장할 수 있어요.');
        const row = { ...rec };
        delete row.created_at; delete row.updated_at; delete row.created_by;
        const { error } = await this.sb.from('activities').upsert(row);
        if (error) throw error;
        await this.loadRemote();
      } else {
        const overrides = lsGet(LS_KEY, {});
        overrides[rec.id] = rec;
        if (!lsSet(LS_KEY, overrides)) throw new Error('브라우저 저장소를 쓸 수 없어요. JSON 내보내기로 백업하세요.');
        this.loadLocal();
      }
      return rec.id;
    },

    async seedRemote() {
      if (this.mode !== 'supabase') throw new Error('Supabase가 연결되지 않았어요 (config.js).');
      if (!this.canWrite()) throw new Error('학교 계정으로 로그인해 주세요.');
      const acts = SEED.activities.map((a) => normalize(a));
      const r1 = await this.sb.from('activities').upsert(acts);
      if (r1.error) throw r1.error;
      const r2 = await this.sb.from('contests').upsert(SEED.contests);
      if (r2.error) throw r2.error;
      await this.loadRemote();
    },
  };

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('script load failed: ' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------------- auth UI ---------------- */
  function updateAuthUI() {
    const pill = $('#dbPill');
    const btn = $('#authBtn');
    if (Store.mode === 'supabase') {
      pill.textContent = 'Supabase';
      pill.classList.add('live');
      pill.title = 'Supabase 데이터베이스에 연결됨';
      btn.hidden = false;
      btn.textContent = Store.user ? (Store.user.email || '').split('@')[0] + ' · 로그아웃' : '로그인';
    } else {
      pill.textContent = '로컬 모드';
      pill.classList.remove('live');
      pill.title = 'config.js 에 Supabase를 연결하면 모두가 같은 DB를 봅니다';
      btn.hidden = true;
    }
  }

  function bindAuth() {
    const modal = $('#authModal');
    $('#authBtn').addEventListener('click', async () => {
      if (Store.user) { await Store.sb.auth.signOut(); toast('로그아웃했어요'); return; }
      modal.showModal();
      $('#authGoogle').focus();
    });
    // 학교 구글 계정 로그인 (메일 발송 없음 → 발송 한도와 무관)
    $('#authGoogle').addEventListener('click', async () => {
      const { error } = await Store.sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: location.origin + location.pathname,
          queryParams: { hd: CFG.WRITER_EMAIL_DOMAIN || '', prompt: 'select_account' },
        },
      });
      if (error) toast(/provider is not enabled|Unsupported provider/i.test(error.message) ? 'Google 로그인이 아직 설정되지 않았어요 (Supabase → Authentication → Providers)' : '로그인 실패: ' + error.message);
    });
    $('#authSend').addEventListener('click', async () => {
      const email = $('#authEmail').value.trim();
      const dom = CFG.WRITER_EMAIL_DOMAIN;
      if (!email) return;
      if (dom && !email.toLowerCase().endsWith('@' + dom)) { toast(`@${dom} 학교 메일만 쓸 수 있어요`); return; }
      const { error } = await Store.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) { toast('전송 실패: ' + error.message); return; }
      modal.close();
      toast('메일함에서 로그인 링크를 눌러주세요 📬');
    });
  }

  /* ---------------- router ---------------- */
  const routes = [
    [/^#?\/?$/, () => viewHome()],
    [/^#\/archive(\?.*)?$/, () => viewArchive()],
    [/^#\/a\/([^/]+)$/, (m) => viewDetail(decodeURIComponent(m[1]))],
    [/^#\/contests$/, () => viewContests()],
    [/^#\/report$/, () => viewTemplates()],
    [/^#\/write$/, () => viewReport(null)],
    [/^#\/write\/([^/]+)$/, (m) => viewReport(decodeURIComponent(m[1]))],
    [/^#\/report\/([^/]+)$/, (m) => viewReport(decodeURIComponent(m[1]))],
    [/^#\/me$/, () => viewMe()],
  ];

  function render() {
    const hash = location.hash || '#/';
    const app = $('#app');
    let html = null;
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) { html = fn(m); break; }
    }
    if (html == null) html = `<section class="wrap"><div class="empty">페이지를 찾을 수 없어요. <a class="tag" href="#/">홈으로</a></div></section>`;
    app.innerHTML = html;
    const key = hash.split('?')[0].split('/')[1] || 'home';
    $$('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.nav === ({ a: 'archive', write: 'archive' }[key] || key)));
    $('.nav-links').classList.remove('open');
    $('#burger').setAttribute('aria-expanded', 'false');
    afterRender(hash);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    observeReveal();
  }

  let io;
  function observeReveal() {
    io?.disconnect();
    io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    const vh = window.innerHeight;
    $$('.reveal:not(.in)').forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
      // 첫 화면에 보이는 요소는 바로 피어나게, 나머지는 스크롤할 때
      if (el.getBoundingClientRect().top < vh) requestAnimationFrame(() => el.classList.add('in'));
      else io.observe(el);
    });
  }

  function afterRender(hash) {
    if (hash.startsWith('#/archive')) bindArchive();
    if (hash.startsWith('#/a/')) bindDetail();
    if (hash === '#/report') bindTemplates();
    else if (hash.startsWith('#/write') || hash.startsWith('#/report/')) bindEditor();
    if (hash.startsWith('#/contests')) bindContests();
    if (hash.startsWith('#/me')) bindMe();
    bindRail();
    $$('[data-present]').forEach((b) => b.addEventListener('click', () => Deck.open(Store.get(b.dataset.present))));
    $$('[data-club-deck]').forEach((b) => b.addEventListener('click', () => Deck.show(buildClubSlides())));
    $$('[data-login]').forEach((b) => b.addEventListener('click', () => $('#authBtn').click()));
  }

  /* ---------------- shared bits ---------------- */
  const VIS = {
    public: { icon: '🌍', label: '전체 공개', desc: '로그인하지 않은 방문자도 볼 수 있어요' },
    members: { icon: '🌿', label: '부원 공개', desc: '@dshs.kr로 로그인한 부원만 볼 수 있어요' },
    private: { icon: '🔒', label: '나만 보기', desc: '작성한 나만 볼 수 있어요' },
  };
  const visChip = (v) => { const x = VIS[v] || VIS.members; return `<span class="chip vis-${esc(v || 'members')}" title="${esc(x.desc)}">${x.icon} ${x.label}</span>`; };
  // 부서별로 기록을 구분하지 않음 (부서 정보는 표시하지 않음)
  const catChip = (c) => `<span class="chip tone-${CAT_TONE[c] || 'leaf'}">${CAT_ICON[c] || ''} ${esc(c)}</span>`;
  const deptDots = () => '';
  const statusChip = (s) => `<span class="chip status-${esc(s)}">${esc(s)}</span>`;
  const leafSvg = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6C18 18 12 30 12 40a20 20 0 0 0 40 0C52 30 46 18 32 6z"/><path class="vein" d="M32 22v32M32 36l-8-6M32 44l9-7"/></svg>`;

  function card(a) {
    const tone = CAT_TONE[a.category] || 'leaf';
    return `
      <a class="a-card reveal" href="#/a/${encodeURIComponent(a.id)}">
        <div class="a-card-top tone-${tone}">
          <span class="cat">${esc(a.category)} · ${esc(a.year)}</span>
          <span class="leaf" aria-hidden="true">${CAT_ICON[a.category] || '🌿'}</span>
        </div>
        <div class="a-card-body">
          <h3>${esc(a.title)}</h3>
          ${a.subtitle ? `<div class="sub">${esc(a.subtitle)}</div>` : ''}
          <p>${esc(a.summary)}</p>
          <div class="a-card-foot">${statusChip(a.status)}${Store.mode === 'supabase' ? visChip(a.visibility) : ''}${a.links?.length ? `<span class="chip">자료 ${a.links.length}</span>` : ''}${deptDots(a.departments)}</div>
        </div>
      </a>`;
  }

  /* ---------------- view: home ---------------- */
  function viewHome() {
    const acts = Store.activities;
    const done = acts.filter((a) => a.status === '완료').length;
    const ext = acts.filter((a) => ['외부대회', '연계사업'].includes(a.category)).length;
    const feat = Store.get('startupcycling-2026-coffeeshield') || acts.find((a) => a.status === '완료');
    const kws = [...new Set(acts.flatMap((a) => a.keywords || []))];
    const kwRow = kws.map((k) => `<span class="chip">${esc(k)}</span>`).join('');
    const openContests = SEED.contests.filter((c) => ['open', 'soon'].includes(contestStatus(c).kind)).length;
    const locked = Store.mode === 'supabase' && !Store.isMember();
    const chap = (n, title) => `<div class="chapter reveal" aria-hidden="true"><span class="ch-no">${n}</span><span class="ch-line"></span><span class="ch-title">${esc(title)}</span></div>`;

    return `
    <nav class="rail" aria-label="챕터 이동">
      ${[['00', '표지'], ['01', '부서'], ['02', '대표 기록'], ['03', '성장 기록'], ['04', '함께 쓰기']].map(([n, t]) => `<button type="button" data-rail="ch-${n}" title="${t}"><i></i><span>${n} ${t}</span></button>`).join('')}
    </nav>

    <section class="hero wrap" id="ch-00" data-chapter>
      <div class="hero-grid">
        <div>
          <span class="eyebrow reveal"><i></i>대전대신고 환경·생태 동아리 · ${esc(SEED.club.year)}</span>
          <h1 class="reveal">자라나는 기록,<br><span class="hl">함께 쌓는 숲</span> <span class="serif">nalssam.</span></h1>
          <p class="hero-lead reveal">날샘의 활동 보고서, 외부 대회 경험, 학습지와 사진을 한곳에 모았어요. 한 해의 기록이 다음 기수의 출발점이 됩니다.</p>
          <div class="hero-cta reveal">
            <a class="btn btn-primary" href="#/archive">활동 기록 보기 <span class="arr">→</span></a>
            <button class="btn btn-ghost" type="button" data-club-deck>▶ 날샘 소개 발표</button>
          </div>
          <div class="hero-stats reveal">
            <a class="stat" href="#/archive"><b>${acts.length}</b><span>아카이브 기록</span></a>
            <a class="stat" href="#/contests"><b>${SEED.contests.length}</b><span>대회 정보${openContests ? ` · ${openContests}곳 곧 열림` : ''}</span></a>
            <a class="stat" href="#/report"><b>5</b><span>보고서 양식 형식</span></a>
          </div>
        </div>
        <div class="hero-visual reveal" aria-hidden="true">
          <div class="blob"></div>
          <div class="sheet">
            <div class="sheet-top"><span class="sheet-num">1</span><span class="sheet-title">폐자원 분석</span></div>
            <div class="sheet-lines"><i></i><i></i><i></i></div>
            <div class="sheet-meta"><span class="chip tone-lime">🏆 외부대회</span><span class="chip tone-mint">업사이클링</span></div>
          </div>
          <div class="sheet">
            <div class="sheet-top"><span class="sheet-num">5</span><span class="sheet-title">결과</span></div>
            <div class="sheet-big">100<small style="font-size:18px">g</small></div>
            <div class="muted" style="font-size:13px">타일 1장에 들어간 커피박</div>
          </div>
          <div class="sheet">
            <div class="sheet-top"><span class="sheet-num">4</span><span class="sheet-title">진행 과정</span></div>
            <div class="sheet-lines"><i></i><i></i><i></i></div>
            <div class="sheet-meta"><span class="chip status-완료">완료</span><span class="chip">자료 9</span></div>
          </div>
        </div>
      </div>
    </section>

    <div class="marquee" aria-label="올해의 키워드"><div class="marquee-track">${kwRow}${kwRow}</div></div>

    <section class="wrap" id="ch-01" data-chapter>
      ${chap('01', 'Departments')}
      <div class="sec-head">
        <div><span class="eyebrow reveal"><i></i>세 개의 부서</span><h2 class="reveal">하나의 숲, 세 갈래의 뿌리</h2></div>
        <p class="reveal">기계와 생명과 물질. 서로 다른 시선으로 같은 환경 문제를 들여다봐요.</p>
      </div>
      <div class="dept-grid">
        ${SEED.club.departments.map((d) => `
          <div class="dept tone-${d.tone} reveal">
            <span class="dept-orb"></span>
            <h3>${esc(d.key)}</h3><span class="en">${esc(d.en)}</span>
            <p>${esc(d.desc)}</p>
          </div>`).join('')}
      </div>
    </section>

    ${feat ? `
    <section class="wrap" id="ch-02" data-chapter>
      ${chap('02', 'Featured')}
      <div class="feature reveal">
        <div class="feature-copy">
          <span class="chip">${esc(feat.category)} · 보고서 예시</span>
          <h3>${esc(feat.subtitle || feat.title)}</h3>
          <p>${esc(feat.tagline || feat.summary)}</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${(feat.keywords || []).slice(0, 4).map((k) => `<span class="chip">#${esc(k)}</span>`).join('')}</div>
          <div class="hero-cta" style="margin-top:8px">
            <a class="btn btn-lime" href="#/a/${encodeURIComponent(feat.id)}">기록 열기 <span class="arr">→</span></a>
            <button class="btn btn-ghost" style="color:#E3F3C8;border-color:rgba(255,255,255,.25)" type="button" data-present="${esc(feat.id)}">▶ 발표 모드</button>
          </div>
        </div>
        <div class="feature-art" aria-hidden="true">
          <div class="tile"></div><span class="flame">🔥</span>
          <span class="tile-label">coffee shield.</span>
        </div>
      </div>
    </section>` : `
    <section class="wrap" id="ch-02" data-chapter>
      ${chap('02', 'Featured')}
      <div class="locked reveal">
        <span class="locked-ic">🌿</span>
        <div><h3>대표 기록은 부원에게 먼저 열려요</h3><p>팀 보고서에는 친구들 이름과 학습지가 들어 있어서, 작성자가 공개 범위를 정해요. 학교 메일로 로그인하면 부원 공개 기록이 보여요.</p></div>
        ${locked ? `<button class="btn btn-primary" type="button" data-login>부원 로그인</button>` : ''}
      </div>
    </section>`}

    <section class="wrap" id="ch-03" data-chapter>
      ${chap('03', 'Growth Log')}
      <div class="sec-head">
        <div><span class="eyebrow reveal"><i></i>${esc(SEED.club.year)} 성장 기록</span><h2 class="reveal">한 해 동안 뻗어 나간 줄기</h2></div>
        <a class="btn btn-soft reveal" href="#/archive">전체 보기 <span class="arr">→</span></a>
      </div>
      <div class="vine">
        ${acts.length ? acts.map((a) => `
          <a class="vine-item reveal ${a.status === '기록대기' ? 'wait' : ''}" href="#/a/${encodeURIComponent(a.id)}">
            <div><h4>${esc(a.title)}</h4><p>${esc(a.subtitle || a.summary)}</p></div>
            <div class="vine-meta">${catChip(a.category)}${statusChip(a.status)}</div>
          </a>`).join('') : `<div class="vine-item wait reveal"><div><h4>아직 볼 수 있는 기록이 없어요</h4><p>${locked ? '부원 공개 기록은 로그인 후에 보여요.' : '[보고서 양식]에서 첫 기록을 남겨보세요.'}</p></div></div>`}
      </div>
    </section>

    <section class="wrap" id="ch-04" data-chapter>
      ${chap('04', 'Write Together')}
      <div class="join reveal">
        <div>
          <h2>기록은 각자, 숲은 함께.</h2>
          <p>관리자는 없어요. 모두가 개인 사용자로 로그인해서 자기 기록을 쓰고, 공개 범위를 직접 정해요. 학번 · 진로 · 개인 연간 보고서는 본인만 볼 수 있어요.</p>
        </div>
        <div class="join-steps">
          <div><b>1</b><span>학교 메일로 로그인</span></div>
          <div><b>2</b><span>[내 기록]에서 프로필 · 개인 보고서 작성</span></div>
          <div><b>3</b><span>[보고서 양식]으로 팀 기록 남기기</span></div>
        </div>
        <div class="hero-cta">
          ${Store.mode === 'supabase' && !Store.user ? `<button class="btn btn-primary" type="button" data-login>로그인하기</button>` : `<a class="btn btn-primary" href="#/me">내 기록으로 <span class="arr">→</span></a>`}
          <a class="btn btn-ghost" href="#/report">보고서 양식 열기</a>
        </div>
      </div>
    </section>`;
  }

  /* 홈 챕터 레일: 지금 보고 있는 챕터 표시 */
  let railIO;
  function bindRail() {
    railIO?.disconnect();
    const btns = $$('[data-rail]');
    if (!btns.length) return;
    btns.forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.rail)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    railIO = new IntersectionObserver((ents) => ents.forEach((e) => {
      if (e.isIntersecting) btns.forEach((b) => b.classList.toggle('on', b.dataset.rail === e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    $$('[data-chapter]').forEach((s) => railIO.observe(s));
  }

  /* ---------------- 공통: 페이지 머리 ---------------- */
  const phead = ({ crumb, title, count, desc, actions = '' }) => `
    <header class="phead wrap">
      <div class="phead-main">
        <nav class="crumb" aria-label="위치"><a href="#/">홈</a><span>/</span>${esc(crumb)}</nav>
        <h1>${esc(title)}${count != null ? ` <span class="count">${count}</span>` : ''}</h1>
        ${desc ? `<p>${desc}</p>` : ''}
      </div>
      ${actions ? `<div class="phead-actions">${actions}</div>` : ''}
    </header>`;

  const STATUS_DOT = { 완료: 'done', 진행중: 'doing', 기록대기: 'wait' };
  const statusDot = (s) => `<span class="sdot ${STATUS_DOT[s] || 'wait'}">${esc(s)}</span>`;
  const visIcon = (v) => (Store.mode === 'supabase' ? `<span class="vis-ic" title="${esc((VIS[v] || VIS.members).label)}">${(VIS[v] || VIS.members).icon}</span>` : '');

  /* ---------------- view: archive (Notion 데이터베이스 스타일) ---------------- */
  const archiveState = { q: '', cat: '전체', sort: 'recent', view: lsGet('nalssam.archive.view', 'gallery') };

  function viewArchive() {
    const acts = Store.activities;
    const n = (c) => (c === '전체' ? acts.length : acts.filter((a) => a.category === c).length);
    return `
      ${phead({ crumb: '활동 기록', title: '활동 기록', count: acts.length, desc: '대회 · 연계사업 · 교내 활동의 팀 기록을 모아두는 데이터베이스예요. 카드를 열면 요약 · 과정 · 결과 · 자료를 한 페이지에서 볼 수 있어요.', actions: `<a class="btn btn-primary" href="#/write">＋ 새 기록</a>` })}
      <div class="wrap">
        <div class="dbbar">
          <div class="seg" role="tablist" aria-label="분류">
            ${['전체', ...CATS].map((c) => `<button type="button" role="tab" data-cat="${esc(c)}" aria-selected="${archiveState.cat === c}">${esc(c)}<span class="seg-n">${n(c)}</span></button>`).join('')}
          </div>
          <div class="dbbar-right">
            <label class="search sm"><span class="sr-only">검색</span>
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input class="input" id="q" type="search" placeholder="제목 · 키워드 · 팀 검색" value="${esc(archiveState.q)}" />
            </label>
            <select class="select sm" id="sort" aria-label="정렬">
              <option value="recent" ${archiveState.sort === 'recent' ? 'selected' : ''}>최신순</option>
              <option value="title" ${archiveState.sort === 'title' ? 'selected' : ''}>이름순</option>
            </select>
            <div class="viewtoggle" role="group" aria-label="보기 방식">
              <button type="button" data-view="gallery" aria-pressed="${archiveState.view === 'gallery'}" title="갤러리"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg></button>
              <button type="button" data-view="list" aria-pressed="${archiveState.view === 'list'}" title="리스트"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="3" rx="1.5"/><rect x="3" y="10.5" width="18" height="3" rx="1.5"/><rect x="3" y="17" width="18" height="3" rx="1.5"/></svg></button>
            </div>
          </div>
        </div>
        <div id="grid"></div>
      </div>`;
  }

  function gCard(a) {
    const tone = CAT_TONE[a.category] || 'leaf';
    return `
      <a class="g-card reveal" href="#/a/${encodeURIComponent(a.id)}">
        <div class="g-cover tone-${tone}"><span class="g-cat">${esc(a.category)}</span></div>
        <div class="g-icon" aria-hidden="true">${CAT_ICON[a.category] || '🌿'}</div>
        <div class="g-body">
          <h3>${esc(a.subtitle || a.title)}</h3>
          <p class="g-sub">${esc(a.subtitle ? a.title : (a.tagline || ''))}</p>
          <p class="g-sum">${esc(a.tagline || a.summary)}</p>
          <div class="g-meta">${statusDot(a.status)}<span>${esc(a.year)}</span>${a.links?.length ? `<span>자료 ${a.links.length}</span>` : ''}${visIcon(a.visibility)}</div>
        </div>
      </a>`;
  }

  function lRow(a) {
    return `
      <a class="l-row" href="#/a/${encodeURIComponent(a.id)}">
        <span class="l-ic" aria-hidden="true">${CAT_ICON[a.category] || '🌿'}</span>
        <span class="l-title"><b>${esc(a.subtitle || a.title)}</b><small>${esc(a.subtitle ? a.title : (a.tagline || ''))}</small></span>
        <span class="l-cat">${esc(a.category)}</span>
        <span>${statusDot(a.status)}</span>
        <span class="l-year">${esc(a.year)}</span>
        <span class="l-vis">${visIcon(a.visibility)}</span>
      </a>`;
  }

  function bindArchive() {
    const grid = $('#grid');
    const draw = () => {
      const q = archiveState.q.trim().toLowerCase();
      let list = Store.activities.filter((a) => {
        if (archiveState.cat !== '전체' && a.category !== archiveState.cat) return false;
        if (!q) return true;
        return [a.title, a.subtitle, a.tagline, a.summary, a.team, ...(a.keywords || [])].join(' ').toLowerCase().includes(q);
      });
      list = [...list].sort((x, y) => (archiveState.sort === 'title'
        ? String(x.subtitle || x.title).localeCompare(String(y.subtitle || y.title), 'ko')
        : (y.year - x.year) || String(y.updated_at || '').localeCompare(String(x.updated_at || ''))));
      const locked = Store.mode === 'supabase' && !Store.isMember();
      const lockNote = locked ? `<div class="locked reveal"><span class="locked-ic">🔐</span><div><h3>부원 공개 기록은 로그인 후에 보여요</h3><p>지금은 ‘전체 공개’ 기록만 보이고 있어요.</p></div><button class="btn btn-primary" type="button" data-login>부원 로그인</button></div>` : '';
      const empty = `<div class="empty-state reveal">${leafSvg}<h3>${q || archiveState.cat !== '전체' ? '조건에 맞는 기록이 없어요' : '아직 기록이 없어요'}</h3><p>${locked ? '로그인하면 부원 공개 기록까지 볼 수 있어요.' : '첫 번째 팀 기록을 남겨보세요.'}</p><a class="btn btn-soft" href="#/write">＋ 새 기록</a></div>`;
      if (!list.length) grid.innerHTML = empty + lockNote;
      else if (archiveState.view === 'list') grid.innerHTML = `<div class="l-table"><div class="l-head"><span></span><span>제목</span><span>분류</span><span>상태</span><span>연도</span><span></span></div>${list.map(lRow).join('')}</div>${lockNote}`;
      else grid.innerHTML = `<div class="g-grid">${list.map(gCard).join('')}</div>${lockNote}`;
      $$('[data-login]', grid).forEach((b) => b.addEventListener('click', () => $('#authBtn').click()));
      observeReveal();
    };
    $('#q').addEventListener('input', (e) => { archiveState.q = e.target.value; draw(); });
    $('#sort').addEventListener('change', (e) => { archiveState.sort = e.target.value; draw(); });
    $$('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      archiveState.cat = b.dataset.cat;
      $$('[data-cat]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    }));
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      archiveState.view = b.dataset.view; lsSet('nalssam.archive.view', archiveState.view);
      $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }));
    draw();
  }

  /* ---------------- view: detail (Notion 페이지 스타일) ---------------- */
  function viewDetail(id) {
    const a = Store.get(id);
    if (!a) return `${phead({ crumb: '활동 기록', title: '기록을 찾을 수 없어요', desc: '삭제됐거나, 볼 수 있는 권한이 없는 기록이에요. 부원 공개 기록이라면 로그인해 보세요.' })}<div class="wrap"><a class="btn btn-soft" href="#/archive">← 목록으로</a></div>`;
    const r = a.report || {};
    const members = (a.members || []).filter((m) => m.name);
    const procs = (r.process || []).filter((p) => p.title);
    const mets = (r.metrics || []).filter((m) => m.value);
    const decs = (r.decisions || []).filter((d) => d.from || d.to);
    const has = (t) => !!(t && String(t).trim());
    const sections = [
      ['sum', '요약', has(r.abstract) || has(a.summary)],
      ['num', '숫자로 보기', mets.length > 0],
      ['bg', '배경 · 목표', has(r.background) || has(r.goal)],
      ['proc', '진행 과정', procs.length > 0],
      ['dec', '의사결정 기록', decs.length > 0],
      ['res', '결과 · 고찰', has(r.results) || has(r.reflection)],
      ['budget', '예산', !!a.budget?.items?.length],
      ['files', '자료', (a.links || []).length > 0],
      ['paper', '요약서 미리보기', true],
    ].filter((s) => s[2]);
    const prop = (k, v) => (v ? `<div class="prop"><dt>${k}</dt><dd>${v}</dd></div>` : '');
    const prose = (t) => `<div class="prose-doc">${esc(t).split('\n').map((l) => (/^[•\-]\s*/.test(l) ? `<li>${l.replace(/^[•\-]\s*/, '')}</li>` : (l.trim() ? `<p>${l}</p>` : ''))).join('').replace(/(<li>.*?<\/li>)+/gs, (m) => `<ul>${m}</ul>`)}</div>`;

    return `
      <div class="doc">
        <div class="doc-cover tone-${CAT_TONE[a.category] || 'leaf'}" aria-hidden="true"></div>
        <div class="wrap doc-wrap">
          <div class="doc-icon" aria-hidden="true">${CAT_ICON[a.category] || '🌿'}</div>
          <nav class="crumb" aria-label="위치"><a href="#/">홈</a><span>/</span><a href="#/archive">활동 기록</a><span>/</span>${esc(a.category)}</nav>
          <h1 class="doc-title">${esc(a.subtitle || a.title)}</h1>
          <p class="doc-lead">${esc(a.subtitle ? a.title : '')}${a.subtitle && a.tagline ? ' — ' : ''}${esc(a.tagline || '')}</p>
          <div class="doc-actions">
            <button class="btn btn-primary btn-sm" type="button" data-present="${esc(a.id)}">▶ 발표 모드</button>
            ${Store.canEdit(a) ? `<a class="btn btn-ghost btn-sm" href="#/write/${encodeURIComponent(a.id)}">✎ 편집</a>` : `<span class="hint-chip" title="기록은 작성자 본인만 고칠 수 있어요">✎ 작성자만 수정 가능</span>`}
            <button class="btn btn-ghost btn-sm" type="button" data-print-paper>요약서 PDF</button>
          </div>
          <dl class="props">
            ${prop('분류', esc(a.category))}
            ${prop('상태', statusDot(a.status))}
            ${Store.mode === 'supabase' ? prop('공개 범위', visChip(a.visibility)) : ''}
            ${prop('기간', esc(a.period || a.year))}
            ${prop('주관 · 협력', esc([a.organizer, a.partner].filter(Boolean).join(' / ')))}
            ${prop('팀', esc(a.team))}
            ${prop('구성원', members.map((m) => `<span class="person"><i>${esc(m.name.slice(-2))}</i>${esc(m.name)}<small>${esc(m.role)}</small></span>`).join(''))}
            ${prop('예산', a.budget?.total ? `${won(a.budget.total)}원` : '')}
            ${prop('수상', esc(a.award))}
            ${prop('키워드', (a.keywords || []).map((k) => `<span class="kw">#${esc(k)}</span>`).join(''))}
          </dl>

          <div class="doc-grid">
            <aside class="toc" aria-label="이 페이지 목차">
              <div class="toc-title">이 페이지</div>
              ${sections.map(([sid, label]) => `<button type="button" data-toc="${sid}">${label}</button>`).join('')}
            </aside>
            <article class="doc-body">
              ${has(r.abstract) || has(a.summary) ? `<section id="s-sum"><h2>요약</h2>${prose(r.abstract || a.summary)}${r.competency ? `<p class="callout"><b>드러내고 싶은 역량</b> ${esc(r.competency)}</p>` : ''}</section>` : ''}
              ${mets.length ? `<section id="s-num"><h2>숫자로 보기</h2><div class="stat-grid">${mets.map((m) => `<div class="stat-tile"><span>${esc(m.label)}</span><b>${esc(m.value)}</b>${m.note ? `<small>${esc(m.note)}</small>` : ''}</div>`).join('')}</div></section>` : ''}
              ${has(r.background) || has(r.goal) ? `<section id="s-bg"><h2>배경 · 목표</h2>${has(r.background) ? `<h3>왜 이 문제인가</h3>${prose(r.background)}` : ''}${has(r.goal) ? `<h3>가설과 목표</h3>${prose(r.goal)}` : ''}</section>` : ''}
              ${procs.length ? `<section id="s-proc"><h2>진행 과정</h2><ol class="timeline">${procs.map((p) => `<li><span class="tl-n">${esc(p.step)}</span><div><b>${esc(p.title)}</b><p>${esc(p.detail || '')}</p></div></li>`).join('')}</ol></section>` : ''}
              ${decs.length ? `<section id="s-dec"><h2>의사결정 기록</h2>${decs.map((d) => `<div class="decision2"><div class="d-from">${esc(d.from)}</div><div class="d-arrow">→</div><div class="d-to">${esc(d.to)}</div><p class="d-why">${esc(d.reason)}</p></div>`).join('')}</section>` : ''}
              ${has(r.results) || has(r.reflection) ? `<section id="s-res"><h2>결과 · 고찰</h2>${has(r.results) ? `<h3>결과 및 산출물</h3>${prose(r.results)}` : ''}${has(r.reflection) ? `<h3>성장과 한계</h3>${prose(r.reflection)}` : ''}${has(r.followup) ? `<h3>다음 단계</h3>${prose(r.followup)}` : ''}</section>` : ''}
              ${a.budget?.items?.length ? `<section id="s-budget"><h2>예산</h2>${budgetPanel(a.budget)}</section>` : ''}
              ${(a.links || []).length ? `<section id="s-files"><h2>자료</h2>${linkList(a.links)}</section>` : ''}
              <section id="s-paper"><h2>요약서 미리보기</h2>
                <p class="muted">이 기록을 A4 한 장 분량 요약서로 정리한 거예요. 대회 제출용 정식 보고서는 <a class="tag" href="#/report">보고서 양식</a>을 내려받아 쓰세요.</p>
                <div class="inline-actions no-print">
                  <button class="btn btn-soft btn-sm" type="button" data-print-paper>🖨 인쇄 / PDF</button>
                  <button class="btn btn-ghost btn-sm" type="button" data-tex="${esc(a.id)}">.tex 내려받기</button>
                  <button class="btn btn-ghost btn-sm" type="button" data-overleaf="${esc(a.id)}">Overleaf에서 열기 ↗</button>
                </div>
                <div class="paper-wrap">${renderPaper(a)}</div>
              </section>
            </article>
          </div>
        </div>
      </div>`;
  }

  const linkList = (links) => `<div class="links">${links.map((l) => `
      <a class="link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">
        <span class="ico ${esc(l.kind || 'etc')}">${LINK_KINDS[l.kind] || '↗'}</span><span class="link-t"><b>${esc(l.label)}</b><small>${esc(hostOf(l.url))}</small></span><span class="go">↗</span>
      </a>`).join('')}</div>`;

  // 한글 도메인(퓨니코드)은 사람이 읽을 수 있게 표시
  const IDN = { 'xn--289a5d925ap8c64jnzlpiz.kr': '환경사랑공모전.kr' };
  function hostOf(u) { try { const h = new URL(u).hostname.replace(/^www\./, ''); return IDN[h] || h; } catch { return ''; } }

  function budgetPanel(b) {
    const total = b.total || b.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const palette = ['#1F6B2C', '#2F8A3B', '#5FB236', '#86C93F', '#AEDD62', '#CDEB9B', '#43B596', '#8FD9C0', '#B6D93A', '#DDF28A', '#3F5A44', '#6E8571', '#A3B5A5'];
    const sorted = [...b.items].sort((x, y) => y.total - x.total);
    return `
      <div class="budget-head"><b>${won(total)}원</b><span class="muted">${b.items.length}개 품목${b.note ? ` · ${esc(b.note)}` : ''}</span></div>
      <div class="budget-bar" role="img" aria-label="품목별 비중">${sorted.map((i, k) => `<i style="width:${(i.total / total) * 100}%;background:${palette[k % palette.length]}" title="${esc(i.name)} ${won(i.total)}원"></i>`).join('')}</div>
      <div class="table-scroll"><table class="t">
        <thead><tr><th>품목</th><th>구입 목적</th><th class="num">단가</th><th class="num">수량</th><th class="num">합계</th></tr></thead>
        <tbody>${b.items.map((i) => `<tr><td><b>${esc(i.name)}</b></td><td class="muted">${esc(i.purpose)}</td><td class="num">${won(i.unit)}</td><td class="num">${esc(i.qty)}</td><td class="num">${won(i.total)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">소계</td><td class="num">${won(total)}원</td></tr></tfoot>
      </table></div>`;
  }

  let tocIO;
  function bindDetail() {
    $$('[data-tex]').forEach((b) => b.addEventListener('click', () => downloadTex(Store.get(b.dataset.tex))));
    $$('[data-overleaf]').forEach((b) => b.addEventListener('click', () => openOverleaf(Store.get(b.dataset.overleaf))));
    $$('[data-print-paper]').forEach((b) => b.addEventListener('click', () => { document.body.classList.add('print-paper'); window.print(); setTimeout(() => document.body.classList.remove('print-paper'), 500); }));
    const btns = $$('[data-toc]');
    btns.forEach((b) => b.addEventListener('click', () => $(`#s-${b.dataset.toc}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    tocIO?.disconnect();
    tocIO = new IntersectionObserver((ents) => ents.forEach((e) => {
      if (e.isIntersecting) btns.forEach((b) => b.classList.toggle('on', `s-${b.dataset.toc}` === e.target.id));
    }), { rootMargin: '-30% 0px -60% 0px' });
    $$('.doc-body > section').forEach((s) => tocIO.observe(s));
  }

  /* ---------------- view: contests (대회 디렉터리) ---------------- */
  const contestState = { tab: 'all', field: '전체', q: '' };
  const DAY = 864e5;
  const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  function contestStatus(c, now = new Date()) {
    if (!c.apply || !c.apply.length || !c.last) return { kind: 'record', big: String(c.history?.[0]?.year || '—'), small: c.history?.length ? '우리 동아리 참가' : '공개 접수처 없음' };
    const s = new Date(`${c.last.start}T00:00:00`);
    const e = new Date(`${c.last.end}T23:59:59`);
    if (now >= s && now <= e) { const d = Math.ceil((e - now) / DAY); return { kind: 'open', big: d === 0 ? 'D-DAY' : `D-${d}`, small: `${fmtDate(e)} 마감`, days: d }; }
    if (now < s) { const d = Math.ceil((s - now) / DAY); return { kind: 'soon', big: `D-${d}`, small: `${fmtDate(s)} 접수 시작`, days: d }; }
    const ns = new Date(s);
    while (ns <= now) ns.setFullYear(ns.getFullYear() + 1);
    const d = Math.ceil((ns - now) / DAY);
    return { kind: d <= 90 ? 'soon' : 'next', big: `${ns.getFullYear()}.${ns.getMonth() + 1}월`, small: `다음 회차 예상 · ${c.last.label} ${fmtDate(s).slice(5)}~${fmtDate(e).slice(5)}`, days: d };
  }
  const CK_SEARCH = (name) => `https://www.contestkorea.com/sub/list.php?int_gbn=1&Txt_sGn=1&Txt_key=all&Txt_word=${encodeURIComponent(name)}`;
  const APPLY_LABEL = { official: '공식', notice: '공고', lastyear: '작년 공고', contestkorea: '콘테스트코리아' };

  function allContests() {
    const extra = (Store.mode === 'supabase' ? Store.contests : []).filter((c) => !SEED.contests.some((s) => s.id === c.id))
      .map((c) => ({ apply: c.url ? [{ kind: 'official', label: '공식 사이트', url: c.url }] : [], field: c.field || [], history: c.history || [], tips: c.tips || [], ...c }));
    return [...SEED.contests, ...extra].map((c) => ({ ...c, st: contestStatus(c) }));
  }

  function viewContests() {
    const list = allContests();
    const cnt = (k) => list.filter((c) => (k === 'ours' ? c.history?.length : c.st.kind === k)).length;
    const fields = [...new Set(list.flatMap((c) => c.field || []))];
    const tabs = [['all', '전체', list.length], ['open', '접수 중', cnt('open')], ['soon', '곧 열림 · 90일 내', cnt('soon')], ['next', '다음 회차 준비', cnt('next')], ['ours', '우리가 참가한', cnt('ours')]];
    return `
      ${phead({ crumb: '대회 아카이브', title: '대회 아카이브', count: list.length, desc: '환경 · 과학 · 탐구 분야 고등학생 대회를 모았어요. <b>공식 접수처가 있으면 공식 사이트로, 폼·이메일 접수면 공고 페이지로</b> 바로 연결돼요. 올해 공고가 아직 없으면 작년 접수 기간으로 다음 회차를 미리 알려드려요.' })}
      <div class="wrap">
        <div class="notice-bar">📌 2026.11.20 조사 기준이에요. 일정·요강은 해마다 바뀌니, 접수 전 반드시 공식 공고를 확인하세요.</div>
        <div class="dbbar">
          <div class="seg" role="tablist" aria-label="접수 상태">
            ${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-ctab="${k}" aria-selected="${contestState.tab === k}">${l}<span class="seg-n">${n}</span></button>`).join('')}
          </div>
          <div class="dbbar-right">
            <label class="search sm"><span class="sr-only">검색</span>
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input class="input" id="cq" type="search" placeholder="대회명 · 약칭 · 주최 검색" value="${esc(contestState.q)}" />
            </label>
          </div>
        </div>
        <div class="chips-row">${['전체', ...fields].map((f) => `<button type="button" class="fchip" data-field="${esc(f)}" aria-pressed="${contestState.field === f}">${esc(f)}</button>`).join('')}</div>
        <div id="clist" class="c-list"></div>
      </div>`;
  }

  function cCard(c) {
    const st = c.st;
    const [primary, ...rest] = c.apply || [];
    return `
      <article class="c-card reveal kind-${st.kind}">
        <div class="c-date">
          <span class="c-badge">${{ open: '접수 중', soon: '곧 열림', next: '다음 회차', record: '참가 기록' }[st.kind]}</span>
          <b>${esc(st.big)}</b>
          <small>${esc(st.small)}</small>
        </div>
        <div class="c-main">
          <div class="c-title"><h3>${esc(c.name)}</h3>${c.alias ? `<span class="alias">${esc(c.alias)}</span>` : ''}</div>
          <div class="c-host">${esc(c.host || '')}</div>
          <dl class="c-facts">
            ${c.target ? `<div><dt>대상</dt><dd>${esc(c.target)}</dd></div>` : ''}
            ${c.format ? `<div><dt>방식</dt><dd>${esc(c.format)}</dd></div>` : ''}
          </dl>
          ${c.note ? `<p class="c-note">${esc(c.note)}</p>` : ''}
          <div class="c-tags">${(c.field || []).map((f) => `<span>${esc(f)}</span>`).join('')}</div>
          ${c.history?.length ? `<div class="c-hist">${c.history.map((h) => `<a href="#/a/${encodeURIComponent(h.activity)}">🌿 ${esc(h.year)} · ${esc(h.result)} →</a>`).join('')}</div>` : ''}
          ${c.tips?.length ? `<details class="c-tips"><summary>선배 노하우 ${c.tips.length}개</summary><ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
        </div>
        <div class="c-apply">
          ${primary ? `<a class="apply-main" href="${esc(safeUrl(primary.url))}" target="_blank" rel="noopener noreferrer"><span>${esc(primary.label)}</span><small>${esc(hostOf(primary.url))} ↗</small></a>` : '<span class="muted" style="font-size:13px">공개 접수처 없음</span>'}
          ${rest.map((x) => `<a class="apply-sub" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer"><i>${APPLY_LABEL[x.kind] || '링크'}</i>${esc(x.label)} ↗</a>`).join('')}
          ${c.apply?.length ? `<a class="apply-sub" href="${esc(CK_SEARCH(c.name))}" target="_blank" rel="noopener noreferrer"><i>검색</i>콘테스트코리아에서 찾기 ↗</a>` : ''}
        </div>
      </article>`;
  }

  function bindContests() {
    const box = $('#clist');
    const draw = () => {
      const q = contestState.q.trim().toLowerCase();
      const order = { open: 0, soon: 1, next: 2, record: 3 };
      const list = allContests().filter((c) => {
        if (contestState.tab === 'ours' && !c.history?.length) return false;
        if (!['all', 'ours'].includes(contestState.tab) && c.st.kind !== contestState.tab) return false;
        if (contestState.field !== '전체' && !(c.field || []).includes(contestState.field)) return false;
        if (q && ![c.name, c.alias, c.host, ...(c.field || [])].join(' ').toLowerCase().includes(q)) return false;
        return true;
      }).sort((x, y) => (order[x.st.kind] - order[y.st.kind]) || ((x.st.days ?? 9e9) - (y.st.days ?? 9e9)));
      box.innerHTML = list.length ? list.map(cCard).join('') : `<div class="empty-state">${leafSvg}<h3>조건에 맞는 대회가 없어요</h3><p>다른 상태나 분야를 골라보세요.</p></div>`;
      observeReveal();
    };
    $$('[data-ctab]').forEach((b) => b.addEventListener('click', () => { contestState.tab = b.dataset.ctab; $$('[data-ctab]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); draw(); }));
    $$('[data-field]').forEach((b) => b.addEventListener('click', () => { contestState.field = b.dataset.field; $$('[data-field]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
    $('#cq').addEventListener('input', (e) => { contestState.q = e.target.value; draw(); });
    draw();
  }

  /* ---------------- view: 보고서 양식 (다운로드 센터) ---------------- */
  const TPL_DIR = 'report/downloads/';
  const TPL_FILES = [
    { ext: 'hwp', name: '한글 (.hwp)', desc: '학교 제출용 기본 형식', file: 'nalssam-report.hwp', tone: 'blue' },
    { ext: 'hwpx', name: '한글 (.hwpx)', desc: '한글 2014 이후 개방형 형식', file: 'nalssam-report.hwpx', tone: 'blue' },
    { ext: 'docx', name: 'Word (.docx)', desc: 'MS Word · 구글 문서에서 열기', file: 'nalssam-report.docx', tone: 'indigo' },
    { ext: 'pdf', name: 'PDF', desc: '미리보기 · 손글씨 작성용 인쇄', file: 'nalssam-report.pdf', tone: 'red' },
    { ext: 'tex', name: 'LaTeX (.tex)', desc: 'Overleaf · XeLaTeX로 컴파일', file: 'nalssam-report.tex', tone: 'green' },
  ];
  const TPL_TOC = [
    ['표지', '분류 · 대회명 · 기간 · 팀 · 구성원(학번 · 역할) · 지도교사'],
    ['요약 · 주제어', '300~500자 국문 요약, (선택) 영문 Abstract'],
    ['1. 서론', '배경 및 필요성 · 목적과 가설 · 선행 연구 비교표'],
    ['2. 이론적 배경', '핵심 개념 · 관련 원리와 적용'],
    ['3. 연구 방법', '설계 흐름도 · 재료 · 변인(독립 · 종속 · 통제) · 절차 · 분석 · 안전'],
    ['4. 결과', '반복 측정 표(평균 ± 표준편차) · 그림 캡션 규칙'],
    ['5. 고찰', '가설 검증 · 오차와 한계 · 개선 방향'],
    ['6. 결론 및 제언', '알게 된 사실과 의의 · 후속 연구'],
    ['7. 활동 관리 기록', '일정표 · 역할과 기여도 · 의사결정 기록 · 예산'],
    ['참고문헌 · 부록', 'APA 7판 예시 · 원자료 · 학습지 · 코드 목록'],
    ['제출 전 점검표', '빠뜨리기 쉬운 9가지 체크'],
  ];

  function viewTemplates() {
    return `
      ${phead({ crumb: '보고서 양식', title: '보고서 양식', desc: '대회 제출 · 생활기록부 근거 자료로 바로 쓰는 <b>날샘 연구·활동 보고서 v2</b>예요. Overleaf의 실험 보고서 · 연구 논문 · 기술 보고서 양식을 섞고, 동아리 활동 기록(일정 · 역할 · 의사결정 · 예산)을 더했어요. 내려받아서 편한 프로그램으로 쓰세요.' })}
      <div class="wrap">
        <section class="tpl-hero reveal">
          <div class="tpl-left">
            <span class="eyebrow"><i></i>NALSSAM REPORT · v2</span>
            <h2>내려받아서, 편한 프로그램으로.</h2>
            <p>웹에서 길게 입력하다 날아갈 걱정 없이, 내 컴퓨터에서 저장하며 써요. 회색 「작성 안내」와 <code>[ ]</code> 칸만 채우면 돼요.</p>
            <div class="dl-grid" id="dlGrid">
              ${TPL_FILES.map((f) => `
                <a class="dl tone-${f.tone}" href="${TPL_DIR}${f.file}" download data-file="${f.file}">
                  <span class="dl-ext">${f.ext.toUpperCase()}</span>
                  <span class="dl-t"><b>${f.name}</b><small>${f.desc}</small></span>
                  <span class="dl-go">↓</span>
                </a>`).join('')}
              <button type="button" class="dl tone-green" data-overleaf-tpl>
                <span class="dl-ext">OL</span>
                <span class="dl-t"><b>Overleaf에서 바로 열기</b><small>새 프로젝트로 열림 · 컴파일러 XeLaTeX</small></span>
                <span class="dl-go">↗</span>
              </button>
            </div>
          </div>
          <div class="tpl-right" aria-hidden="true">
            <div class="mp mp-3"><div class="mp-h">4. 결과</div><div class="mp-table"><i></i><i></i><i></i><i></i></div><div class="mp-l"></div><div class="mp-l s"></div></div>
            <div class="mp mp-2"><div class="mp-h">목차</div>${Array.from({ length: 9 }, (_, i) => `<div class="mp-toc"><span>${i + 1}.</span><i></i></div>`).join('')}</div>
            <div class="mp mp-1"><div class="mp-band"></div><div class="mp-k">NALSSAM RESEARCH &amp; ACTIVITY REPORT</div><div class="mp-t">보고서 제목</div><div class="mp-s">부제</div><div class="mp-rule"></div><div class="mp-table"><i></i><i></i><i></i><i></i><i></i></div><div class="mp-brand">날샘 NALSSAM</div></div>
          </div>
        </section>

        <section class="tpl-sec">
          <div class="sec-head"><div><span class="eyebrow reveal"><i></i>구성</span><h2 class="reveal">표지부터 점검표까지 11개 파트</h2></div><p class="reveal">각 파트마다 무엇을 쓰는지 회색 안내가 들어 있어요.</p></div>
          <div class="toc-grid">${TPL_TOC.map(([t, d], i) => `<div class="toc-card reveal"><span class="toc-n">${String(i).padStart(2, '0')}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div>
        </section>

        <section class="tpl-sec">
          <div class="sec-head"><div><span class="eyebrow reveal"><i></i>작성 순서</span><h2 class="reveal">이 순서로 쓰면 덜 막혀요</h2></div></div>
          <ol class="steps-h reveal">
            <li><b>3장 방법부터</b><span>한 일을 그대로 적는 게 가장 쉬워요</span></li>
            <li><b>4장 결과</b><span>숫자 · 표 · 사진을 먼저 채워요</span></li>
            <li><b>1 · 2 · 5장</b><span>왜 했고, 무엇을 알게 됐는지 연결해요</span></li>
            <li><b>7장 활동 기록</b><span>일정 · 역할 · 의사결정 · 예산</span></li>
            <li><b>요약 · 결론 마지막</b><span>다 쓴 뒤 핵심 숫자를 넣어요</span></li>
          </ol>
        </section>

        <section class="tpl-sec">
          <div class="cta-band reveal">
            <div><h3>다 쓴 보고서는 아카이브에도 남겨요</h3><p>요약 · 과정 · 결과만 입력하면 기록 페이지와 발표 모드가 자동으로 만들어지고, 다음 기수가 참고할 수 있어요. 입력 중인 내용은 브라우저에 자동 저장돼요.</p></div>
            <a class="btn btn-primary" href="#/write">＋ 아카이브에 기록 남기기</a>
          </div>
        </section>
      </div>`;
  }

  function bindTemplates() {
    // 아직 변환되지 않은 형식은 '준비 중'으로 표시
    $$('[data-file]').forEach(async (a) => {
      try {
        const r = await fetch(a.getAttribute('href'), { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) throw new Error();
      } catch {
        a.classList.add('disabled'); a.removeAttribute('href'); a.querySelector('small').textContent = '준비 중이에요';
      }
    });
    $('[data-overleaf-tpl]')?.addEventListener('click', async () => {
      try {
        const tex = await (await fetch(`${TPL_DIR}nalssam-report.tex`, { cache: 'no-store' })).text();
        postToOverleaf(tex, 'nalssam-report.tex');
      } catch { toast('양식을 불러오지 못했어요. .tex 파일을 내려받아 Overleaf에 올려주세요'); }
    });
  }

  /* ---------------- report: guide text ---------------- */
  const GUIDE = {
    competency: '드러내고 싶은 핵심 역량 1~2가지 (예: 데이터 기반 문제해결력, 협업 능력)',
    abstract: '3~5문장. 무엇을(대상) · 왜(문제) · 어떻게(방법) · 무엇을 얻었나(결과·수치)를 순서대로.',
    background: '• 문제를 보여주는 근거(통계·현장 조사)를 개조식으로\n• 숫자에는 출처와 연도를 함께',
    goal: '• 가설: "~하면 ~할 것이다" 형태로\n• 목표: 측정할 수 있는 결과로',
    process: '단계별로 무엇을 했고 어떤 산출물이 나왔는지',
    results: '• 최종 산출물 (시제품·포스터·코드·보고서)\n• 정량 결과와 관찰 내용',
    decisions: '아이디어·방법을 바꾼 순간: 이전 안 → 바뀐 안 → 이유',
    reflection: '• 성장: 배운 점, 새로 익힌 개념·기술\n• 한계: 아쉬운 점과 그 원인',
    followup: '• 후속 탐구 계획\n• 교과 수업·다른 활동과의 연계',
    references: '저자, 「제목」, 발행처, 연도',
  };

  const box = (val, key, cls = '') => {
    const v = (val || '').trim();
    return v ? `<div class="p-box ${cls}">${esc(v)}</div>` : `<div class="p-box p-blank ${cls}">${esc(GUIDE[key] || '')}</div>`;
  };

  /* ---------------- report: paper renderer ---------------- */
  function renderPaper(a) {
    a = normalize(a);
    const r = a.report;
    const members = a.members.filter((m) => m.name);
    const procs = r.process.filter((p) => p.title || p.detail);
    const mets = r.metrics.filter((m) => m.label || m.value);
    const decs = r.decisions.filter((d) => d.from || d.to);
    const items = (a.budget?.items || []).filter((i) => i.name);
    const total = a.budget?.total || items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const refs = r.references.filter(Boolean);
    let n = 0;
    const sec = (title, sub, body) => `<div class="p-sec"><h3><span class="n">${++n}</span>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h3>${body}</div>`;
    const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="p-empty">${esc(text)}</td></tr>`;

    return `
    <article class="paper" id="paper">
      <div class="paper-head">
        <div>
          <div class="kicker">NALSSAM ACTIVITY SUMMARY · ${esc(a.year)}</div>
          <h2>${esc(a.title || '활동명')}</h2>
          ${a.subtitle ? `<div class="sub">${esc(a.subtitle)}</div>` : '<div class="sub" style="color:#A3B5A5">부제 (팀이 만든 결과물 이름)</div>'}
        </div>
        <div class="paper-logo">${leafSvg}<div>대전대신고 날샘</div><div>환경·생태 동아리</div></div>
      </div>

      <table class="meta-table">
        <tr><th>분류</th><td>${esc(a.category)}</td><th>공개 범위</th><td>${esc((VIS[a.visibility] || VIS.members).label)}</td></tr>
        <tr><th>활동 기간</th><td>${esc(a.period || '—')}</td><th>상태</th><td>${esc(a.status)}</td></tr>
        <tr><th>주관 · 협력</th><td colspan="3">${esc([a.organizer, a.partner].filter(Boolean).join(' / ') || '—')}</td></tr>
        <tr><th>팀</th><td colspan="3">${esc(a.team || '—')}</td></tr>
        <tr><th>구성원 · 역할</th><td colspan="3">${members.length ? members.map((m) => `${esc(m.name)}(${esc(m.role || '-')})`).join(', ') : '<span class="p-empty">이름(역할), 이름(역할)</span>'}</td></tr>
        ${a.award ? `<tr><th>수상</th><td colspan="3">${esc(a.award)}</td></tr>` : ''}
      </table>

      ${sec('요약', 'Abstract', `${box(r.abstract, 'abstract', 'abstract')}
        <div class="p-kw">${a.keywords.length ? a.keywords.map((k) => `<span>#${esc(k)}</span>`).join('') : '<span style="background:#F2F4F0;color:#A3B5A5">#키워드1 #키워드2 #키워드3</span>'}</div>
        <div style="margin-top:6px;font-size:12px"><b style="color:#1F6B2C">핵심 역량</b> · ${r.competency ? esc(r.competency) : `<span class="p-empty">${esc(GUIDE.competency)}</span>`}</div>`)}
      ${sec('배경 및 문제 정의', 'Why?', box(r.background, 'background'))}
      ${sec('목표 및 가설', 'Hypothesis', box(r.goal, 'goal'))}
      ${sec('진행 과정', 'Process', `<table><thead><tr><th>단계</th><th style="width:28%">내용</th><th>세부 활동 · 산출물</th></tr></thead><tbody>
        ${procs.length ? procs.map((p) => `<tr><td>${esc(p.step)}</td><td><b>${esc(p.title)}</b></td><td>${esc(p.detail)}</td></tr>`).join('') : emptyRow(3, GUIDE.process)}
      </tbody></table>`)}
      ${sec('결과 및 산출물', 'Results', `${mets.length ? `<table style="margin-bottom:8px"><thead><tr><th>지표</th><th>값</th><th>비고</th></tr></thead><tbody>${mets.map((m) => `<tr><td>${esc(m.label)}</td><td><b>${esc(m.value)}</b></td><td>${esc(m.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}${box(r.results, 'results')}`)}
      ${sec('의사결정 기록', 'Pivot log', `<table><thead><tr><th>이전 안</th><th>바뀐 안</th><th>바꾼 이유</th></tr></thead><tbody>
        ${decs.length ? decs.map((d) => `<tr><td>${esc(d.from)}</td><td><b>${esc(d.to)}</b></td><td>${esc(d.reason)}</td></tr>`).join('') : emptyRow(3, GUIDE.decisions)}
      </tbody></table>`)}
      ${sec('고찰: 성장과 한계', 'Discussion', box(r.reflection, 'reflection'))}
      ${sec('예산 집행', a.budget?.note || 'Budget', `<table><thead><tr><th>품목</th><th>구입 목적</th><th>단가</th><th>수량</th><th>합계</th></tr></thead><tbody>
        ${items.length ? items.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.purpose)}</td><td class="num">${won(i.unit)}</td><td class="num">${esc(i.qty)}</td><td class="num">${won(i.total)}</td></tr>`).join('') : emptyRow(5, '해당 없음 또는 품목 · 구입 목적 · 단가 · 수량 · 합계')}
        ${items.length ? `<tr><th colspan="4" style="text-align:right">소계</th><td class="num"><b>${won(total)}원</b></td></tr>` : ''}
      </tbody></table>`)}
      ${sec('후속 연계 활동', 'Next', box(r.followup, 'followup'))}
      ${sec('참고문헌 및 첨부 자료', 'References', `<div class="p-box ${refs.length || a.links.length ? '' : 'p-blank'}" style="white-space:normal">
        ${refs.length ? `<ol style="margin:0;padding-left:18px">${refs.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : (a.links.length ? '' : esc(GUIDE.references))}
        ${a.links.length ? `<div style="margin-top:${refs.length ? 8 : 0}px;font-size:12px"><b style="color:#1F6B2C">첨부</b> · ${a.links.map((l) => `<a href="${esc(safeUrl(l.url))}" style="color:#2F8A3B;text-decoration:underline" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join(' · ')}</div>` : ''}
      </div>`)}

      <div class="p-sign"><div>작성자 <span>${esc(members[0]?.name || '')}</span></div><div>지도교사 확인 <span></span></div></div>
      <div class="paper-foot"><span>날샘 활동 보고서 표준 양식 v1.0</span><span>${esc(a.id || 'draft')}</span></div>
    </article>`;
  }

  /* ---------------- view: report editor ---------------- */
  let draft = null;
  const draftKey = (id) => (id ? `${LS_DRAFT}:${id}` : LS_DRAFT);

  function viewReport(id) {
    let notice = '';
    if (id) {
      const a = Store.get(id);
      const pending = lsGet(draftKey(id), null);   // 저장하지 않고 닫은 수정 내용
      draft = a ? normalize(clone(pending && Store.canEdit(a) ? pending : a)) : normalize(lsGet(LS_DRAFT, blankActivity()));
      if (a && pending && Store.canEdit(a)) {
        notice = `<div class="locked" style="margin-bottom:18px"><span class="locked-ic">💾</span><div><h3>저장하지 않은 수정 내용을 불러왔어요</h3><p>지난번에 쓰던 내용이에요. 원래대로 돌리려면 오른쪽 버튼을 누르세요.</p></div><button class="btn btn-ghost btn-sm" type="button" data-act="discard">원래 기록으로</button></div>`;
      }
      if (a && !Store.canEdit(a)) {
        // 남의 기록은 고칠 수 없으므로, 내용을 복사해 내 새 기록으로 시작
        draft.id = ''; delete draft.created_by; draft.visibility = 'private';
        notice = `<div class="locked" style="margin-bottom:18px"><span class="locked-ic">✎</span><div><h3>이 기록은 작성자만 고칠 수 있어요</h3><p>내용을 복사해 두었어요. 저장하면 <b>내 새 기록(나만 보기)</b>으로 만들어지고, 원래 기록은 그대로 남아요.</p></div></div>`;
      }
    } else {
      draft = normalize(lsGet(LS_DRAFT, blankActivity()));
    }
    const remoteSeed = false;
    return `
      ${phead({ crumb: id ? '기록 편집' : '새 기록', title: id && !notice ? '기록 편집' : '아카이브에 기록 남기기', desc: '팀 활동을 아카이브용으로 요약해요. 입력하는 내용은 <b>이 브라우저에 자동 저장</b>되니 창을 닫아도 이어서 쓸 수 있어요. 대회 제출용 정식 보고서는 <a class="tag" href="#/report">보고서 양식</a>을 내려받아 쓰세요.', actions: `<span class="autosave" id="autosave">자동 저장 대기</span>` })}
      <div class="wrap">${notice}</div>
      <div class="wrap">
        <div class="toolbar2">
          <div class="tb-group">
            <button class="btn btn-ghost btn-sm" type="button" data-act="blank">새 빈 기록</button>
            <button class="btn btn-ghost btn-sm" type="button" data-act="example">예시 불러오기</button>
          </div>
          <div class="tb-group">
            <button class="btn btn-ghost btn-sm" type="button" data-act="json">JSON 백업</button>
            <button class="btn btn-ghost btn-sm" type="button" data-act="tex">.tex</button>
            <button class="btn btn-soft btn-sm" type="button" data-act="print">🖨 요약서 PDF</button>
          </div>
        </div>
        ${remoteSeed ? '' : ''}
        <div class="editor">
          <form class="editor-form" id="edForm" autocomplete="off"></form>
          <div class="paper-wrap" id="edPaper"></div>
        </div>
      </div>`;
  }

  const F = {
    text: (k, label, ph = '', hint = '') => `<label class="field"><span>${label}</span><input class="input" data-k="${k}" value="${esc(getK(k))}" placeholder="${esc(ph)}" />${hint ? `<small>${hint}</small>` : ''}</label>`,
    area: (k, label, rows = 4) => `<label class="field"><span>${label}</span><textarea class="textarea" data-k="${k}" rows="${rows}" placeholder="${esc(GUIDE[k.split('.').pop()] || '')}">${esc(getK(k))}</textarea></label>`,
    select: (k, label, opts) => `<label class="field"><span>${label}</span><select class="select" data-k="${k}">${opts.map((o) => `<option ${getK(k) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`,
  };

  function getK(path) { return path.split('.').reduce((o, k) => (o == null ? '' : o[k]), draft) ?? ''; }
  function setK(path, v) {
    const ks = path.split('.');
    let o = draft;
    ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
    o[ks.at(-1)] = v;
  }

  // 반복 입력 (구성원 · 과정 · 지표 · 결정 · 예산 · 링크)
  const REPEATS = {
    members: { path: 'members', cols: [['name', '이름'], ['role', '역할']], blank: { name: '', role: '' } },
    process: { path: 'report.process', cols: [['step', '단계'], ['title', '내용'], ['detail', '세부 활동 · 산출물']], blank: { step: '', title: '', detail: '' } },
    metrics: { path: 'report.metrics', cols: [['label', '지표'], ['value', '값'], ['note', '비고']], blank: { label: '', value: '', note: '' } },
    decisions: { path: 'report.decisions', cols: [['from', '이전 안'], ['to', '바뀐 안'], ['reason', '이유']], blank: { from: '', to: '', reason: '' } },
    budget: { path: 'budget.items', cols: [['name', '품목'], ['purpose', '구입 목적'], ['unit', '단가'], ['qty', '수량'], ['total', '합계']], blank: { name: '', purpose: '', unit: 0, qty: 1, ship: 0, total: 0 } },
    links: { path: 'links', cols: [['label', '이름'], ['url', 'https://…'], ['kind', 'canva/sheet/drive/doc/photo']], blank: { label: '', url: '', kind: 'etc' } },
  };

  function repeatBlock(name) {
    const R = REPEATS[name];
    const rows = getK(R.path) || [];
    const gridCols = R.cols.length === 2 ? '1fr 1.4fr auto' : R.cols.length === 3 ? '0.9fr 1.1fr 1.6fr auto' : '1.1fr 1.5fr 0.8fr 0.5fr 0.8fr auto';
    return `<div class="repeat" data-repeat="${name}">
      ${rows.map((row, i) => `<div class="repeat-row" style="grid-template-columns:${gridCols}">
        ${R.cols.map(([f, ph]) => `<input class="input" data-r="${name}" data-i="${i}" data-f="${f}" value="${esc(row[f] ?? '')}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" />`).join('')}
        <button type="button" class="x-btn" data-del="${name}" data-i="${i}" aria-label="행 삭제">✕</button>
      </div>`).join('')}
      <button type="button" class="btn btn-ghost btn-sm" data-add="${name}" style="justify-self:start">＋ 행 추가</button>
    </div>`;
  }

  function editorForm() {
    const d = draft;
    const fold = (n, title, body, open = false) => `<details class="fold" ${open ? 'open' : ''}><summary><span class="n">${n}</span>${title}</summary><div class="fold-body">${body}</div></details>`;
    return `
      ${fold('0', '기본 정보', `
        ${F.text('title', '활동명 *', '예: 2026 START-UPCYCLING THON')}
        ${F.text('subtitle', '결과물 · 부제', '예: 커피쉴드: 커피박 방염 타일')}
        ${F.text('tagline', '한 줄 소개', '예: 카페에서 나온 커피박이 그 카페의 벽을 지킵니다')}
        <div class="row2">${F.select('category', '분류', CATS)}${F.select('status', '상태', STATUSES)}</div>
        <div class="row2">${F.text('year', '연도', '2026')}${F.text('period', '활동 기간', '예: 2026.09 ~ 2026.11')}</div>
        <div class="row2">${F.text('organizer', '주관', '예: OO대학교')}${F.text('partner', '협력', '예: OO고 연합')}</div>
        ${F.text('team', '팀 이름', '예: 1조 · 팀 스냅')}
        ${F.text('award', '수상 (선택)', '예: 우수상')}
        <div class="field"><span>공개 범위</span><div class="vis-pick">${Object.entries(VIS).map(([k, v]) => `
          <label><input type="radio" name="vis" value="${k}" data-vis ${d.visibility === k ? 'checked' : ''} /><span><b>${v.icon} ${v.label}</b><small>${v.desc}</small></span></label>`).join('')}
        </div><small>팀원 이름 · 학습지 링크가 들어간 기록은 ‘부원 공개’를 권장해요.</small></div>
        ${F.text('summary', '카드에 보일 요약', '목록 카드에 보이는 2~3문장')}
      `, true)}
      ${fold('👥', '구성원과 역할', repeatBlock('members'))}
      ${fold('1', '요약 · 키워드 · 핵심 역량', `
        ${F.area('report.abstract', '요약 (Abstract)', 5)}
        <label class="field"><span>키워드</span><input class="input" data-kw value="${esc(d.keywords.join(', '))}" placeholder="쉼표로 구분: 커피박, 방염, 업사이클링" /></label>
        ${F.text('report.competency', '드러내고 싶은 핵심 역량', GUIDE.competency)}
      `)}
      ${fold('2', '배경 및 문제 정의', F.area('report.background', '근거 데이터와 문제의식', 6))}
      ${fold('3', '목표 및 가설', F.area('report.goal', '가설 · 목표', 5))}
      ${fold('4', '진행 과정', repeatBlock('process'))}
      ${fold('5', '결과 및 산출물', `<div class="field"><span>정량 지표</span>${repeatBlock('metrics')}</div>${F.area('report.results', '산출물 · 관찰 결과', 5)}`)}
      ${fold('6', '의사결정 기록', repeatBlock('decisions'))}
      ${fold('7', '고찰: 성장과 한계', F.area('report.reflection', '성장 · 한계', 5))}
      ${fold('8', '예산 집행', `${F.text('budget.note', '예산 메모', '예: 1조 구매 리스트 · 시트 기준')}${repeatBlock('budget')}<small class="muted">합계를 비워두면 단가 × 수량으로 계산해요.</small>`)}
      ${fold('9', '후속 연계 활동', F.area('report.followup', '후속 계획 · 연계', 4))}
      ${fold('10', '참고문헌 · 첨부 자료', `
        <label class="field"><span>참고문헌 (한 줄에 하나)</span><textarea class="textarea" data-refs rows="4" placeholder="${esc(GUIDE.references)}">${esc(d.report.references.join('\n'))}</textarea></label>
        <div class="field"><span>첨부 자료 링크 (캔바 · 드라이브 · 시트 · 사진)</span>${repeatBlock('links')}</div>
      `)}
      <div class="editor-actions">
        <button class="btn btn-primary" type="button" data-act="save">${Store.mode === 'supabase' ? 'DB에 저장' : '이 브라우저에 저장'}</button>
        <button class="btn btn-ghost" type="button" data-act="draft">임시저장</button>
        ${d.id ? `<a class="btn btn-ghost" href="#/a/${encodeURIComponent(d.id)}">기록 페이지로</a>` : ''}
      </div>
      <small class="muted">${Store.mode === 'supabase' ? (Store.canWrite() ? '학교 계정으로 로그인됨 · 내가 고른 공개 범위대로 보여요. 수정은 나만 할 수 있어요.' : '저장하려면 오른쪽 위에서 학교 계정(@dshs.kr)으로 로그인하세요.') : '지금은 로컬 모드예요. 저장한 기록은 이 브라우저에만 남아요. config.js에 Supabase를 연결하면 부원 모두가 같은 DB를 씁니다.'}</small>`;
  }

  function bindEditor() {
    const form = $('#edForm');
    const paper = $('#edPaper');
    const drawForm = () => { form.innerHTML = editorForm(); };
    let t;
    let saveT;
    const badge = $('#autosave');
    // 입력할 때마다 이 브라우저에 자동 저장 (새 기록 / 편집 중인 기록을 따로 보관)
    const autosave = () => {
      clearTimeout(saveT);
      if (badge) { badge.textContent = '저장 중…'; badge.classList.remove('ok'); }
      saveT = setTimeout(() => {
        const ok = lsSet(draftKey(draft.id), { ...stripPrivate(draft), _savedAt: Date.now() });
        if (badge) {
          const d = new Date();
          badge.textContent = ok ? `자동 저장됨 · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '자동 저장 불가 · JSON 백업을 받아두세요';
          badge.classList.toggle('ok', ok);
        }
      }, 500);
    };
    const drawPaper = () => { clearTimeout(t); t = setTimeout(() => { paper.innerHTML = renderPaper(draft); }, 80); autosave(); };
    drawForm();
    paper.innerHTML = renderPaper(draft);

    form.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.k) setK(el.dataset.k, el.dataset.k === 'year' ? (parseInt(el.value, 10) || el.value) : el.value);
      else if ('kw' in el.dataset) draft.keywords = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if ('refs' in el.dataset) draft.report.references = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else if ('vis' in el.dataset) draft.visibility = el.value;
      else if (el.dataset.r) {
        const R = REPEATS[el.dataset.r];
        const row = getK(R.path)[+el.dataset.i];
        const numeric = ['unit', 'qty', 'total', 'ship'].includes(el.dataset.f);
        row[el.dataset.f] = numeric ? Number(String(el.value).replace(/[^\d.]/g, '')) || 0 : el.value;
        if (el.dataset.r === 'budget') {
          if (el.dataset.f !== 'total') row._autoTotal = row._autoTotal ?? !row.total;
          if (el.dataset.f === 'total') row._autoTotal = !el.value;
          if (row._autoTotal) {
            row.total = (Number(row.unit) || 0) * (Number(row.qty) || 0) + (Number(row.ship) || 0);
            const tIn = form.querySelector(`[data-r="budget"][data-i="${el.dataset.i}"][data-f="total"]`);
            if (tIn && el.dataset.f !== 'total') tIn.value = row.total;
          }
          draft.budget.total = draft.budget.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
        }
      }
      drawPaper();
    });

    form.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      const del = e.target.closest('[data-del]');
      if (add) {
        const R = REPEATS[add.dataset.add];
        const arr = getK(R.path) || [];
        const nb = clone(R.blank);
        if (add.dataset.add === 'process') nb.step = String(arr.length + 1).padStart(2, '0');
        arr.push(nb); setK(R.path, arr);
        const openIdx = $$('details', form).map((d) => d.open);
        drawForm();
        $$('details', form).forEach((d, i) => { d.open = openIdx[i]; });
        drawPaper();
      }
      if (del) {
        const R = REPEATS[del.dataset.del];
        getK(R.path).splice(+del.dataset.i, 1);
        const openIdx = $$('details', form).map((d) => d.open);
        drawForm();
        $$('details', form).forEach((d, i) => { d.open = openIdx[i]; });
        if (del.dataset.del === 'budget') draft.budget.total = draft.budget.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
        drawPaper();
      }
    });

    // 폼이 다시 그려져도 버튼이 동작하도록 위임 방식으로 연결
    form.closest('.wrap').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      try {
        if (act === 'blank') {
          if ((draft.title || draft.report?.abstract) && !confirm('지금 쓰던 내용을 지우고 새로 시작할까요? (JSON 백업을 먼저 받아둘 수 있어요)')) return;
          draft = blankActivity(); lsSet(LS_DRAFT, draft); drawForm(); paper.innerHTML = renderPaper(draft); toast('빈 기록을 열었어요');
        }
        if (act === 'discard') {
          const orig = Store.get(draft.id);
          try { localStorage.removeItem(draftKey(draft.id)); } catch { /* 무시 */ }
          if (orig) { draft = normalize(clone(orig)); drawForm(); paper.innerHTML = renderPaper(draft); b.closest('.locked')?.remove(); toast('원래 기록으로 돌렸어요'); }
          return;
        }
        if (act === 'example') {
          const ex = SEED.activities.find((a) => a.id === 'startupcycling-2026-coffeeshield');
          draft = normalize(clone(ex)); draft.id = ''; drawForm(); paper.innerHTML = renderPaper(draft); toast('커피쉴드 예시를 불러왔어요 (새 기록으로 저장돼요)');
        }
        if (act === 'print') { document.body.classList.add('print-paper'); window.print(); setTimeout(() => document.body.classList.remove('print-paper'), 500); }
        if (act === 'tex') downloadTex(draft);
        if (act === 'overleaf') openOverleaf(draft);
        if (act === 'json') downloadFile(`${draft.id || slug(draft.title) || 'nalssam-record'}.json`, JSON.stringify(stripPrivate(draft), null, 2), 'application/json');
        if (act === 'draft') { lsSet(LS_DRAFT, draft); toast('임시저장했어요 💾'); }
        if (act === 'seed') { b.disabled = true; await Store.seedRemote(); toast('초기 데이터를 Supabase에 올렸어요 🌱'); render(); }
        if (act === 'save') {
          if (!draft.title.trim()) { toast('활동명을 입력해 주세요'); return; }
          if (!Store.canWrite()) { toast('학교 계정(@dshs.kr)으로 로그인해야 저장할 수 있어요'); return; }
          const existing = draft.id && Store.get(draft.id);
          if (existing && !Store.canEdit(existing)) { draft.id = ''; delete draft.created_by; }
          b.disabled = true;
          const prevKey = draftKey(draft.id);
          const id = await Store.save(stripPrivate(draft));
          try { localStorage.removeItem(prevKey); localStorage.removeItem(draftKey(id)); } catch { /* 저장소 차단 시 무시 */ }
          toast('저장했어요 🌿');
          location.hash = `#/a/${encodeURIComponent(id)}`;
        }
      } catch (err) {
        toast(err.message || String(err));
      } finally { b.disabled = false; }
    });
  }

  function stripPrivate(a) {
    const c = clone(a);
    (c.budget?.items || []).forEach((i) => delete i._autoTotal);
    return c;
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- view: 내 기록 (본인만) ---------------- */
  // 개인별 연간 활동 및 탐구 보고서 (동아리 구글 문서 양식을 그대로 옮김)
  const PARTICIPATION = [
    ['garden', '교내 텃밭 가꾸기', '역할'], ['smartfarm', '교내 스마트팜 존 관리', '역할'], ['terrarium', '테라리움 제작', '역할'],
    ['upcycling', '스타트업사이클링톤', '역할'], ['biolab', '바이오랩(Bio-Lab) 프로젝트', '역할'], ['kier', '한국에너지기술연구원(에너지연) 탐방', '역할'],
    ['univ', '충남대 / 건양대 연계 프로그램', '역할'], ['contest', '팀별 외부 대회 참가', '대회명 및 역할'], ['dome', '돔형 스마트팜 운영', '역할'],
    ['deep', '개인별 심화 탐구', '주제 요약'], ['etc', '기타 활동', '활동명 및 역할'],
  ];
  const CORE_FIELDS = [
    ['competency', '드러내고자 하는 핵심 역량', '예: 데이터 기반 문제해결력, 융합적 사고력 (1~2가지)'],
    ['purpose', '탐구(활동) 목적 (Why?)', '이 주제를 고른 근본적인 이유와 해결하려던 문제의식'],
    ['keywords', '핵심 키워드', '#키워드1 #키워드2 #키워드3 (세특에 반영되길 원하는 전공·개념어)'],
    ['motive', '탐구 동기', '일상·수업·기존 활동에서 발견한 의문점이나 계기'],
    ['topic', '주제 설정', '구체적인 탐구 주제 및 가설'],
    ['method', '자료 수집 및 실험', '문헌 조사, 센서 데이터 수집, 실험 설계 및 수행 방법'],
    ['analysis', '자료 분석', '데이터·실험 결과에서 도출한 경향성, 원인 분석'],
    ['conclusion', '결론 도출', '최종적으로 확인한 사실 및 문제 해결 방안'],
    ['output', '최종 산출물', '보고서, 시제품, 코드, 포스터, 발표 자료 등'],
    ['evaluation', '활동 평가 (성장 및 한계점)', '배우고 성장한 점, 아쉬웠던 점과 보완 방향'],
    ['followup', '추후 연계 활동', '후속 탐구 계획, 교과 수업·타 활동과의 연계'],
  ];
  const blankCore = () => Object.fromEntries([['activityId', ''], ['title', ''], ...CORE_FIELDS.map(([k]) => [k, ''])]);
  const blankPersonal = () => ({ participation: {}, cores: [blankCore(), blankCore()], contribution: { case: '', feeling: '' } });
  let me = { profile: {}, report: blankPersonal(), year: SEED.club.year };

  function viewMe() {
    const needLogin = Store.mode === 'supabase' && !Store.user;
    return `
      <section class="wrap page-head">
        <span class="eyebrow reveal"><i></i>My Page · 나만 보기</span>
        <h1 class="reveal">내 기록</h1>
        <p class="reveal">프로필(학번 · 진로)과 개인 연간 보고서는 <b>나만</b> 볼 수 있어요. 관리자도 없고, 다른 부원도 볼 수 없어요. 생활기록부 동아리 특기사항의 기초 자료로 쓰세요.</p>
      </section>
      <div class="wrap" id="meRoot">
        ${needLogin ? `
          <div class="locked reveal"><span class="locked-ic">🔐</span>
            <div><h3>학교 메일로 로그인해 주세요</h3><p>로그인하면 내 프로필, 내가 쓴 기록, 개인 연간 보고서를 볼 수 있어요. 비밀번호 없이 메일로 온 링크만 누르면 돼요.</p></div>
            <button class="btn btn-primary" type="button" data-login>로그인</button>
          </div>` : `<div class="empty">불러오는 중… 🌱</div>`}
      </div>`;
  }

  async function bindMe() {
    const root = $('#meRoot');
    if (!root || (Store.mode === 'supabase' && !Store.user)) return;
    try {
      me.profile = { ...(await Store.getProfile()) };
      me.report = normalizePersonal(await Store.getPersonalReport(me.year));
    } catch (err) {
      root.innerHTML = `<div class="empty">불러오지 못했어요: ${esc(err.message || err)}<br><small>DB에 v2 구조(002_members_privacy.sql)가 적용됐는지 확인해 주세요.</small></div>`;
      return;
    }
    drawMe();
  }

  function normalizePersonal(r) {
    const b = blankPersonal();
    if (!r) return b;
    return {
      participation: r.participation || {},
      cores: (r.cores && r.cores.length ? r.cores : b.cores).map((c) => ({ ...blankCore(), ...c })),
      contribution: { ...b.contribution, ...(r.contribution || {}) },
    };
  }

  function drawMe() {
    const root = $('#meRoot');
    const p = me.profile;
    const uid = Store.user?.id;
    const mine = Store.activities.filter((a) => (Store.mode === 'local' ? false : a.created_by && a.created_by === uid));
    const joined = p.name ? Store.activities.filter((a) => (a.members || []).some((m) => m.name === p.name)) : [];
    const mini = (list, empty) => (list.length ? `<div class="mini-list">${list.map((a) => `<a class="mini" href="#/a/${encodeURIComponent(a.id)}"><b>${esc(a.subtitle || a.title)}</b><span>${esc(a.category)} · ${esc(a.year)}</span>${Store.mode === 'supabase' ? visChip(a.visibility) : ''}</a>`).join('')}</div>` : `<p class="muted" style="margin:0">${empty}</p>`);
    const actOpts = (sel) => `<option value="">직접 입력</option>${Store.activities.map((a) => `<option value="${esc(a.id)}" ${sel === a.id ? 'selected' : ''}>${esc(a.subtitle ? `${a.title} · ${a.subtitle}` : a.title)}</option>`).join('')}`;
    const r = me.report;

    root.innerHTML = `
      <div class="me-grid no-print">
        <div class="panel reveal">
          <h3><span class="n">🔒</span>내 프로필 <small class="muted" style="font-weight:600">나만 보기</small></h3>
          <div class="field-grid">
            <label class="field"><span>이름</span><input class="input" data-p="name" value="${esc(p.name || '')}" placeholder="이름" /></label>
            <label class="field"><span>학번</span><input class="input" data-p="student_no" value="${esc(p.student_no || '')}" placeholder="예: 10101" inputmode="numeric" /></label>
            <label class="field"><span>소속 부서</span><select class="select" data-p="department"><option value="">선택</option>${['공학부', '생명부', '화학부'].map((d) => `<option ${p.department === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
            <label class="field"><span>진로 및 주요 관심 분야</span><input class="input" data-p="career" value="${esc(p.career || '')}" placeholder="예: 환경 공학, 생명 과학" /></label>
          </div>
          <div class="editor-actions" style="margin-top:14px"><button class="btn btn-primary btn-sm" type="button" data-me="saveProfile">프로필 저장</button>
          <span class="muted" style="font-size:13px">${Store.user ? esc(Store.user.email) : '로컬 모드 · 이 브라우저에만 저장'}</span></div>
        </div>
        <div class="panel reveal">
          <h3><span class="n">✎</span>내가 쓴 기록</h3>
          ${mini(mine, Store.mode === 'local' ? '로컬 모드에서는 작성자 구분이 없어요.' : '아직 없어요. [보고서 양식]에서 첫 기록을 남겨보세요.')}
          <h3 style="margin-top:20px"><span class="n">👥</span>내가 참여한 기록</h3>
          ${mini(joined, p.name ? '구성원 목록에 내 이름이 들어간 기록이 아직 없어요.' : '프로필에 이름을 저장하면, 구성원으로 들어간 기록을 찾아드려요.')}
        </div>
      </div>

      <div class="sec-head no-print" style="margin:44px 0 18px">
        <div><span class="eyebrow"><i></i>${esc(me.year)} 개인별 연간 활동 및 탐구 보고서</span><h2>나만의 한 해 정리</h2></div>
        <p>핵심 활동 2개 이상을 개조식(~함, ~임, ~분석함)으로 써요. 팀 보고서를 고르면 내용을 초안으로 가져올 수 있어요.</p>
      </div>
      <div class="inline-actions no-print">
        <button class="btn btn-primary btn-sm" type="button" data-me="saveReport">${Store.mode === 'supabase' ? '내 보고서 저장 (나만 보기)' : '이 브라우저에 저장'}</button>
        <button class="btn btn-soft btn-sm" type="button" data-me="print">🖨 인쇄 / PDF</button>
        <button class="btn btn-ghost btn-sm" type="button" data-me="addCore">＋ 핵심 활동 추가</button>
      </div>
      <div class="editor">
        <form class="editor-form" id="meForm" autocomplete="off">
          <details class="fold" open><summary><span class="n">2</span>연간 참여 현황</summary><div class="fold-body">
            ${PARTICIPATION.map(([k, label, roleLabel]) => { const v = r.participation[k] || {}; return `
              <div class="part-row"><label class="part-check"><input type="checkbox" data-part="${k}" ${v.checked ? 'checked' : ''}/><span>${esc(label)}</span></label>
              <input class="input" data-part-role="${k}" value="${esc(v.role || '')}" placeholder="${esc(roleLabel)}" /></div>`; }).join('')}
          </div></details>
          ${r.cores.map((c, i) => `
            <details class="fold" ${i < 1 ? 'open' : ''}><summary><span class="n">3-${i + 1}</span>[활동 ${i + 1}] ${esc(c.title || '선택 활동')}</summary><div class="fold-body">
              <label class="field"><span>활동 고르기 (팀 보고서 연결)</span><select class="select" data-core="${i}" data-f="activityId">${actOpts(c.activityId)}</select></label>
              <div class="editor-actions"><button class="btn btn-ghost btn-sm" type="button" data-import="${i}">팀 보고서에서 초안 가져오기</button>${r.cores.length > 2 ? `<button class="btn btn-ghost btn-sm" type="button" data-remove-core="${i}">이 활동 빼기</button>` : ''}</div>
              <label class="field"><span>선택 활동명</span><input class="input" data-core="${i}" data-f="title" value="${esc(c.title)}" placeholder="예: 스타트업사이클링톤" /></label>
              ${CORE_FIELDS.map(([k, label, ph]) => `<label class="field"><span>${esc(label)}</span><textarea class="textarea" rows="${['competency', 'keywords', 'topic'].includes(k) ? 2 : 3}" data-core="${i}" data-f="${k}" placeholder="${esc(ph)}">${esc(c[k])}</textarea></label>`).join('')}
            </div></details>`).join('')}
          <details class="fold"><summary><span class="n">4</span>동아리 내 기여도 · 공동체 역량</summary><div class="fold-body">
            <label class="field"><span>구체적 기여 사례</span><textarea class="textarea" rows="4" data-contrib="case" placeholder="예: 팀원 간 의견을 조율하고 일정표를 만들어 기한 내 시제품 제작을 완수함">${esc(r.contribution.case)}</textarea></label>
            <label class="field"><span>느낀 점 및 드러내고 싶은 공동체 역량</span><textarea class="textarea" rows="3" data-contrib="feeling">${esc(r.contribution.feeling)}</textarea></label>
          </div></details>
        </form>
        <div class="paper-wrap" id="mePaper">${renderPersonalPaper()}</div>
      </div>`;
    observeReveal();
    bindMeEvents();
  }

  function bindMeEvents() {
    const root = $('#meRoot');
    const form = $('#meForm');
    let t;
    const redraw = () => { clearTimeout(t); t = setTimeout(() => { $('#mePaper').innerHTML = renderPersonalPaper(); }, 80); };

    $$('[data-p]', root).forEach((el) => el.addEventListener('input', () => { me.profile[el.dataset.p] = el.value; redraw(); }));
    form.addEventListener('input', (e) => {
      const el = e.target;
      const r = me.report;
      if (el.dataset.part) { r.participation[el.dataset.part] = { ...(r.participation[el.dataset.part] || {}), checked: el.checked }; }
      else if (el.dataset.partRole) {
        const k = el.dataset.partRole;
        r.participation[k] = { ...(r.participation[k] || {}), role: el.value };
        if (el.value && !r.participation[k].checked) { r.participation[k].checked = true; form.querySelector(`[data-part="${k}"]`).checked = true; }
      } else if (el.dataset.core) {
        const c = r.cores[+el.dataset.core];
        c[el.dataset.f] = el.value;
        if (el.dataset.f === 'activityId' && el.value && !c.title) {
          const a = Store.get(el.value);
          if (a) { c.title = a.title; const ti = form.querySelector(`[data-core="${el.dataset.core}"][data-f="title"]`); if (ti) ti.value = a.title; }
        }
      } else if (el.dataset.contrib) r.contribution[el.dataset.contrib] = el.value;
      redraw();
    });

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-me],[data-import],[data-remove-core]');
      if (!b) return;
      try {
        if (b.dataset.import !== undefined) {
          const i = +b.dataset.import;
          const c = me.report.cores[i];
          const a = Store.get(c.activityId);
          if (!a) { toast('먼저 위에서 활동을 골라주세요'); return; }
          Object.assign(c, draftFromTeam(a, c));
          drawMe(); toast('팀 보고서에서 초안을 가져왔어요. 내 역할 중심으로 다듬어 주세요 ✍️');
          return;
        }
        if (b.dataset.removeCore !== undefined) { me.report.cores.splice(+b.dataset.removeCore, 1); drawMe(); return; }
        const act = b.dataset.me;
        if (act === 'addCore') { me.report.cores.push(blankCore()); drawMe(); }
        if (act === 'print') window.print();
        if (act === 'saveProfile') { b.disabled = true; await Store.saveProfile(me.profile); toast('프로필을 저장했어요 🔒'); drawMe(); }
        if (act === 'saveReport') { b.disabled = true; await Store.savePersonalReport(me.year, me.report); toast('개인 보고서를 저장했어요 (나만 보기) 🔒'); }
      } catch (err) {
        toast(err.message || String(err));
      } finally { b.disabled = false; }
    });
  }

  // 팀 보고서 → 개인 보고서 초안 (빈 칸만 채움)
  function draftFromTeam(a, c) {
    a = normalize(a);
    const r = a.report;
    const lines = (t) => (t || '').split('\n').map((s) => s.replace(/^[•\-]\s*/, '').trim()).filter(Boolean);
    const pick = {
      title: a.title,
      competency: r.competency,
      purpose: lines(r.goal).map((l) => '• ' + l).join('\n'),
      keywords: a.keywords.map((k) => '#' + k.replace(/\s+/g, '')).join(' '),
      motive: lines(r.background).slice(0, 2).map((l) => '• ' + l).join('\n'),
      topic: [a.subtitle, lines(r.goal)[0]].filter(Boolean).join(' — '),
      method: r.process.filter((s) => s.title).map((s) => `• ${s.title}: ${s.detail || ''}`).join('\n'),
      analysis: r.metrics.filter((m) => m.value).map((m) => `• ${m.label}: ${m.value}${m.note ? ` (${m.note})` : ''}`).join('\n'),
      conclusion: lines(r.results).slice(0, 2).map((l) => '• ' + l).join('\n'),
      output: lines(r.results)[0] ? '• ' + lines(r.results)[0] : '',
      evaluation: lines(r.reflection).map((l) => '• ' + l).join('\n'),
      followup: lines(r.followup).map((l) => '• ' + l).join('\n'),
    };
    const out = {};
    Object.entries(pick).forEach(([k, v]) => { if (!c[k] && v) out[k] = v; });
    return out;
  }

  function renderPersonalPaper() {
    const p = me.profile;
    const r = me.report;
    const val = (v, ph) => (v && v.trim() ? esc(v) : `<span class="p-empty">${esc(ph)}</span>`);
    return `
    <article class="paper" id="paper">
      <div class="paper-head">
        <div>
          <div class="kicker">NALSSAM PERSONAL REPORT · ${esc(me.year)} · 🔒 본인 열람용</div>
          <h2>${esc(me.year)}학년도 [날샘] 개인별 연간 활동 및 탐구 보고서</h2>
          <div class="sub">학교생활기록부(동아리활동 특기사항) 기초 자료</div>
        </div>
        <div class="paper-logo">${leafSvg}<div>대전대신고 날샘</div><div>환경·생태 동아리</div></div>
      </div>
      <div class="p-sec"><h3><span class="n">1</span>기본 인적 사항 및 소속</h3>
        <table><thead><tr><th>학번</th><th>이름</th><th>소속 부서</th><th>진로 및 주요 관심 분야</th></tr></thead>
        <tbody><tr><td>${val(p.student_no, '학번')}</td><td>${val(p.name, '이름')}</td><td>${val(p.department, '부서')}</td><td>${val(p.career, '진로')}</td></tr></tbody></table>
      </div>
      <div class="p-sec"><h3><span class="n">2</span>${esc(me.year)} 연간 동아리 활동 참여 현황</h3>
        <table><tbody>${PARTICIPATION.map(([k, label, roleLabel]) => { const v = r.participation[k] || {}; return `<tr><td style="width:24px;text-align:center">${v.checked ? '☑' : '☐'}</td><td>${esc(label)}</td><td>${v.role ? `<b>${esc(roleLabel)}:</b> ${esc(v.role)}` : `<span class="p-empty">${esc(roleLabel)}:</span>`}</td></tr>`; }).join('')}</tbody></table>
      </div>
      <div class="p-sec"><h3><span class="n">3</span>핵심 활동 및 심화 탐구 기록</h3>
        ${r.cores.map((c, i) => `
          <table style="margin-bottom:12px"><thead><tr><th colspan="2">[활동 ${i + 1}] 선택 활동명 : ${c.title ? esc(c.title) : '<span class="p-empty" style="font-weight:400">활동명</span>'}</th></tr></thead><tbody>
            ${[['competency', '드러내고자 하는 핵심 역량'], ['purpose', '탐구(활동) 목적 (Why?)'], ['keywords', '핵심 키워드']].map(([k, l]) => `<tr><th style="width:150px">${l}</th><td style="white-space:pre-line">${val(c[k], CORE_FIELDS.find((f) => f[0] === k)[2])}</td></tr>`).join('')}
            <tr><th>탐구 진행 과정</th><td style="white-space:pre-line">${[['motive', '탐구 동기'], ['topic', '주제 설정'], ['method', '자료 수집 및 실험'], ['analysis', '자료 분석'], ['conclusion', '결론 도출']].map(([k, l]) => `<div style="margin-bottom:4px"><b>• ${l}:</b> ${val(c[k], '')}</div>`).join('')}</td></tr>
            <tr><th>산출물 및 자체 평가</th><td style="white-space:pre-line"><div style="margin-bottom:4px"><b>• 최종 산출물:</b> ${val(c.output, '')}</div><div><b>• 활동 평가(성장 및 한계점):</b> ${val(c.evaluation, '')}</div></td></tr>
            <tr><th>추후 연계 활동</th><td style="white-space:pre-line">${val(c.followup, CORE_FIELDS.find((f) => f[0] === 'followup')[2])}</td></tr>
          </tbody></table>`).join('')}
      </div>
      <div class="p-sec"><h3><span class="n">4</span>동아리 내 기여도 및 공동체 역량</h3>
        <table><tbody>
          <tr><th style="width:150px">구체적 기여 사례</th><td style="white-space:pre-line">${val(r.contribution.case, '부서 활동, 행사 준비, 팀 프로젝트에서 협력해 기여한 구체적 사례')}</td></tr>
          <tr><th>느낀 점 및 공동체 역량</th><td style="white-space:pre-line">${val(r.contribution.feeling, '')}</td></tr>
        </tbody></table>
      </div>
      <div class="paper-foot"><span>날샘 개인 보고서 · 본인 열람용</span><span>${esc(me.year)}</span></div>
    </article>`;
  }

  /* ---------------- 날샘 소개 발표 (동아리 전체 덱) ---------------- */
  function buildClubSlides() {
    const acts = Store.activities;
    const foot = `<div class="s-foot"><span>날샘 · 대전대신고등학교 환경·생태 동아리</span><span>${esc(SEED.club.year)}</span></div>`;
    const ext = acts.filter((a) => ['외부대회', '연계사업'].includes(a.category)).length;
    const feat = Store.get('startupcycling-2026-coffeeshield');
    const S = [];
    S.push(`<section class="slide lime"><span class="s-blob"></span>
      <div class="s-kicker" style="color:#1F6B2C">대전대신고등학교 · 환경 · 생태</div>
      <h1 class="s-title" style="font-size:160px">날샘<span style="font-family:var(--serif);font-style:italic;font-weight:400;font-size:.55em;color:#2F8A3B"> nalssam.</span></h1>
      <div class="s-sub" style="color:#17502A">자라나는 기록, 함께 쌓는 숲</div>
      <div class="s-chips">${SEED.club.departments.map((d) => `<span>${esc(d.key)} · ${esc(d.en)}</span>`).join('')}</div>${foot}</section>`);
    S.push(`<section class="slide"><div class="s-kicker"><span class="n">1</span>세 갈래의 뿌리</div>
      <h2 class="s-h">기계와 생명과 물질로<br>같은 환경 문제를 봐요</h2>
      <div class="s-flow">${SEED.club.departments.map((d, i) => `<div><em>0${i + 1}</em><b>${esc(d.key)}</b><p>${esc(d.desc)}</p></div>`).join('')}</div>${foot}</section>`);
    S.push(`<section class="slide dark"><span class="s-blob"></span><div class="s-kicker"><span class="n">2</span>${esc(SEED.club.year)}, 숫자로 보기</div>
      <div class="s-metrics" style="margin-top:60px">
        <div class="s-metric"><span>올해 활동</span><b>${SEED.activities.length}</b></div>
        <div class="s-metric"><span>대회 · 연계사업</span><b>${Math.max(ext, SEED.activities.filter((a) => ['외부대회', '연계사업'].includes(a.category)).length)}</b></div>
        <div class="s-metric"><span>부서</span><b>3</b></div>
      </div>${foot}</section>`);
    const list = SEED.activities.map((a) => a.title);
    S.push(`<section class="slide"><div class="s-kicker"><span class="n">3</span>한 해 동안 뻗어 나간 줄기</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 50px;margin-top:50px">${list.map((t, i) => `<div style="display:flex;gap:18px;align-items:baseline;font-size:32px;font-weight:700;letter-spacing:-.03em;border-bottom:2px dashed #CDEB9B;padding-bottom:10px"><span style="font-family:var(--serif);font-style:italic;color:#86C93F;font-size:30px">${String(i + 1).padStart(2, '0')}</span>${esc(t)}</div>`).join('')}</div>${foot}</section>`);
    if (feat) {
      S.push(`<section class="slide lime"><div class="s-kicker" style="color:#1F6B2C"><span class="n">4</span>대표 기록</div>
        <h2 class="s-h">${esc(feat.subtitle || feat.title)}</h2><div class="s-body" style="color:#17502A;max-width:1200px">${esc(feat.tagline || feat.summary)}</div>
        <div class="s-chips">${(feat.keywords || []).slice(0, 5).map((k) => `<span>#${esc(k)}</span>`).join('')}</div>${foot}</section>`);
    }
    S.push(`<section class="slide dark"><span class="s-blob"></span><div class="s-kicker"><span class="n">${feat ? 5 : 4}</span>기록은 각자, 숲은 함께</div>
      <div class="s-flow" style="margin-top:50px">
        <div><em>01</em><b>학교 메일로 로그인</b><p>비밀번호 없이 메일 링크로</p></div>
        <div><em>02</em><b>내 기록 · 개인 보고서</b><p>학번 · 진로 · 개인 보고서는 나만 보기</p></div>
        <div><em>03</em><b>팀 보고서 남기기</b><p>공개 범위는 작성자가 직접</p></div>
      </div>${foot}</section>`);
    S.push(`<section class="slide lime"><span class="s-blob"></span><div style="margin:auto 0"><div class="s-big" style="font-size:200px">함께 자라요.</div><div class="s-sub" style="color:#17502A">날샘 아카이브</div></div>${foot}</section>`);
    return S;
  }

  /* ---------------- LaTeX (Overleaf) ---------------- */
  const tx = (s) => String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}$&#%_])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/×/g, '$\\times$')
    .replace(/→/g, '$\\rightarrow$')
    .replace(/₂/g, '\\textsubscript{2}');

  function texBlock(text, guide) {
    const v = (text || '').trim();
    if (!v) return `\\guide{${(guide || '').split('\n').map(tx).join(' \\\\\n')}}`;
    const lines = v.split('\n').map((l) => l.trim()).filter(Boolean);
    let out = ''; let inList = false;
    lines.forEach((l) => {
      const m = l.match(/^[•\-\*]\s*(.*)$/);
      if (m) { if (!inList) { out += '\\begin{itemize}\n'; inList = true; } out += `  \\item ${tx(m[1])}\n`; }
      else { if (inList) { out += '\\end{itemize}\n'; inList = false; } out += `${tx(l)}\n\n`; }
    });
    if (inList) out += '\\end{itemize}\n';
    return out.trim();
  }

  function toTex(a) {
    a = normalize(a);
    const r = a.report;
    const members = a.members.filter((m) => m.name);
    const procs = r.process.filter((p) => p.title || p.detail);
    const mets = r.metrics.filter((m) => m.label || m.value);
    const decs = r.decisions.filter((d) => d.from || d.to);
    const items = (a.budget?.items || []).filter((i) => i.name);
    const total = a.budget?.total || items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const rows = (arr, fn, cols, empty) => (arr.length ? arr.map(fn).join('\n') : `\\multicolumn{${cols}}{p{0.92\\linewidth}}{\\guide{${tx(empty)}}} \\\\`);

    return String.raw`% =========================================================
% 날샘 활동 보고서 표준 양식 v1.0 (LaTeX / Overleaf)
% Overleaf: Menu → Compiler 를 XeLaTeX 로 바꾼 뒤 Recompile
% 이 파일은 날샘 아카이브 [보고서 양식]에서 자동 생성되었습니다.
% =========================================================
\documentclass[11pt,a4paper]{article}
\usepackage{kotex}
% Overleaf 기본 설치 글꼴. 로컬에서 글꼴이 없다면 UnBatang / UnDotum 으로 바꾸세요.
\setmainhangulfont{Noto Serif CJK KR}
\setsanshangulfont{Noto Sans CJK KR}
\setmainfont{Noto Serif CJK KR}
\setsansfont{Noto Sans CJK KR}
\usepackage[a4paper,top=20mm,bottom=22mm,left=20mm,right=20mm]{geometry}
\usepackage{xcolor}
\usepackage{tabularx,booktabs,array,colortbl}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{fancyhdr}
\usepackage[most]{tcolorbox}
\usepackage[hidelinks]{hyperref}

\definecolor{forest}{HTML}{1F6B2C}
\definecolor{leaf}{HTML}{5FB236}
\definecolor{lime}{HTML}{E3F3C8}
\definecolor{paleleaf}{HTML}{F2F9E6}
\definecolor{ink}{HTML}{12331A}
\definecolor{mute}{HTML}{8AA08C}

\newcommand{\guide}[1]{{\color{mute}\itshape #1}}
\newcommand{\kw}[1]{\colorbox{lime}{\small\sffamily\bfseries\color{forest}\##1}\,}

\titleformat{\section}{\sffamily\large\bfseries\color{ink}}{\colorbox{forest}{\color{white}\makebox[1.1em]{\thesection}}}{0.6em}{}[{\color{lime}\titlerule[1pt]}]
\titlespacing*{\section}{0pt}{14pt}{6pt}
\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt,label={\color{leaf}\textbullet}}
\renewcommand{\arraystretch}{1.35}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}

\pagestyle{fancy}\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\fancyhead[L]{\sffamily\footnotesize\color{mute}날샘 활동 보고서 표준 양식 v1.0}
\fancyhead[R]{\sffamily\footnotesize\color{mute}대전대신고등학교 환경·생태 동아리 날샘}
\fancyfoot[C]{\sffamily\footnotesize\color{mute}\thepage}

\begin{document}

{\color{leaf}\rule{\linewidth}{4pt}}\\[6pt]
{\sffamily\footnotesize\bfseries\color{leaf}NALSSAM ACTIVITY SUMMARY · ${tx(a.year)}}\\[2pt]
{\sffamily\LARGE\bfseries\color{ink} ${tx(a.title || '활동명')}}\\[2pt]
{\sffamily\large\bfseries\color{forest} ${tx(a.subtitle || '')}}\\[-2pt]
{\color{forest}\rule{\linewidth}{1.2pt}}

\begin{tabularx}{\linewidth}{>{\columncolor{paleleaf}\sffamily\bfseries\color{forest}}l X}
\toprule
분류 & ${tx(a.category)} \\
기간 · 상태 & ${tx(a.period || '—')} \;|\; ${tx(a.status)} \\
주관 · 협력 & ${tx([a.organizer, a.partner].filter(Boolean).join(' / ') || '—')} \\
팀 & ${tx(a.team || '—')} \\
구성원 · 역할 & ${members.length ? tx(members.map((m) => `${m.name}(${m.role || '-'})`).join(', ')) : '\\guide{이름(역할), 이름(역할)}'} \\${a.award ? `\n수상 & ${tx(a.award)} \\\\` : ''}
\bottomrule
\end{tabularx}

\section{요약 {\normalsize\color{mute}Abstract}}
\begin{tcolorbox}[colback=paleleaf,colframe=forest,boxrule=0.8pt,arc=2pt,left=8pt,right=8pt]
${texBlock(r.abstract, GUIDE.abstract)}
\end{tcolorbox}
${a.keywords.length ? a.keywords.map((k) => `\\kw{${tx(k)}}`).join(' ') : '\\guide{\\#키워드1 \\#키워드2 \\#키워드3}'}\\[2pt]
{\sffamily\small\bfseries\color{forest}핵심 역량}\; ${r.competency ? tx(r.competency) : `\\guide{${tx(GUIDE.competency)}}`}

\section{배경 및 문제 정의 {\normalsize\color{mute}Why?}}
${texBlock(r.background, GUIDE.background)}

\section{목표 및 가설 {\normalsize\color{mute}Hypothesis}}
${texBlock(r.goal, GUIDE.goal)}

\section{진행 과정 {\normalsize\color{mute}Process}}
\begin{tabularx}{\linewidth}{>{\sffamily\color{leaf}\bfseries}l >{\bfseries}p{0.26\linewidth} X}
\toprule
\rowcolor{paleleaf}\color{forest}단계 & \color{forest}내용 & \sffamily\bfseries\color{forest}세부 활동 · 산출물 \\
\midrule
${rows(procs, (p) => `${tx(p.step)} & ${tx(p.title)} & ${tx(p.detail)} \\\\`, 3, GUIDE.process)}
\bottomrule
\end{tabularx}

\section{결과 및 산출물 {\normalsize\color{mute}Results}}
${mets.length ? String.raw`\begin{tabularx}{\linewidth}{X >{\bfseries\color{forest}}l X}
\toprule
\rowcolor{paleleaf}\sffamily\bfseries\color{forest}지표 & 값 & \sffamily\bfseries\color{forest}비고 \\
\midrule
${mets.map((m) => `${tx(m.label)} & ${tx(m.value)} & ${tx(m.note || '')} \\\\`).join('\n')}
\bottomrule
\end{tabularx}` : ''}

${texBlock(r.results, GUIDE.results)}

\section{의사결정 기록 {\normalsize\color{mute}Pivot log}}
\begin{tabularx}{\linewidth}{p{0.24\linewidth} >{\bfseries}p{0.24\linewidth} X}
\toprule
\rowcolor{paleleaf}\sffamily\bfseries\color{forest}이전 안 & \sffamily\color{forest}바뀐 안 & \sffamily\bfseries\color{forest}바꾼 이유 \\
\midrule
${rows(decs, (d) => `${tx(d.from)} & ${tx(d.to)} & ${tx(d.reason)} \\\\`, 3, GUIDE.decisions)}
\bottomrule
\end{tabularx}

\section{고찰: 성장과 한계 {\normalsize\color{mute}Discussion}}
${texBlock(r.reflection, GUIDE.reflection)}

\section{예산 집행 {\normalsize\color{mute}${tx(a.budget?.note || 'Budget')}}}
{\small
\begin{tabularx}{\linewidth}{>{\raggedright\arraybackslash}p{0.25\linewidth} X r r r}
\toprule
\rowcolor{paleleaf}\sffamily\bfseries\color{forest}품목 & \sffamily\bfseries\color{forest}구입 목적 & \sffamily\bfseries\color{forest}단가 & \sffamily\bfseries\color{forest}수량 & \sffamily\bfseries\color{forest}합계 \\
\midrule
${rows(items, (i) => `${tx(i.name)} & ${tx(i.purpose)} & ${won(i.unit)} & ${tx(i.qty)} & ${won(i.total)} \\\\`, 5, '해당 없음 또는 품목 · 구입 목적 · 단가 · 수량 · 합계')}${items.length ? `\n\\midrule\n\\multicolumn{4}{r}{\\sffamily\\bfseries 소계} & \\textbf{${won(total)}원} \\\\` : ''}
\bottomrule
\end{tabularx}}

\section{후속 연계 활동 {\normalsize\color{mute}Next}}
${texBlock(r.followup, GUIDE.followup)}

\section{참고문헌 및 첨부 자료 {\normalsize\color{mute}References}}
${r.references.filter(Boolean).length ? `\\begin{enumerate}[leftmargin=1.6em,itemsep=0pt]\n${r.references.filter(Boolean).map((x) => `  \\item ${tx(x)}`).join('\n')}\n\\end{enumerate}` : `\\guide{${tx(GUIDE.references)}}`}
${a.links.length ? `\n{\\small\\sffamily\\bfseries\\color{forest}첨부 자료}\n\\begin{itemize}\n${a.links.map((l) => `  \\item \\href{${String(safeUrl(l.url)).replace(/([%#&])/g, '\\$1')}}{${tx(l.label)}}`).join('\n')}\n\\end{itemize}` : ''}

\vfill
\begin{flushright}
\sffamily\small 작성자 \underline{\makebox[3.2cm]{${tx(members[0]?.name || '')}}}\qquad 지도교사 확인 \underline{\makebox[3.2cm]{}}
\end{flushright}

\end{document}
`;
  }

  function downloadTex(a) { downloadFile(`${a.id || slug(a.title) || 'nalssam-summary'}.tex`, toTex(a), 'application/x-tex'); toast('.tex 파일을 만들었어요. Overleaf에서 XeLaTeX로 컴파일하세요'); }

  // Overleaf 새 프로젝트로 보내기 (사용자가 버튼을 눌렀을 때만)
  function postToOverleaf(tex, name) {
    const f = Object.assign(document.createElement('form'), { method: 'POST', action: 'https://www.overleaf.com/docs', target: '_blank' });
    [['encoded_snip', encodeURIComponent(tex)], ['snip_name', name], ['engine', 'xelatex']].forEach(([n, v]) => {
      f.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: n, value: v }));
    });
    document.body.appendChild(f); f.submit(); f.remove();
  }
  const openOverleaf = (a) => postToOverleaf(toTex(a), `${a.title || 'nalssam-summary'}.tex`);

  /* ---------------- 발표 모드 (HTML 슬라이드) ---------------- */
  const Deck = {
    i: 0, n: 0,
    open(a) {
      if (!a) return;
      this.show(buildSlides(normalize(a)));
    },
    show(slides) {
      const stage = $('#deckStage');
      stage.innerHTML = slides.join('');
      this.n = slides.length; this.i = 0;
      $('#deck').hidden = false;
      document.body.style.overflow = 'hidden';
      this.fit(); this.go(0);
      $('#deck').focus?.();
    },
    close() {
      $('#deck').hidden = true;
      document.body.style.overflow = '';
      if (document.fullscreenElement) document.exitFullscreen?.();
    },
    go(k) {
      this.i = Math.max(0, Math.min(this.n - 1, k));
      $$('.slide', $('#deckStage')).forEach((s, j) => { s.classList.toggle('on', j === this.i); s.classList.toggle('past', j < this.i); });
      $('#deckCount').textContent = `${this.i + 1} / ${this.n}`;
      $('#deckBar').style.width = `${((this.i + 1) / this.n) * 100}%`;
    },
    fit() {
      const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900) * 0.94;
      $('#deckStage').style.transform = `translate(-50%, -50%) scale(${s})`;
    },
  };

  function buildSlides(a) {
    const r = a.report;
    const S = [];
    const foot = `<div class="s-foot"><span>날샘 · ${esc(a.title)}</span><span>${esc(a.team || a.year)}</span></div>`;
    let n = 0;
    const kick = (label) => `<div class="s-kicker"><span class="n">${++n}</span>${esc(label)}</div>`;

    S.push(`<section class="slide lime"><span class="s-blob"></span>
      <div class="s-kicker" style="color:#1F6B2C">${esc(a.category)} · ${esc(a.year)}</div>
      <h1 class="s-title">${esc(a.subtitle || a.title)}</h1>
      <div class="s-sub" style="color:#17502A">${esc(a.tagline || (a.subtitle ? a.title : a.summary))}</div>
      <div class="s-chips">${a.members.filter((m) => m.name).map((m) => `<span>${esc(m.name)} · ${esc(m.role)}</span>`).join('') || deptChipsSlide(a)}</div>
      ${foot}</section>`);

    if (r.background || (r.metrics || []).some((m) => m.value)) {
      const m0 = (r.metrics || []).find((m) => m.value);
      S.push(`<section class="slide">${kick('왜 이 문제인가')}
        <div class="s-two" style="flex:1">
          <div>${m0 ? `<div class="s-big">${esc(m0.value)}</div><div class="s-body" style="margin-top:20px;font-weight:700">${esc(m0.label)}${m0.note ? ` <span style="font-weight:500;color:#6E8571">(${esc(m0.note)})</span>` : ''}</div>` : `<h2 class="s-h">문제 정의</h2>`}</div>
          <div class="s-body" style="font-size:27px">${esc(trimLines(r.background, 5))}</div>
        </div>${foot}</section>`);
    }
    if (r.goal) {
      S.push(`<section class="slide dark"><span class="s-blob"></span>${kick('가설과 목표')}
        <h2 class="s-h" style="max-width:1200px">${esc(firstSentence(r.goal))}</h2>
        <div class="s-body">${esc(trimLines(r.goal, 4, 1))}</div>${foot}</section>`);
    }
    const procs = (r.process || []).filter((p) => p.title);
    if (procs.length) {
      const chunk = procs.length > 5 ? [procs.slice(0, Math.ceil(procs.length / 2)), procs.slice(Math.ceil(procs.length / 2))] : [procs];
      chunk.forEach((c, ci) => S.push(`<section class="slide">${kick(ci ? '진행 과정 (이어서)' : '진행 과정')}
        <h2 class="s-h">${ci ? '만들고, 시험하고, 보여주기' : '어떻게 해왔나'}</h2>
        <div class="s-flow" style="flex:1;align-items:start">${c.map((p) => `<div><em>${esc(p.step)}</em><b>${esc(p.title)}</b><p>${esc(p.detail || '')}</p></div>`).join('')}</div>${foot}</section>`));
    }
    const decs = (r.decisions || []).filter((d) => d.from);
    if (decs.length) {
      S.push(`<section class="slide lime">${kick('방향을 바꾼 순간')}
        <div style="display:grid;gap:22px;margin-top:40px">${decs.map((d) => `<div style="display:grid;grid-template-columns:1fr 80px 1.2fr;align-items:center;background:#fff;border-radius:28px;padding:30px 38px">
          <span style="font-size:32px;color:#6E8571;text-decoration:line-through;text-decoration-color:#AEDD62;text-decoration-thickness:4px">${esc(d.from)}</span>
          <span style="font-size:42px;color:#5FB236;text-align:center">→</span>
          <b style="font-size:38px;color:#1F6B2C;letter-spacing:-.04em">${esc(d.to)}</b></div>`).join('')}</div>${foot}</section>`);
    }
    const mets = (r.metrics || []).filter((m) => m.value);
    if (mets.length || r.results) {
      S.push(`<section class="slide">${kick('결과')}
        <h2 class="s-h">무엇이 만들어졌나</h2>
        ${mets.length ? `<div class="s-metrics">${mets.slice(0, 6).map((m) => `<div class="s-metric"><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join('')}</div>` : `<div class="s-body">${esc(trimLines(r.results, 6))}</div>`}
        ${foot}</section>`);
    }
    if (a.budget?.items?.length) {
      const top = [...a.budget.items].sort((x, y) => y.total - x.total).slice(0, 5);
      S.push(`<section class="slide">${kick('예산')}
        <div class="s-two" style="flex:1"><div><div class="s-big" style="font-size:170px">${won(a.budget.total)}<span style="font-size:60px">원</span></div><div class="s-body" style="margin-top:16px">${a.budget.items.length}개 품목 · ${esc(a.budget.note || '')}</div></div>
        <div style="display:grid;gap:14px">${top.map((i) => `<div style="display:flex;justify-content:space-between;gap:20px;background:#fff;border-radius:20px;padding:20px 26px;border:2px solid #E3F3C8;font-size:26px"><b>${esc(i.name)}</b><span style="color:#1F6B2C;font-weight:800">${won(i.total)}원</span></div>`).join('')}</div></div>${foot}</section>`);
    }
    if (r.reflection || r.followup) {
      S.push(`<section class="slide dark"><span class="s-blob"></span>${kick('회고와 다음 단계')}
        <div class="s-two" style="flex:1;align-items:start;margin-top:40px">
          <div><h3 style="font-size:40px;margin:0 0 18px;color:#CDEB9B">돌아보며</h3><div class="s-body" style="font-size:26px">${esc(trimLines(r.reflection, 5))}</div></div>
          <div><h3 style="font-size:40px;margin:0 0 18px;color:#CDEB9B">다음으로</h3><div class="s-body" style="font-size:26px">${esc(trimLines(r.followup, 5))}</div></div>
        </div>${foot}</section>`);
    }
    if (S.length === 1) {
      S.push(`<section class="slide">${kick('기록 대기')}<h2 class="s-h">아직 보고서가 비어 있어요</h2><div class="s-body">[보고서 작성하기]에서 날샘 표준 양식을 채우면\n이 발표 모드가 자동으로 완성돼요.</div>${foot}</section>`);
    }
    S.push(`<section class="slide lime"><span class="s-blob"></span>
      <div style="margin:auto 0"><div class="s-big" style="font-size:200px">감사합니다.</div>
      <div class="s-chips">${(a.keywords || []).map((k) => `<span>#${esc(k)}</span>`).join('')}</div></div>${foot}</section>`);
    return S;
  }

  const deptChipsSlide = (a) => (a.departments || []).map((d) => `<span>${esc(d)}</span>`).join('');
  const trimLines = (t, max, skip = 0) => (t || '').split('\n').filter((l) => l.trim()).slice(skip, skip + max).join('\n');
  const firstSentence = (t) => ((t || '').split('\n')[0] || '').replace(/^[•\-]\s*/, '').replace(/^가설:\s*/, '');

  function bindDeck() {
    $('#deck').addEventListener('click', (e) => {
      const b = e.target.closest('[data-deck]');
      if (!b) return;
      const act = b.dataset.deck;
      if (act === 'prev') Deck.go(Deck.i - 1);
      if (act === 'next') Deck.go(Deck.i + 1);
      if (act === 'close') Deck.close();
      if (act === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else $('#deck').requestFullscreen?.(); }
    });
    $('#deckStage').addEventListener('click', (e) => { if (!e.target.closest('a')) Deck.go(Deck.i + 1); });
    document.addEventListener('keydown', (e) => {
      if ($('#deck').hidden) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); Deck.go(Deck.i + 1); }
      if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); Deck.go(Deck.i - 1); }
      if (e.key === 'Home') Deck.go(0);
      if (e.key === 'End') Deck.go(Deck.n - 1);
      if (e.key === 'Escape' && !document.fullscreenElement) Deck.close();
      if (e.key.toLowerCase() === 'f') $('#deck').requestFullscreen?.();
    });
    window.addEventListener('resize', () => { if (!$('#deck').hidden) Deck.fit(); });
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    $('#burger').addEventListener('click', (e) => {
      const open = $('.nav-links').classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    bindDeck();
    // 메일 로그인 링크는 #access_token=… 으로 돌아옴 → supabase-js가 세션으로 바꾼 뒤 라우터 주소로 정리
    const landing = location.hash;
    await Store.init();
    if (/access_token=|refresh_token=/.test(landing)) {
      history.replaceState(null, '', `${location.pathname}${location.search}#/me`);
      setTimeout(() => toast(Store.user ? `로그인했어요 · ${Store.user.email}` : '로그인 링크를 확인하지 못했어요. 다시 시도해 주세요'), 300);
    } else if (/error_description=/.test(landing)) {
      const msg = decodeURIComponent((landing.match(/error_description=([^&]+)/) || [])[1] || '').replace(/\+/g, ' ');
      history.replaceState(null, '', `${location.pathname}${location.search}#/`);
      setTimeout(() => toast('로그인 실패: ' + (msg || '링크가 만료됐을 수 있어요')), 300);
    }
    if (Store.mode === 'supabase') bindAuth();
    window.addEventListener('hashchange', render);
    render();
    window.Naelsaem = { Store, toTex, renderPaper }; // 콘솔 디버깅용
  }

  boot();
})();
