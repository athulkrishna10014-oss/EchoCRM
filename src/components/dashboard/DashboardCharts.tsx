import React from 'react'
import { CallsPerDay } from '../../services/db'
import { Activity } from 'lucide-react'

interface DashboardChartsProps {
  callsPerDay: CallsPerDay[]
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ callsPerDay }) => {
  const maxCalls = Math.max(1, ...callsPerDay.map((c) => c.count))

  // Build an SVG polyline for calls-per-day
  const chartWidth = 520
  const chartHeight = 120
  const stepX = callsPerDay.length > 1 ? chartWidth / (callsPerDay.length - 1) : chartWidth
  const points = callsPerDay
    .map((c, i) => {
      const x = i * stepX
      const y = chartHeight - (c.count / maxCalls) * (chartHeight - 20) - 10
      return `${x},${y}`
    })
    .join(' ')

  return (
    <section className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-6 space-y-5 shadow-[0_1px_3px_rgba(41,37,34,0.03)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#F0D8CA] text-[#B85C38] flex items-center justify-center">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#292522]">Call Activity</h2>
            <p className="text-xs text-[#817A72]">Past {callsPerDay.length} days recording volume</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-[#817A72]">
          {callsPerDay.reduce((acc, c) => acc + c.count, 0)} Calls Logged
        </span>
      </div>

      {callsPerDay.every((c) => c.count === 0) ? (
        <div className="py-12 text-center border border-dashed border-[#E8E1D8] rounded-xl bg-[#F7F4EE]/50">
          <p className="text-xs text-[#817A72]">No calls recorded in this 14-day window.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto pt-2">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32" preserveAspectRatio="none">
              <defs>
                <linearGradient id="callsFillTerracotta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B85C38" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#B85C38" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <polygon
                points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
                fill="url(#callsFillTerracotta)"
              />
              <polyline points={points} fill="none" stroke="#B85C38" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {callsPerDay.map((c, i) => (
                <circle
                  key={c.date}
                  cx={i * stepX}
                  cy={chartHeight - (c.count / maxCalls) * (chartHeight - 20) - 10}
                  r="3"
                  fill="#FFFDF9"
                  stroke="#B85C38"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-[#817A72] font-medium pt-1 border-t border-[#E8E1D8]">
            <span>{callsPerDay[0]?.date.slice(5)}</span>
            <span>14-day activity</span>
            <span>{callsPerDay[callsPerDay.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}
    </section>
  )
}
