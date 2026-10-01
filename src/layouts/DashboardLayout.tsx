import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useRealtimeSync } from '../contexts/RealtimeSyncContext'
import { useTaskNotifications } from '../hooks/useTaskNotifications'
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  Settings as SettingsIcon, 
  LogOut, 
  Mic, 
  Search,
  Sparkles,
  ChevronRight,
  Menu,
  X
} from 'lucide-react'

export type TabType = 'dashboard' | 'customers' | 'tasks' | 'search' | 'recordings' | 'settings';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab 
}) => {
  const { user, signOut } = useAuth()
  const { status: syncStatus } = useRealtimeSync()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  useTaskNotifications()

  // Global keyboard shortcut: Cmd+K / Ctrl+K opens transcript search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setActiveTab('search')
      }
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTab, mobileMenuOpen])

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'recordings', label: 'Recordings', icon: Mic },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  const activeItem = navItems.find((item) => item.id === activeTab) || navItems[0];

  // Extract first letter of name or email for profile fallback avatar
  const displayName = user?.user_metadata?.name || 'User';
  const displayEmail = user?.email || '';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    const { error } = await signOut()
    if (error) {
      alert('Failed to log out: ' + error.message)
    }
  }

  return (
    <div className="h-screen w-screen flex bg-[#F7F4EE] text-[#292522] overflow-hidden font-sans">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-[#292522]/40 backdrop-blur-xs z-40 md:hidden animate-fadeIn"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. Left Sidebar (Fixed on Desktop, Slide-over on Mobile) */}
      <aside 
        className={`w-64 shrink-0 bg-[#FFFDF9] border-r border-[#E8E1D8] flex flex-col justify-between p-4 z-50 shadow-[1px_0_4px_rgba(41,37,34,0.02)] transition-transform duration-200 ease-in-out fixed inset-y-0 left-0 md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        
        {/* Top: Logo & Navigation */}
        <div className="space-y-6">
          {/* Logo Header */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#F0D8CA] text-[#B85C38] flex items-center justify-center font-bold text-base shadow-sm">
                <Sparkles className="w-4 h-4 fill-[#B85C38]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-[#292522] tracking-tight font-display">EchoCRM</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-[#FBF3E6] text-[#8C6831] px-1.5 py-0.5 rounded-full border border-[#C59A5F]/20">Pro</span>
                </div>
                <p className="text-[11px] text-[#817A72]">Voice &amp; AI Intelligence</p>
              </div>
            </div>
            {/* Mobile close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1 text-[#817A72] hover:text-[#292522] md:hidden rounded-lg hover:bg-[#F7F4EE] transition"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative ${
                    isActive 
                      ? 'bg-[#F0D8CA] text-[#B85C38] font-semibold shadow-xs' 
                      : 'text-[#817A72] hover:text-[#292522] hover:bg-[#F7F4EE]'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-105 ${
                    isActive ? 'text-[#B85C38]' : 'text-[#817A72] group-hover:text-[#292522]'
                  }`} />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Bottom: Sync, Profile & Logout */}
        <div className="space-y-3 pt-3 border-t border-[#E8E1D8]">
          {/* Realtime Status Badge */}
          <div className="flex items-center justify-between px-2 py-1 select-none text-xs">
            <span className="text-[#817A72] text-[11px] font-medium">Sync State</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                syncStatus === 'connected' 
                  ? 'bg-[#64866A]' 
                  : syncStatus === 'connecting'
                    ? 'bg-[#C28A3D] animate-pulse'
                    : 'bg-[#B94A48]'
              }`} />
              <span className={`text-[11px] font-medium ${
                syncStatus === 'connected' ? 'text-[#3D5C43]' : 'text-[#817A72]'
              }`}>
                {syncStatus === 'connected' 
                  ? 'Active' 
                  : syncStatus === 'connecting'
                    ? 'Connecting'
                    : 'Offline'}
              </span>
            </div>
          </div>

          {/* User Profile Card */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#F7F4EE] border border-[#E8E1D8]">
            <div className="w-8 h-8 rounded-full bg-[#B85C38] text-white flex items-center justify-center font-bold text-xs select-none shadow-xs shrink-0">
              {avatarLetter}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="text-xs font-semibold text-[#292522] truncate leading-tight">
                {displayName}
              </div>
              <div className="text-[10px] text-[#817A72] truncate mt-0.5 leading-none">
                {displayEmail}
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#817A72] hover:text-[#B94A48] hover:bg-[#F9ECEC] transition-all duration-150"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Shell (Top Header + Content Area) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 shrink-0 bg-[#FFFDF9] border-b border-[#E8E1D8] px-4 md:px-8 flex items-center justify-between z-10 shadow-[0_1px_2px_rgba(41,37,34,0.02)]">
          {/* Left: Mobile Menu Toggle + Breadcrumbs */}
          <div className="flex items-center gap-3 select-none">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-[#817A72] hover:text-[#292522] hover:bg-[#F7F4EE] md:hidden transition"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-[#817A72]">EchoCRM</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#CFC8BE]" />
              <span className="text-[#292522] font-semibold font-display">{activeItem.label}</span>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-3">
            {activeTab !== 'search' && (
              <button
                onClick={() => setActiveTab('search')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F7F4EE] hover:bg-[#EFEAE0] text-[#817A72] hover:text-[#292522] text-xs font-medium border border-[#E8E1D8] transition shadow-xs"
                title="Search call transcripts (⌘K or Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Search transcripts</span>
                <kbd className="text-[10px] bg-[#FFFDF9] px-1.5 py-0.5 rounded border border-[#E8E1D8] text-[#817A72]">⌘K</kbd>
              </button>
            )}

            <div className="w-px h-5 bg-[#E8E1D8]" />

            {/* Quick Profile Initials Icon */}
            <div 
              className="w-7 h-7 rounded-full bg-[#F0D8CA] text-[#B85C38] flex items-center justify-center font-bold text-xs select-none shadow-xs"
              title={`${displayName} (${displayEmail})`}
            >
              {avatarLetter}
            </div>
          </div>
        </header>

        {/* 3. Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative min-w-0 bg-[#F7F4EE]">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
