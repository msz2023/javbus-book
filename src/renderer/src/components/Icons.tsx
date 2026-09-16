import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P): P => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
})

export const IconSearch = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const IconTag = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M11.6 2.6H4a1.4 1.4 0 0 0-1.4 1.4v7.6a1.4 1.4 0 0 0 .41 1L11.6 21.2a1.4 1.4 0 0 0 2 0l7.6-7.6a1.4 1.4 0 0 0 0-2L12.6 3a1.4 1.4 0 0 0-1-.4Z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </svg>
)

export const IconHome = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
)

export const IconFlame = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3 0 2 1 3 2 3s-1-5 2-9Z" />
  </svg>
)

export const IconHeart = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6c0 4.8-7 9.4-7 9.4Z" />
  </svg>
)

export const IconDownload = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M12 4v10" />
    <path d="m8 11 4 4 4-4" />
    <path d="M5 19h14" />
  </svg>
)

export const IconFilter = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
)

export const IconSettings = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7.5 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.7-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.2 3.6V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
  </svg>
)

export const IconPlay = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M8 5.5 18 12 8 18.5Z" fill="currentColor" stroke="none" />
  </svg>
)

export const IconPause = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconFolder = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
  </svg>
)

export const IconCopy = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 5H6a1 1 0 0 0-1 1v9" />
  </svg>
)

export const IconMagnet = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M5 4v7a7 7 0 0 0 14 0V4h-4v7a3 3 0 0 1-6 0V4Z" />
    <path d="M5 8h4M15 8h4" />
  </svg>
)

export const IconRefresh = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 4v5h-5" />
  </svg>
)

export const IconChevronLeft = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="m14 6-6 6 6 6" />
  </svg>
)

export const IconChevronRight = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="m10 6 6 6-6 6" />
  </svg>
)

export const IconClose = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconCheck = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="m5 13 4 4 10-10" />
  </svg>
)

export const IconTrash = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 13h10l1-13" />
  </svg>
)

export const IconSpinner = (p: P): JSX.Element => (
  <svg {...base(p)} className={`animate-spin ${p.className ?? ''}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
)

export const IconExternal = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="M14 5h5v5" />
    <path d="M19 5l-8 8" />
    <path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
  </svg>
)

export const IconLayers = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <path d="m12 3 8 4.5-8 4.5-8-4.5Z" />
    <path d="m4 12 8 4.5 8-4.5" />
    <path d="m4 16.5 8 4.5 8-4.5" />
  </svg>
)

// ---- 视图切换：完整图像 / 小图像 / 详细信息 ----

export const IconViewCover = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="m3 15 5-4 4 3 3-2 6 4" />
    <circle cx="8.5" cy="9.5" r="1.2" />
  </svg>
)

export const IconViewThumb = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="8" rx="1" />
    <rect x="14" y="3" width="7" height="8" rx="1" />
    <rect x="3" y="13" width="7" height="8" rx="1" />
    <rect x="14" y="13" width="7" height="8" rx="1" />
  </svg>
)

export const IconViewDetail = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="5" height="5" rx="1" />
    <rect x="3" y="15" width="5" height="5" rx="1" />
    <path d="M11 5.5h10M11 8h6M11 16.5h10M11 19h6" />
  </svg>
)

/** 「打开 BitComet」用：一个彗星/流星 */
export const IconComet = (p: P): JSX.Element => (
  <svg {...base(p)}>
    <circle cx="16" cy="8" r="4" />
    <path d="M13.2 10.8 4 20" />
    <path d="M8.5 12.5 5 13.5M11.5 15.5l-1 3.5" />
  </svg>
)
