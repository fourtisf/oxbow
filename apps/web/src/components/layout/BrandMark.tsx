/** Oxbow logo marks from the prototype nav and footer. */
export function BrandMark() {
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="lgA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EAF5FF" />
          <stop offset="1" stopColor="#6FB2FF" />
        </linearGradient>
        <linearGradient id="lgB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16263D" />
          <stop offset="1" stopColor="#0A1422" />
        </linearGradient>
        <clipPath id="lgc">
          <rect x="2" y="2" width="36" height="36" rx="11" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#lgB)" stroke="rgba(170,215,255,.35)" />
      <g clipPath="url(#lgc)">
        <path d="M2 25 C9 20 14 29 20 24 S31 19 38 24 V38 H2Z" fill="url(#lgA)" opacity=".95" />
        <rect x="10" y="12" width="4.5" height="10" rx="1.2" fill="#9ECFFF" />
        <rect x="17.75" y="8" width="4.5" height="14" rx="1.2" fill="#D6EBFF" />
        <rect x="25.5" y="14" width="4.5" height="8" rx="1.2" fill="#6FB2FF" />
      </g>
    </svg>
  );
}

export function FooterMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="11" fill="#0E1C2D" stroke="rgba(170,215,255,.35)" />
      <path d="M8 26 C13 22 16 29 20 25 S28 21 32 25" fill="none" stroke="#9ECFFF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
