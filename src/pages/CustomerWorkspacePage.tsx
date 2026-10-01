import React, { useState } from 'react'
import { Customer, Task, AIPipelineResponse } from '../types'
import { useWorkspace } from '../hooks/useWorkspace'
import { OverviewTab } from '../components/workspace/OverviewTab'
import { CallsTab } from '../components/workspace/CallsTab'
import { TasksTab } from '../components/workspace/TasksTab'
import { TranscriptTab } from '../components/workspace/TranscriptTab'
import { TaskFormModal } from '../components/workspace/TaskFormModal'
import { DeleteTaskDialog } from '../components/workspace/DeleteTaskDialog'
import { exportCustomerCsv, exportCustomerPdf } from '../services/exportService'
import { ChevronRight, ArrowLeft, User, PhoneCall, CheckSquare, AlertCircle, Download, FileText, Loader2, Mic } from 'lucide-react'

interface CustomerWorkspacePageProps {
  customer: Customer;
  onBack: () => void;
}

export const CustomerWorkspacePage: React.FC<CustomerWorkspacePageProps> = ({
  customer,
  onBack
}) => {
  const {
    activeTab,
    setActiveTab,
    calls,
    recordings,
    tasks,
    summaries,
    loading,
    error,
    addTask,
    editTask,
    toggleTaskComplete,
    removeTask,
    editSummary
  } = useWorkspace(customer.id)

  // Modals Open & Selection States
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [isDeleteTaskOpen, setIsDeleteTaskOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [lastTranscriptResult, setLastTranscriptResult] = useState<AIPipelineResponse | null>(null)

  const [followUpTitle, setFollowUpTitle] = useState<string>('')

  const exportPayload = { customer, calls, summaries, tasks }

  const handleExportCsv = () => {
    setExportError(null)
    try {
      exportCustomerCsv(exportPayload)
    } catch (err: any) {
      setExportError(err?.message || 'CSV export failed.')
    }
  }

  const handleExportPdf = async () => {
    setExportError(null)
    setExportingPdf(true)
    try {
      await exportCustomerPdf(exportPayload)
    } catch (err: any) {
      setExportError(err?.message || 'PDF export failed.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleAddTaskClick = () => {
    setSelectedTask(null)
    setFollowUpTitle('')
    setIsTaskFormOpen(true)
  }

  const handleCreateFollowUpClick = (suggestedTitle: string) => {
    setSelectedTask(null)
    setFollowUpTitle(suggestedTitle)
    setIsTaskFormOpen(true)
  }

  const handleEditTaskClick = (task: Task) => {
    setSelectedTask(task)
    setFollowUpTitle('')
    setIsTaskFormOpen(true)
  }

  const handleDeleteTaskClick = (task: Task) => {
    setSelectedTask(task)
    setIsDeleteTaskOpen(true)
  }

  const handleTaskFormSubmit = async (description: string, dueDate?: string, status?: 'pending' | 'in_progress' | 'done') => {
    const dbStatus = status === 'done' ? 'done' : 'pending'
    if (selectedTask) {
      await editTask(selectedTask.id, description, dueDate, dbStatus)
    } else {
      await addTask(description, dueDate, dbStatus)
    }
  }

  const handleUpdateTaskDirect = async (taskId: string, description: string, dueDate?: string, status?: 'pending' | 'done') => {
    await editTask(taskId, description, dueDate, status)
  }

  const handleDeleteTaskConfirm = async () => {
    if (selectedTask) {
      await removeTask(selectedTask.id)
    }
  }

  // Render tab contents based on active selection
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            customer={customer}
            summaries={summaries}
            summariesLoading={loading}
            onUpdateSummary={editSummary}
          />
        )
      case 'calls':
        return <CallsTab calls={calls} recordings={recordings} loading={loading} customerId={customer.id} onTranscriptResult={setLastTranscriptResult} />
      case 'transcript':
        return <TranscriptTab calls={calls} lastResult={lastTranscriptResult} />
      case 'tasks':
        return (
          <TasksTab
            tasks={tasks}
            loading={loading}
            customer={customer}
            onAddTask={handleAddTaskClick}
            onEditTask={handleEditTaskClick}
            onDeleteTask={handleDeleteTaskClick}
            onToggleComplete={toggleTaskComplete}
            onUpdateTaskDirect={handleUpdateTaskDirect}
            onCreateFollowUp={handleCreateFollowUpClick}
            onViewCall={() => setActiveTab('calls')}
            onViewTranscript={() => setActiveTab('transcript')}
          />
        )
      default:
        return null
    }
  }

  const tabItems = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'calls', label: 'Calls', icon: PhoneCall },
    { id: 'transcript', label: 'Transcript', icon: Mic },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  ] as const;

  return (
    <div className="space-y-6 flex flex-col h-full animate-fadeIn font-sans select-none">
      
      {/* 1. Header: Back button + Breadcrumbs */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Customers List"
          className="p-2 bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#F0D8CA]/40 text-[#817A72] hover:text-[#292522] rounded-xl transition duration-150 active:scale-95 shadow-xs"
          title="Back to Customers List"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-sm font-semibold">
          <button type="button" onClick={onBack} className="text-[#817A72] hover:text-[#292522] transition">
            Customers
          </button>
          <ChevronRight className="w-4 h-4 text-[#817A72]/60 shrink-0" />
          <span className="text-[#292522] font-bold font-display">{customer.name}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#F0D8CA]/40 text-[#817A72] hover:text-[#292522] rounded-xl text-xs font-semibold transition shadow-xs"
            title="Export customer history as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#F0D8CA]/40 text-[#817A72] hover:text-[#292522] rounded-xl text-xs font-semibold transition disabled:opacity-50 shadow-xs"
            title="Export customer history as PDF"
          >
            {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B85C38]" /> : <FileText className="w-3.5 h-3.5" />}
            <span>PDF</span>
          </button>
        </div>
      </div>

      {exportError && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs shrink-0">
          <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
          <span>{exportError}</span>
        </div>
      )}

      {/* 2. Error Display Panel */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs shrink-0">
          <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Workspace Tab Selection Header */}
      <div className="flex border-b border-[#E8E1D8] shrink-0 gap-2">
        {tabItems.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition border-b-2 flex items-center gap-2 ${
                isActive
                  ? 'border-[#B85C38] text-[#B85C38]'
                  : 'border-transparent text-[#817A72] hover:text-[#292522] hover:border-[#E8E1D8]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* 4. Tab Layout Container */}
      <div className="flex-1 overflow-y-auto min-h-0 pt-2">
        {renderTabContent()}
      </div>

      {/* Task Form Modal */}
      <TaskFormModal
        isOpen={isTaskFormOpen}
        onClose={() => {
          setIsTaskFormOpen(false)
          setFollowUpTitle('')
        }}
        onSubmit={handleTaskFormSubmit}
        task={selectedTask}
        initialTitle={followUpTitle}
      />

      {/* Delete Task Confirmation Dialog */}
      <DeleteTaskDialog
        isOpen={isDeleteTaskOpen}
        onClose={() => setIsDeleteTaskOpen(false)}
        onConfirm={handleDeleteTaskConfirm}
        task={selectedTask}
      />

    </div>
  )
}

