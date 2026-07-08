interface TrustRingProps {
  score: number // 0–100
  size?: number
  stroke?: number
}

/**
 * Restrained radial gauge for the Zero Trust confidence score.
 * Muted institutional palette; understated, not neon.
 */
export function TrustRing({ score, size = 118, stroke = 8 }: TrustRingProps) {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  const color = clamped >= 80 ? '#0f766e' : clamped >= 55 ? '#b8912e' : '#b91c1c'
  const label = clamped >= 80 ? 'Trusted' : clamped >= 55 ? 'Elevated' : 'High risk'

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e6ecf3" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-3xl font-semibold tabular-nums text-navy-900">{clamped}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  )
}
