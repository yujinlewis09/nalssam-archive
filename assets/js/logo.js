/* =========================================================
   NALSSAM 로고 (홍보영상 인트로 · 엔딩의 연꽃 로고를 SVG로 재구성)
   - 꽃잎 5장(가운데 물방울형 + 좌우 뾰족한 꽃잎 2장씩) 윤곽선
   - 필기체 NALSSAM: 글자마다 윤곽선 → 작은 틈 → 단어 전체를 따라가는 바깥 테두리
     (받침판 없이 글자 모양 그대로 / 꽃잎 아래쪽은 단어 뒤로 가려짐)
   variant: 'flat'  = 좌측 상단 · 일반 표시용 (초록)
            'front' = 입체 로고 앞면 (은빛)
            'side'  = 입체 로고 두께(옆면) 레이어
   ========================================================= */
(() => {
  const PETALS = [
    // 가운데 물방울 꽃잎
    'M120 12 C137 40 151 68 147 96 C144 116 96 116 93 96 C89 68 103 40 120 12 Z',
    // 안쪽 좌우 꽃잎
    'M100 112 C79 92 70 68 71 38 C92 52 105 70 111 94 Z',
    'M140 112 C161 92 170 68 169 38 C148 52 135 70 129 94 Z',
    // 바깥쪽 좌우 꽃잎
    'M90 124 C62 122 39 106 22 76 C51 80 74 92 90 108 Z',
    'M150 124 C178 122 201 106 218 76 C189 80 166 92 150 108 Z',
  ];

  const STYLE = {
    flat:  { petal: 'url(#nlsPetal)', ring: 'url(#nlsPetal)', letter: '#17502A', fill: '#FFFFFF' },
    front: { petal: 'url(#nlsMetal)', ring: 'url(#nlsMetal)', letter: 'url(#nlsMetal)', fill: null },
    side:  { petal: '#24402B', ring: '#24402B', letter: '#24402B', fill: null },
  };

  let uid = 0;
  const word = (extra) => `<text x="120" y="150" text-anchor="middle" font-family="Lobster, 'Brush Script MT', cursive" font-size="45" letter-spacing="0.6" ${extra}>NALSSAM</text>`;

  window.nalssamLogo = function nalssamLogo(variant = 'flat', attrs = '') {
    const s = STYLE[variant] || STYLE.flat;
    const id = `nls${++uid}`;
    return `<svg viewBox="0 0 240 172" xmlns="http://www.w3.org/2000/svg" ${attrs}>
      <defs>
        <!-- 꽃잎 중 단어 뒤로 가려지는 부분 -->
        <mask id="${id}k" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="172">
          <rect width="240" height="172" fill="#fff"/>
          ${word('fill="#000" stroke="#000" stroke-width="22" stroke-linejoin="round"')}
        </mask>
        <!-- 단어 전체를 따라가는 바깥 테두리 (두꺼운 외곽 - 얇은 외곽) -->
        <mask id="${id}r" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="172">
          ${word('fill="#fff" stroke="#fff" stroke-width="20" stroke-linejoin="round"')}
          ${word('fill="#000" stroke="#000" stroke-width="12" stroke-linejoin="round"')}
        </mask>
      </defs>
      <g mask="url(#${id}k)" fill="none" stroke="${s.petal}" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round">
        ${PETALS.map((d) => `<path d="${d}"/>`).join('')}
      </g>
      <rect width="240" height="172" fill="${s.ring}" mask="url(#${id}r)"/>
      ${s.fill ? word(`fill="${s.fill}"`) : ''}
      ${word(`fill="none" stroke="${s.letter}" stroke-width="3.4" stroke-linejoin="round"`)}
    </svg>`;
  };

  // 입체 로고: 같은 선 그림을 여러 장 겹쳐 두께를 만들고 천천히 기울임 (마우스를 따라 살짝 회전)
  window.nalssamLogo3D = function nalssamLogo3D(depth = 14) {
    const layers = Array.from({ length: depth }, (_, i) => `<div class="l3-layer" style="--z:${depth - i}">${window.nalssamLogo('side')}</div>`).join('');
    return `<div class="logo3d" role="img" aria-label="날샘 NALSSAM 로고">
      <div class="logo3d-shadow"></div>
      <div class="logo3d-rig">${layers}<div class="l3-layer l3-front" style="--z:0">${window.nalssamLogo('front')}</div></div>
    </div>`;
  };
})();
