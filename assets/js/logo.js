/* =========================================================
   NALSSAM 로고 (2026 날샘 동아리 홍보영상 인트로의 연꽃 로고를 SVG로 재구성)
   - 꽃잎 5장(가운데 물방울형 + 좌우 뾰족한 꽃잎 2장씩) 윤곽선
   - 아래쪽 초록 받침 위에 필기체 NALSSAM
   variant: 'flat'  = 좌측 상단 · 일반 표시용 (초록)
            'front' = 입체 로고 앞면 (은빛 금속 + 초록)
            'side'  = 입체 로고 두께(옆면) 레이어
   ========================================================= */
(() => {
  const PETALS = [
    // 가운데 물방울 꽃잎
    'M120 14 C136 42 150 70 146 98 C143 118 97 118 94 98 C90 70 104 42 120 14 Z',
    // 안쪽 좌우 꽃잎
    'M101 114 C80 94 71 70 72 40 C93 54 106 72 112 96 Z',
    'M139 114 C160 94 169 70 168 40 C147 54 134 72 128 96 Z',
    // 바깥쪽 좌우 꽃잎
    'M92 126 C64 124 42 108 26 78 C54 82 76 94 92 110 Z',
    'M148 126 C176 124 198 108 214 78 C186 82 164 94 148 110 Z',
  ];

  const STYLE = {
    flat: { petal: 'url(#nlsPetal)', plate: 'url(#nlsPlate)', text: '#FFFFFF', textStroke: '#0E3A1A', sheen: true },
    front: { petal: 'url(#nlsMetal)', plate: 'url(#nlsPlate)', text: '#FFFFFF', textStroke: '#0E3A1A', sheen: true },
    side: { petal: '#0C3416', plate: '#0C3416', text: '#0C3416', textStroke: '#0C3416', sheen: false },
  };

  window.nalssamLogo = function nalssamLogo(variant = 'flat', attrs = '') {
    const s = STYLE[variant] || STYLE.flat;
    return `<svg viewBox="0 0 240 172" xmlns="http://www.w3.org/2000/svg" ${attrs}>
      <g fill="none" stroke="${s.petal}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
        ${PETALS.map((d) => `<path d="${d}"/>`).join('')}
      </g>
      <rect x="30" y="110" width="180" height="54" rx="26" fill="${s.plate}"/>
      ${s.sheen ? '<rect x="40" y="114" width="160" height="16" rx="8" fill="#FFFFFF" opacity="0.18"/>' : ''}
      <text x="120" y="152" text-anchor="middle" font-family="Lobster, 'Brush Script MT', cursive" font-size="42"
        fill="${s.text}" stroke="${s.textStroke}" stroke-width="3.2" paint-order="stroke" letter-spacing="0.5">NALSSAM</text>
    </svg>`;
  };

  // 입체 로고: 같은 그림을 여러 장 겹쳐 두께를 만들고 천천히 기울임 (마우스를 따라 살짝 회전)
  window.nalssamLogo3D = function nalssamLogo3D(depth = 16) {
    const layers = Array.from({ length: depth }, (_, i) => `<div class="l3-layer" style="--z:${depth - i}">${window.nalssamLogo('side')}</div>`).join('');
    return `<div class="logo3d" role="img" aria-label="날샘 NALSSAM 로고">
      <div class="logo3d-shadow"></div>
      <div class="logo3d-rig">${layers}<div class="l3-layer l3-front" style="--z:0">${window.nalssamLogo('front')}</div></div>
    </div>`;
  };
})();
