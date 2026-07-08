import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineProps {
  data: number[]
  color: string
}

/** Tiny trend line for KPI tiles — no axes, no chrome. */
export function Sparkline({ data, color }: SparklineProps) {
  const series = data.map((v, i) => ({ i, v }))
  const id = 'sp' + color.replace('#', '')
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 3, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
