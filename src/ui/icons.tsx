import type { SVGProps } from 'react'

/** Jeu d'icônes maison (24×24, trait arrondi) : identiques sur iPhone et Android, contrairement aux emojis. */
const PATHS = {
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.6a4.2 4.2 0 1 0 0 6.8M7 10.8h6.5M7 13.2h5.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  fast: <path d="M4 6.5v11l8-5.5zM12 6.5v11l8-5.5z" fill="currentColor" />,
  fastest: <path d="M2.5 7v10l6-5zM9 7v10l6-5zM15.5 7v10l6-5z" fill="currentColor" />,
  map: <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20" />,
  empire: (
    <>
      <path d="M4 20.5V8l6-3.5v16M10 20.5V9.5l10 3.5v7.5M2.5 20.5h19" />
      <path d="M6.5 10.5v.01M6.5 14v.01M13.5 14.5v.01M16.5 15.5v.01M13.5 18v.01M16.5 18.5v.01" strokeWidth="2.6" />
    </>
  ),
  bank: <path d="M3 9.5 12 4l9 5.5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20.5h18" />,
  news: (
    <>
      <rect x="3.5" y="4.5" width="14" height="15.5" rx="2.5" />
      <path d="M17.5 8.5h3v9a2.5 2.5 0 0 1-5 0M7 8.5h7M7 12h7M7 15.5h4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14c2.7.4 4.5 2.7 4.5 5.8" />
    </>
  ),
  box: <path d="M12 3 20.5 7.5v9L12 21l-8.5-4.5v-9zM3.5 7.5 12 12l8.5-4.5M12 12v9" />,
  megaphone: <path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8l7 4V4.5l-7 4H5.5A1.5 1.5 0 0 0 4 10zM8 15.5l1.5 4.5M18.5 9.5a3.5 3.5 0 0 1 0 5" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" />,
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  alert: <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.01" />,
  trendUp: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M2.5 20.5h19" />,
  users: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  // Secteurs
  cafe: <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.6 1 .6 1.5 0 2.5M12 3.5c-.6 1 .6 1.5 0 2.5" />,
  boulangerie: <path d="M4.5 16.5C3 15 3.5 12 6.5 9s6-3.5 7.5-2c4 0 7 3 4 6.5s-9 7-13.5 3zM9 11l2 2M12 9l2 2M7 14l2 2" />,
  restaurant: <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M16.5 21V3c-2 1.5-3 4-3 7.5h3" />,
  vetements: <path d="M9 3.5 4 6l-1.5 5 3 1L6 20.5h12l.5-8.5 3-1L20 6l-5-2.5a3 3 0 0 1-6 0z" />,
  electronique: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </>
  ),
  superette: (
    <>
      <path d="M2.5 4h2.5l2.2 11h11l2-8H6" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
