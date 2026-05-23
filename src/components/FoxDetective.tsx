export default function FoxDetective({ size = 140 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * (210 / 160)}
      viewBox="0 0 160 210"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="책탐정 도서나루 마스코트 탐탐이"
    >
      {/* ── 꼬리 (몸 뒤, 오른쪽) ── */}
      <path d="M108 138 Q150 125 152 162 Q153 192 128 190 Q110 185 108 165 Q107 150 114 140 Z"
        fill="#E8722A"/>
      <path d="M134 184 Q148 192 132 193 Q118 191 116 174 Q121 168 128 178 Z"
        fill="#FFF5EC"/>

      {/* ── 코트 몸통 ── */}
      <path d="M42 118 Q80 108 118 118 L122 182 Q80 190 38 182 Z" fill="#B8996A"/>
      {/* 체크 패턴 세로선 */}
      {[52,62,72,82,92,102,112].map(x => (
        <line key={x} x1={x} y1={120} x2={x - 2} y2={180}
          stroke="#8B7350" strokeWidth="1.2" opacity="0.4"/>
      ))}
      {/* 체크 패턴 가로선 */}
      {[130,142,154,166,178].map(y => (
        <line key={y} x1={42 + (y-118)*0.1} y1={y} x2={118 - (y-118)*0.1} y2={y}
          stroke="#8B7350" strokeWidth="1.2" opacity="0.4"/>
      ))}

      {/* 코트 안감 (가슴 흰색) */}
      <path d="M66 116 L78 126 L80 186 L38 182 L42 118 Z" fill="#C9A87A" opacity="0.6"/>
      <path d="M94 116 L82 126 L80 186 L122 182 L118 118 Z" fill="#C9A87A" opacity="0.6"/>
      {/* 흰 셔츠·넥타이 */}
      <ellipse cx="80" cy="126" rx="11" ry="15" fill="#FFF5EC"/>
      <polygon points="77,118 83,118 81,114" fill="#5C4A3D"/>
      <path d="M80 118 L75 134 L80 138 L85 134 Z" fill="#5C4A3D"/>

      {/* 라펠 */}
      <path d="M42 118 L56 112 L78 128 L42 134 Z" fill="#9A8055"/>
      <path d="M118 118 L104 112 L82 128 L118 134 Z" fill="#9A8055"/>

      {/* 버튼 */}
      {[148, 160, 172].map(y => (
        <circle key={y} cx={80} cy={y} r={3.2} fill="#C9A227"
          stroke="#A07A10" strokeWidth="0.8"/>
      ))}

      {/* 벨트 */}
      <rect x="41" y="152" width="78" height="9" rx="4" fill="#6B3A2A"/>
      {/* 버클 */}
      <rect x="72" y="150" width="16" height="13" rx="3" fill="#C9A227"/>
      <rect x="74" y="152" width="12" height="9" rx="2" fill="#A07A10"/>
      <line x1="80" y1="151" x2="80" y2="162" stroke="#C9A227" strokeWidth="1.5"/>

      {/* ── 왼팔/소매 (돋보기 쪽) ── */}
      <path d="M42 118 Q22 128 18 152 Q16 165 30 168 L44 163 Q46 148 50 130 Z"
        fill="#B8996A"/>
      {/* 체크 */}
      {[0,6,12].map(i => (
        <line key={i} x1={42-i*1.5} y1={120+i*4} x2={30-i*1.2} y2={165+i*0.5}
          stroke="#8B7350" strokeWidth="1" opacity="0.35"/>
      ))}
      {/* 손 */}
      <ellipse cx="28" cy="168" rx="10" ry="8" fill="#3D2010"/>

      {/* ── 오른팔/소매 ── */}
      <path d="M118 118 Q138 128 142 152 Q144 165 130 168 L116 163 Q114 148 110 130 Z"
        fill="#B8996A"/>
      {/* 손 */}
      <ellipse cx="132" cy="168" rx="10" ry="8" fill="#3D2010"/>

      {/* ── 다리 ── */}
      <rect x="55" y="179" width="22" height="24" rx="10" fill="#E8722A"/>
      <rect x="83" y="179" width="22" height="24" rx="10" fill="#E8722A"/>
      {/* 발 */}
      <ellipse cx="66" cy="202" rx="16" ry="8" fill="#3D2010"/>
      <ellipse cx="94" cy="202" rx="16" ry="8" fill="#3D2010"/>

      {/* ── 돋보기 ── */}
      <circle cx="16" cy="150" r="17" fill="none" stroke="#888" strokeWidth="3.5"/>
      <circle cx="16" cy="150" r="13.5" fill="rgba(210,235,255,0.35)"/>
      <circle cx="16" cy="150" r="13.5" fill="none" stroke="#aaa" strokeWidth="1"/>
      {/* 렌즈 반사 */}
      <path d="M9 143 Q11 141 14 143" stroke="white" strokeWidth="2"
        fill="none" strokeLinecap="round" opacity="0.7"/>
      {/* 손잡이 */}
      <line x1="28" y1="162" x2="38" y2="172" stroke="#5C3A1E"
        strokeWidth="5" strokeLinecap="round"/>
      <line x1="28" y1="162" x2="38" y2="172" stroke="#7A4E2A"
        strokeWidth="2.5" strokeLinecap="round"/>

      {/* ══ 머리 ══ */}
      {/* 귀 왼쪽 */}
      <polygon points="36,44 22,8 56,30" fill="#E8722A"/>
      <polygon points="38,42 27,12 52,30" fill="#C85F1A" opacity="0.55"/>
      {/* 귀 안쪽 분홍 */}
      <polygon points="39,40 29,16 50,30" fill="#F0A080" opacity="0.5"/>

      {/* 귀 오른쪽 */}
      <polygon points="124,44 138,8 104,30" fill="#E8722A"/>
      <polygon points="122,42 133,12 108,30" fill="#C85F1A" opacity="0.55"/>
      <polygon points="121,40 131,16 110,30" fill="#F0A080" opacity="0.5"/>

      {/* ── 탐정 모자 (헌팅캡/디어스토커) ── */}
      {/* 뒷챙 */}
      <path d="M44 48 Q80 34 116 48 L114 52 Q80 38 46 52 Z" fill="#5C4A35"/>
      {/* 모자 돔 */}
      <path d="M48 50 Q80 36 112 50 L110 78 Q80 86 50 78 Z" fill="#8B7355"/>
      {/* 체크 세로 */}
      {[56,65,74,80,86,95,104].map(x => (
        <line key={x} x1={x} y1={50 + Math.abs(x-80)*0.15}
          x2={x + (x < 80 ? -1 : 1)} y2={76}
          stroke="#5C4A35" strokeWidth="1.5" opacity="0.5"/>
      ))}
      {/* 체크 가로 */}
      <line x1="50" y1="60" x2="110" y2="60" stroke="#5C4A35" strokeWidth="1.5" opacity="0.5"/>
      <line x1="49" y1="69" x2="111" y2="69" stroke="#5C4A35" strokeWidth="1.5" opacity="0.5"/>
      {/* 앞챙 */}
      <path d="M44 76 Q80 88 116 76 L115 81 Q80 94 45 81 Z" fill="#5C4A35"/>
      {/* 모자 꼭지 */}
      <ellipse cx="80" cy="36" rx="6" ry="5" fill="#5C4A35"/>
      <circle cx="80" cy="33" r="2.5" fill="#3D2B1F"/>
      {/* 꼭지 매듭 표현 */}
      <path d="M76 34 Q80 37 84 34" stroke="#3D2B1F" strokeWidth="1.5"
        fill="none" strokeLinecap="round"/>

      {/* ── 얼굴 ── */}
      {/* 머리 */}
      <circle cx="80" cy="70" r="42" fill="#E8722A"/>

      {/* 흰 뺨/주둥이 */}
      <ellipse cx="80" cy="82" rx="24" ry="19" fill="#FFF5EC"/>

      {/* 눈 왼쪽 */}
      <circle cx="63" cy="64" r="12" fill="white"/>
      <circle cx="63" cy="64" r="9" fill="#C87137"/>
      <circle cx="63" cy="65" r="5.5" fill="#2C1A0E"/>
      <circle cx="65.5" cy="62" r="2.5" fill="white"/>
      <circle cx="63.5" cy="67" r="1.2" fill="white" opacity="0.4"/>
      {/* 눈썹 왼쪽 */}
      <path d="M54 53 Q63 48 72 53" stroke="#3D2010" strokeWidth="2.8"
        fill="none" strokeLinecap="round"/>

      {/* 눈 오른쪽 */}
      <circle cx="97" cy="64" r="12" fill="white"/>
      <circle cx="97" cy="64" r="9" fill="#C87137"/>
      <circle cx="97" cy="65" r="5.5" fill="#2C1A0E"/>
      <circle cx="99.5" cy="62" r="2.5" fill="white"/>
      <circle cx="97.5" cy="67" r="1.2" fill="white" opacity="0.4"/>
      {/* 눈썹 오른쪽 */}
      <path d="M88 53 Q97 48 106 53" stroke="#3D2010" strokeWidth="2.8"
        fill="none" strokeLinecap="round"/>

      {/* 코 */}
      <ellipse cx="80" cy="80" rx="5.5" ry="4.5" fill="#2C1A0E"/>
      <ellipse cx="78.5" cy="79" rx="1.8" ry="1.3" fill="white" opacity="0.45"/>

      {/* 입 (미소) */}
      <path d="M72 87 Q80 95 88 87" stroke="#2C1A0E" strokeWidth="2.2"
        fill="none" strokeLinecap="round"/>
      <path d="M72 87 Q74 89 76 88" stroke="#2C1A0E" strokeWidth="1.5"
        fill="none" strokeLinecap="round" opacity="0.5"/>
      <path d="M88 87 Q86 89 84 88" stroke="#2C1A0E" strokeWidth="1.5"
        fill="none" strokeLinecap="round" opacity="0.5"/>

      {/* 볼터치 */}
      <ellipse cx="52" cy="77" rx="10" ry="7" fill="#F4803A" opacity="0.28"/>
      <ellipse cx="108" cy="77" rx="10" ry="7" fill="#F4803A" opacity="0.28"/>

      {/* ── AI 반짝이 ── */}
      <path d="M130 26 L132 18 L134 26 L142 28 L134 30 L132 38 L130 30 L122 28 Z"
        fill="#F4D03F" opacity="0.92"/>
      <path d="M18 56 L19.4 51 L20.8 56 L26 57.4 L20.8 58.8 L19.4 64 L18 58.8 L12.8 57.4 Z"
        fill="#F4D03F" opacity="0.75"/>
      <circle cx="144" cy="46" r="3" fill="#F4D03F" opacity="0.8"/>
      <circle cx="9" cy="44" r="2" fill="#F4D03F" opacity="0.6"/>
      <circle cx="138" cy="14" r="1.8" fill="#F4D03F" opacity="0.5"/>
    </svg>
  );
}
