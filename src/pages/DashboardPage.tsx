import React, { useEffect, useState } from 'react'
import { fetchDashboardData, DashboardData, fetchCallsPerDay, CallsPerDay } from '../services/db'
import { DashboardCharts } from '../components/dashboard/DashboardCharts'
import { useAuth } from '../contexts/AuthContext'
import { 
  Users, 
  CheckSquare, 
  PhoneCall, 
  RefreshCw,
  Mail,
  Building2,
  Calendar,
  AlertCircle,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react'

interface DashboardPageProps {
  onNavigateToCustomers?: () => void;
  onNavigateToTasks?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToCustomers,
  onNavigateToTasks
}) => {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [callsPerDay, setCallsPerDay] = useState<CallsPerDay[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    setErrorMsg(null)
    try {
      const [result, calls] = await Promise.all([
        fetchDashboardData(),
        fetchCallsPerDay(14)
      ])
      setData(result)
      setCallsPerDay(calls)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load dashboard data. Please try again.')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    loadData(true)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No due date'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const userName = user?.user_metadata?.name || 'Partner';

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse select-none">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-56 bg-[#E8E1D8] rounded-xl"></div>
            <div className="h-4 w-72 bg-[#E8E1D8]/60 rounded-lg"></div>
          </div>
          <div className="h-10 w-28 bg-[#E8E1D8] rounded-xl"></div>
        </div>

        {/* KPI Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-5 space-y-3">
              <div className="h-4 w-24 bg-[#E8E1D8] rounded"></div>
              <div className="h-8 w-16 bg-[#E8E1D8] rounded-lg"></div>
            </div>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl"></div>
          <div className="h-64 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      {/* 1. Header with Greeting and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
        <div>
          <h1 className="text-2xl font-bold text-[#292522] tracking-tight font-display">
            Good day, {userName}
          </h1>
          <p className="text-xs text-[#817A72] mt-0.5">
            Here is your live real estate sales overview &amp; pipeline status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh Dashboard"
            className="flex items-center gap-2 px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F7F4EE] border border-[#E8E1D8] text-[#292522] rounded-xl text-xs font-semibold transition active:scale-95 shadow-xs disabled:opacity-50"
            title="Refresh Dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#B85C38] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Error Message Notice */}
      {errorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#F9ECEC] border border-[#B94A48]/30 text-[#8D2F2E] text-xs">
          <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Unable to load all CRM data: </span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* 3. KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* KPI 1: Customers */}
        <div 
          onClick={onNavigateToCustomers}
          className="bg-[#FFFDF9] border border-[#E8E1D8] hover:border-[#D8CEBF] rounded-2xl p-5 shadow-[0_1px_3px_rgba(41,37,34,0.03)] hover:shadow-[0_4px_16px_rgba(41,37,34,0.06)] transition-all duration-200 cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Total Customers</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF3EF] text-[#B85C38] flex items-center justify-center transition-transform group-hover:scale-105">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-[#B85C38] tracking-tight">
              {data?.stats.totalCustomers || 0}
            </div>
            <span className="flex items-center text-xs font-medium text-[#817A72] group-hover:text-[#B85C38] transition">
              View all <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* KPI 2: Pending Tasks */}
        <div 
          onClick={onNavigateToTasks}
          className="bg-[#FFFDF9] border border-[#E8E1D8] hover:border-[#D8CEBF] rounded-2xl p-5 shadow-[0_1px_3px_rgba(41,37,34,0.03)] hover:shadow-[0_4px_16px_rgba(41,37,34,0.06)] transition-all duration-200 cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Pending Tasks</span>
            <div className="w-8 h-8 rounded-xl bg-[#EBF1EC] text-[#64866A] flex items-center justify-center transition-transform group-hover:scale-105">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-[#292522] tracking-tight">
              {data?.stats.pendingTasksCount || 0}
            </div>
            <span className="flex items-center text-xs font-medium text-[#817A72] group-hover:text-[#B85C38] transition">
              Manage <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* KPI 3: Calls Today */}
        <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-5 shadow-[0_1px_3px_rgba(41,37,34,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Calls Today</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF3EF] text-[#B85C38] flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-[#292522] tracking-tight">
              {data?.stats.todayCallsCount || 0}
            </div>
            <span className="text-xs font-semibold text-[#64866A]">
              Live Tracked
            </span>
          </div>
        </div>
      </div>

      {/* 4. Visual Charts - Call Activity only */}
      <DashboardCharts callsPerDay={callsPerDay} />

      {/* 5. Split Bottom Section: Recent Customers & Pending Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Customers Panel */}
        <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-6 shadow-[0_1px_3px_rgba(41,37,34,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#FAF3EF] text-[#B85C38] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[#292522]">Recent Customers</h2>
            </div>
            {onNavigateToCustomers && (
              <button 
                onClick={onNavigateToCustomers}
                className="text-xs font-semibold text-[#B85C38] hover:text-[#A14F2E] flex items-center gap-1 transition"
              >
                <span>View all</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!data?.recentCustomers || data.recentCustomers.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-[#E8E1D8] rounded-xl bg-[#F7F4EE]/50">
              <p className="text-xs text-[#817A72]">No customers registered yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8E1D8]">
              {data.recentCustomers.slice(0, 5).map((cust) => (
                <div key={cust.id} className="py-3 flex items-center justify-between gap-4 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#F0D8CA] text-[#B85C38] font-bold text-xs flex items-center justify-center shrink-0">
                      {cust.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#292522] truncate group-hover:text-[#B85C38] transition">
                        {cust.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#817A72] mt-0.5 truncate">
                        {cust.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {cust.company}
                          </span>
                        )}
                        {cust.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {cust.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {cust.tags && cust.tags.length > 0 && (
                    <div className="shrink-0">
                      <span className="badge-neutral text-[10px] px-2 py-0.5 rounded-full">
                        {cust.tags[0]}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Tasks Panel */}
        <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-6 shadow-[0_1px_3px_rgba(41,37,34,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EBF1EC] text-[#64866A] flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[#292522]">Pending Action Items</h2>
            </div>
            {onNavigateToTasks && (
              <button 
                onClick={onNavigateToTasks}
                className="text-xs font-semibold text-[#B85C38] hover:text-[#A14F2E] flex items-center gap-1 transition"
              >
                <span>View all</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!data?.pendingTasks || data.pendingTasks.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-[#E8E1D8] rounded-xl bg-[#F7F4EE]/50">
              <p className="text-xs text-[#817A72]">All tasks completed. You're caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8E1D8]">
              {data.pendingTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-medium text-[#292522] leading-snug line-clamp-2">
                      {task.description}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-[#817A72]">
                      <Calendar className="w-3 h-3 text-[#C59A5F]" />
                      <span>{formatDate(task.due_date)}</span>
                    </div>
                  </div>
                  <span className="badge-gold text-[10px] px-2 py-0.5 rounded-full shrink-0 font-semibold uppercase tracking-wider">
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
