/**
 * The Oxbow app icon ("Oxbow Lake": an O whose hole sits off-center, like the
 * crescent lake a river bend leaves behind). Same artwork as
 * public/brand/oxbow-icon.svg, built by scripts/brand-logo.py. `id` keeps the
 * gradient ids unique when the mark appears twice on a page.
 */
export function BrandMark({ size = 38, id = 'ox' }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}m`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF6FF" />
          <stop offset=".45" stopColor="#8FCBFF" />
          <stop offset="1" stopColor="#3B7BFF" />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#132845" />
          <stop offset="1" stopColor="#060D19" />
        </linearGradient>
        <radialGradient id={`${id}l`} cx=".3" cy=".1" r=".8">
          <stop offset="0" stopColor="#9FD2FF" stopOpacity=".22" />
          <stop offset="1" stopColor="#9FD2FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="128" height="128" rx="30" fill={`url(#${id}t)`} />
      <rect width="128" height="128" rx="30" fill={`url(#${id}l)`} />
      <path
        transform="translate(13.44 13.44) scale(.79)"
        fillRule="evenodd"
        fill={`url(#${id}m)`}
        d="M106 64A42 42 0 1 1 22 64A42 42 0 1 1 106 64ZM97 56A25 25 0 1 0 47 56A25 25 0 1 0 97 56Z"
      />
      <rect x=".75" y=".75" width="126.5" height="126.5" rx="29.25" fill="none" stroke="#AAD7FF" strokeOpacity=".28" strokeWidth="1.5" />
    </svg>
  );
}
