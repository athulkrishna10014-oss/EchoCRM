import React, { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthPage } from './pages/AuthPage'
import { DashboardLayout, TabType } from './layouts/DashboardLayout'
import { RealtimeSyncProvider } from './contexts/RealtimeSyncContext'
import { DashboardPage } from './pages/DashboardPage'
import { CustomersPage } from './pages/CustomersPage'
import { GlobalTasksPage } from './pages/GlobalTasksPage'
import { RecordingsPage } from './pages/RecordingsPage'
import { TranscriptSearchPage } from './pages/TranscriptSearchPage'
import { SettingsPage } from './pages/SettingsPage'

const AppContent: React.FC = () => {
  const { session, loading } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F7F4EE] gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-[#B85C38]/15 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[#B85C38] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-xs font-semibold tracking-wider text-[#B85C38] uppercase animate-pulse font-display">
          Loading Echo CRM...
        </p>
      </div>
    )
  }

  if (!session) {
    return <AuthPage />
  }

  // Helper renderer for active page contents
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardPage 
            onNavigateToCustomers={() => setActiveTab('customers')}
            onNavigateToTasks={() => setActiveTab('tasks')}
          />
        )
      case 'customers':
        return <CustomersPage />
      case 'tasks':
        return <GlobalTasksPage />
      case 'search':
        return <TranscriptSearchPage />
      case 'recordings':
        return <RecordingsPage />
      case 'settings':
        return <SettingsPage />
      default:
        return null
    }
  }

  return (
    <RealtimeSyncProvider>
      <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
        <div className="flex-1 min-h-0 h-full animate-fadeIn transition-opacity duration-200">
          {renderContent()}
        </div>
      </DashboardLayout>
    </RealtimeSyncProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
