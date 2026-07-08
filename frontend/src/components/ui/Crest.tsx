interface CrestProps {
  size?: number
  className?: string
  /** 'light' for dark backgrounds (gold on transparent), 'solid' for a navy tile. */
  variant?: 'light' | 'solid'
}

/**
 * Institutional crest — a heraldic shield holding an open book.
 * Used in the sidebar, login hero, and as a watermark.
 */
export function Crest({ size = 40, className, variant = 'solid' }: CrestProps) {
  const stroke = variant === 'light' ? '#cfab45' : '#b8912e'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {variant === 'solid' && <rect width="64" height="64" rx="14" fill="#0c2038" />}
      <path
        d="M32 12 18 17v13c0 10 6 16 14 20 8-4 14-10 14-20V17L32 12Z"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      />
      {/* open book */}
      <path
        d="M32 21v22M23 26.5c3-1.6 6-1.6 9 0M23 32c3-1.6 6-1.6 9 0M23 37.5c2.4-1.3 4.8-1.5 7-.7M41 26.5c-3-1.6-6-1.6-9 0M41 32c-3-1.6-6-1.6-9 0M41 37.5c-2.4-1.3-4.8-1.5-7-.7"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
