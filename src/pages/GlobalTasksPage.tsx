import React, { useState, useEffect, useCallback } from 'react'
import { Task, TaskPriority, Subtask, TaskActivityItem } from '../types'
import { getGlobalTasks, updateTask, deleteTask, createTask } from '../services/workspaceService'
import { TaskFormModal } from '../components/workspace/TaskFormModal'
import { DeleteTaskDialog } from '../components/workspace/DeleteTaskDialog'
import { parseTaskContent, serializeTaskDescription } from '../utils/taskHelper'
import { 
  CheckSquare, 
  Calendar, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Building2,
  ChevronDown, 
  Clock, 
  Sparkles, 
  Copy, 
  Check,
  Flag,
  ListTodo,
  FileText,
  Phone,
  Mail,
  MessageSquare,
  ArrowRightCircle,
  History,
  Info
} from 'lucide-react'
import { useRealtimeSync } from '../contexts/RealtimeSyncContext'
import { supabase } from '../supabase/client'

// Helper for task sorting
const taskSortFn = (a: Task, b: Task) => {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
};

type GlobalTask = Task & { customer?: { name: string; phone?: string; email?: string; company?: string } };

export const GlobalTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<GlobalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { subscribe } = useRealtimeSync()

  // Expand & Copy & Subtask inputs
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const [newSubtaskInputs, setNewSubtaskInputs] = useState<Record<string, string>>({})

  // Edit / Delete / Follow-up states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<GlobalTask | null>(null)
  const [followUpTitle, setFollowUpTitle] = useState<string>('')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getGlobalTasks()
      setTasks(data as GlobalTask[])
    } catch (err: any) {
      setError(err?.message || 'Unable to retrieve tasks pipeline.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Realtime subscription listener
  useEffect(() => {
    const unsubscribe = subscribe(async (event) => {
      if (event.table !== 'tasks') return;

      if (event.eventType === 'DELETE') {
        setTasks((prev) => prev.filter((t) => t.id !== event.oldRecord.id));
      } else if (event.eventType === 'UPDATE') {
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === event.newRecord.id);
          if (exists) {
            return prev.map((t) => {
              if (t.id === event.newRecord.id) {
                return { ...t, ...event.newRecord };
              }
              return t;
            }).sort(taskSortFn);
          }
          return prev;
        });
      } else if (event.eventType === 'INSERT') {
        try {
          const { data, error: fetchErr } = await supabase
            .from('tasks')
            .select('*, customer:customers(name, phone, email, company)')
            .eq('id', event.newRecord.id)
            .single();

          if (!fetchErr && data) {
            setTasks((prev) => {
              const exists = prev.some((t) => t.id === data.id);
              if (exists) return prev;
              return [...prev, data as GlobalTask].sort(taskSortFn);
            });
          }
        } catch (e) {
          console.error('Error fetching realtime task customer:', e);
        }
      }
    });

    return () => {
      unsubscribe()
    };
  }, [subscribe])

  const handleToggleComplete = async (task: GlobalTask) => {
    const nextStatus = task.status === 'pending' ? 'done' : 'pending';
    const originalTasks = [...tasks];
    
    // Optimistic UI update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));

    try {
      await updateTask(task.id, { status: nextStatus })
    } catch (err: any) {
      // Revert on failure
      setTasks(originalTasks)
      setError(err?.message || 'Failed to update task state.')
    }
  }

  const handleEditClick = (task: GlobalTask) => {
    setSelectedTask(task)
    setFollowUpTitle('')
    setIsFormOpen(true)
  }

  const handleCreateFollowUp = (task: GlobalTask) => {
    const parsed = parseTaskContent(task)
    setSelectedTask(null)
    setFollowUpTitle(`Follow up on: ${parsed.title}`)
    setIsFormOpen(true)
  }

  const handleDeleteClick = (task: GlobalTask) => {
    setSelectedTask(task)
    setIsDeleteOpen(true)
  }

  const handleFormSubmit = async (description: string, dueDate?: string, status?: 'pending' | 'in_progress' | 'done') => {
    const dbStatus = status === 'done' ? 'done' : 'pending'
    try {
      if (selectedTask) {
        const updated = await updateTask(selectedTask.id, { description, due_date: dueDate || undefined, status: dbStatus })
        setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...updated } : t))
      } else if (followUpTitle) {
        // Create follow-up under first available customer or user
        const targetCustomerId = tasks[0]?.customer_id
        if (targetCustomerId) {
          const created = await createTask({
            customer_id: targetCustomerId,
            description,
            due_date: dueDate || undefined,
            status: dbStatus
          })
          setTasks(prev => [...prev, created as GlobalTask].sort(taskSortFn))
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update task details.')
      throw err;
    }
  }

  const handleDeleteConfirm = async () => {
    if (!selectedTask) return
    try {
      await deleteTask(selectedTask.id)
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id))
    } catch (err: any) {
      setError(err?.message || 'Failed to delete task.')
      throw err;
    }
  }

  const toggleExpand = (taskId: string) => {
    setExpandedTaskId(prev => (prev === taskId ? null : taskId))
  }

  const handleCopyDescription = (e: React.MouseEvent, text: string, taskId: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedTaskId(taskId)
    setTimeout(() => setCopiedTaskId(null), 2000)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDetailedDate = (dateStr?: string) => {
    if (!dateStr) return 'No due date scheduled'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getRelativeDueText = (dateStr?: string) => {
    if (!dateStr) return null
    const due = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`
    if (diffDays === 0) return 'Due today'
    if (diffDays === 1) return 'Due tomorrow'
    return `Due in ${diffDays} days`
  }

  const isOverdue = (task: GlobalTask) => {
    if (task.status === 'done' || !task.due_date) return false
    const due = new Date(task.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return due < today
  }

  // Subtask Toggle Handler
  const handleToggleSubtask = async (task: GlobalTask, subtaskId: string) => {
    const parsed = parseTaskContent(task)
    const updatedSubtasks = parsed.subtasks.map(st => {
      if (st.id === subtaskId) {
        return { ...st, completed: !st.completed }
      }
      return st
    })

    const targetSubtask = parsed.subtasks.find(st => st.id === subtaskId)
    const nowIso = new Date().toISOString()
    const updatedActivity: TaskActivityItem[] = [
      ...parsed.activity,
      {
        id: `act-${Date.now()}`,
        type: 'subtask_completed',
        description: targetSubtask && !targetSubtask.completed 
          ? `Completed action: "${targetSubtask.title}"`
          : `Re-opened action: "${targetSubtask?.title || ''}"`,
        timestamp: nowIso
      }
    ]

    const newDescription = serializeTaskDescription({
      title: parsed.title,
      details: parsed.details,
      priority: parsed.priority,
      taskStatus: parsed.taskStatus,
      subtasks: updatedSubtasks,
      keyContext: parsed.keyContext,
      recommendation: parsed.recommendation,
      activity: updatedActivity
    })

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description: newDescription } : t))
    await updateTask(task.id, { description: newDescription })
  }

  // Add Custom Subtask
  const handleAddSubtask = async (task: GlobalTask) => {
    const text = (newSubtaskInputs[task.id] || '').trim()
    if (!text) return

    const parsed = parseTaskContent(task)
    const newSubtask: Subtask = {
      id: `sub-${Date.now()}`,
      title: text,
      completed: false
    }

    const updatedSubtasks = [...parsed.subtasks, newSubtask]
    const updatedActivity: TaskActivityItem[] = [
      ...parsed.activity,
      {
        id: `act-${Date.now()}`,
        type: 'edited',
        description: `Added action: "${text}"`,
        timestamp: new Date().toISOString()
      }
    ]

    const newDescription = serializeTaskDescription({
      title: parsed.title,
      details: parsed.details,
      priority: parsed.priority,
      taskStatus: parsed.taskStatus,
      subtasks: updatedSubtasks,
      keyContext: parsed.keyContext,
      recommendation: parsed.recommendation,
      activity: updatedActivity
    })

    setNewSubtaskInputs(prev => ({ ...prev, [task.id]: '' }))
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description: newDescription } : t))
    await updateTask(task.id, { description: newDescription })
  }

  // Delete Subtask
  const handleDeleteSubtask = async (task: GlobalTask, subtaskId: string) => {
    const parsed = parseTaskContent(task)
    const updatedSubtasks = parsed.subtasks.filter(st => st.id !== subtaskId)

    const newDescription = serializeTaskDescription({
      title: parsed.title,
      details: parsed.details,
      priority: parsed.priority,
      taskStatus: parsed.taskStatus,
      subtasks: updatedSubtasks,
      keyContext: parsed.keyContext,
      recommendation: parsed.recommendation,
      activity: parsed.activity
    })

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description: newDescription } : t))
    await updateTask(task.id, { description: newDescription })
  }

  // Direct Priority Switcher
  const handleChangePriority = async (task: GlobalTask, newPriority: TaskPriority) => {
    const parsed = parseTaskContent(task)
    const updatedActivity: TaskActivityItem[] = [
      ...parsed.activity,
      {
        id: `act-${Date.now()}`,
        type: 'edited',
        description: `Priority changed to ${newPriority.toUpperCase()}`,
        timestamp: new Date().toISOString()
      }
    ]

    const newDescription = serializeTaskDescription({
      title: parsed.title,
      details: parsed.details,
      priority: newPriority,
      taskStatus: parsed.taskStatus,
      subtasks: parsed.subtasks,
      keyContext: parsed.keyContext,
      recommendation: parsed.recommendation,
      activity: updatedActivity
    })

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description: newDescription } : t))
    await updateTask(task.id, { description: newDescription })
  }

  // Direct Status Switcher
  const handleChangeStatus = async (task: GlobalTask, newStatus: 'pending' | 'in_progress' | 'done') => {
    const parsed = parseTaskContent(task)
    const updatedActivity: TaskActivityItem[] = [
      ...parsed.activity,
      {
        id: `act-${Date.now()}`,
        type: 'status_changed',
        description: `Status changed to ${newStatus.replace('_', ' ').toUpperCase()}`,
        timestamp: new Date().toISOString()
      }
    ]

    const newDbStatus: 'pending' | 'done' = newStatus === 'done' ? 'done' : 'pending'

    const newDescription = serializeTaskDescription({
      title: parsed.title,
      details: parsed.details,
      priority: parsed.priority,
      taskStatus: newStatus,
      subtasks: parsed.subtasks,
      keyContext: parsed.keyContext,
      recommendation: parsed.recommendation,
      activity: updatedActivity
    })

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description: newDescription, status: newDbStatus } : t))
    await updateTask(task.id, { description: newDescription, status: newDbStatus })
  }

  const renderPriorityPill = (priority: TaskPriority) => {
    switch (priority) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#B94A48] bg-[#B94A48]/10 border border-[#B94A48]/20 px-2 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B94A48] animate-pulse" />
            <span>High</span>
          </span>
        )
      case 'low':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#64866A] bg-[#64866A]/10 border border-[#64866A]/20 px-2 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#64866A]" />
            <span>Low</span>
          </span>
        )
      case 'medium':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#C28A3D] bg-[#C28A3D]/10 border border-[#C28A3D]/20 px-2 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C28A3D]" />
            <span>Medium</span>
          </span>
        )
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse select-none font-sans">
        <div className="h-10 w-48 bg-[#E8E1D8] rounded-xl mb-4"></div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl"></div>
        ))}
      </div>
    )
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => t.status === 'done')

  return (
    <div className="space-y-6 flex flex-col h-full animate-fadeIn font-sans select-none">
      
      {/* 1. Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#292522] font-display">Tasks Pipeline</h1>
          <p className="text-sm text-[#817A72] mt-1">Review and manage actionable commitments across all client accounts</p>
        </div>
      </div>

      {/* 2. Error Message */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs shrink-0 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Task Sections List */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pr-1">
        
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#E8E1D8] rounded-2xl bg-[#FFFDF9]">
            <div className="p-4 bg-[#F0D8CA]/60 text-[#B85C38] border border-[#B85C38]/20 rounded-2xl mb-4 shadow-xs">
              <CheckSquare className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-[#292522] font-display">No tasks created yet</h4>
            <p className="text-xs text-[#817A72] mt-1.5 max-w-sm text-center leading-relaxed">
              Create customer tasks by opening any client folder in the Customers directory and clicking the Tasks tab.
            </p>
          </div>
        ) : (
          <>
            {/* Section A: Active Tasks */}
            {pendingTasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#817A72] uppercase tracking-wider pl-1 font-display">
                  Active Tasks ({pendingTasks.length})
                </h3>
                <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl divide-y divide-[#E8E1D8] overflow-hidden shadow-xs">
                  {pendingTasks.map(task => {
                    const overdue = isOverdue(task)
                    const isExpanded = expandedTaskId === task.id
                    const relativeDue = getRelativeDueText(task.due_date)
                    const content = parseTaskContent(task)
                    const completedSubtasksCount = content.subtasks.filter(st => st.completed).length

                    return (
                      <div 
                        key={task.id} 
                        className={`transition-colors duration-150 ${
                          isExpanded ? 'bg-[#F7F4EE]/40' : 'hover:bg-[#F7F4EE]/60'
                        }`}
                      >
                        {/* Main Row */}
                        <div
                          onClick={() => toggleExpand(task.id)}
                          className="flex items-start justify-between p-4 cursor-pointer group gap-4"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleExpand(task.id)
                            }
                          }}
                          title="Click to view full task details"
                        >
                          <div className="flex items-start gap-3.5 min-w-0 flex-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleComplete(task)
                              }}
                              className="mt-0.5 text-[#817A72] hover:text-[#B85C38] transition shrink-0"
                              title="Mark Completed"
                            >
                              <Circle className="w-4.5 h-4.5 hover:scale-105 transition-transform" />
                            </button>
                            <div className="min-w-0 space-y-1.5 flex-1">
                              <p className={`text-sm leading-snug break-words transition-all font-medium ${
                                isExpanded ? 'text-[#B85C38] font-semibold' : 'text-[#292522] group-hover:text-[#B85C38]'
                              }`}>
                                {content.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2.5">
                                {/* Customer tag */}
                                {task.customer?.name && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#817A72] uppercase tracking-wider">
                                    <Building2 className="w-3.5 h-3.5 text-[#817A72]" />
                                    <span>{task.customer.name}</span>
                                  </span>
                                )}

                                {/* Priority Badge */}
                                {renderPriorityPill(content.priority)}

                                {/* Status badge if In Progress */}
                                {content.taskStatus === 'in_progress' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#C28A3D] bg-[#C28A3D]/10 border border-[#C28A3D]/20 px-1.5 py-0.5 rounded">
                                    <span>In Progress</span>
                                  </span>
                                )}

                                {/* Due Date */}
                                {task.due_date && (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide ${
                                    overdue ? 'text-[#B94A48] font-bold' : 'text-[#817A72]'
                                  }`}>
                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                    <span>Due: {formatDate(task.due_date)}</span>
                                    {overdue && (
                                      <span className="bg-[#B94A48]/15 border border-[#B94A48]/25 text-[#B94A48] text-[8px] font-extrabold px-1.5 py-0.5 rounded ml-1">
                                        Overdue
                                      </span>
                                    )}
                                  </span>
                                )}

                                {/* Subtasks summary pill */}
                                {content.subtasks.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#817A72] bg-[#F7F4EE] border border-[#E8E1D8] px-1.5 py-0.5 rounded">
                                    <ListTodo className="w-2.5 h-2.5 shrink-0 text-[#817A72]" />
                                    <span>{completedSubtasksCount}/{content.subtasks.length} actions</span>
                                  </span>
                                )}

                                {/* AI Call Task badge */}
                                {task.call_id && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#B85C38]/80 bg-[#F0D8CA]/60 border border-[#B85C38]/20 px-1.5 py-0.5 rounded">
                                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                    <span>AI Call Task</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Right actions + Expand Chevron */}
                          <div className="flex items-center gap-1 shrink-0 pt-0.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditClick(task)
                              }}
                              className="p-1.5 text-[#817A72] hover:text-[#B85C38] hover:bg-[#F7F4EE] rounded-lg transition opacity-0 group-hover:opacity-100"
                              title="Edit Task"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteClick(task)
                              }}
                              className="p-1.5 text-[#817A72] hover:text-[#B94A48] hover:bg-[#B94A48]/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                              title="Delete Task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div 
                              className={`p-1 text-[#817A72] group-hover:text-[#292522] rounded transition-transform duration-200 ${
                                isExpanded ? 'rotate-180 text-[#B85C38]' : ''
                              }`}
                              title={isExpanded ? 'Collapse' : 'Expand Details'}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </div>

                        {/* Expanded Detailed Description Panel */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-2 border-t border-[#E8E1D8] bg-[#F7F4EE]/40 space-y-4 animate-fadeIn">
                            
                            {/* Priority & Status Controls Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#FFFDF9] border border-[#E8E1D8] rounded-lg">
                              {/* Priority Switcher */}
                              <div className="flex items-center gap-1.5 text-xs">
                                <Flag className="w-3.5 h-3.5 text-[#817A72] shrink-0" />
                                <span className="text-[11px] text-[#817A72] font-bold uppercase tracking-wider mr-1">Priority:</span>
                                <div className="flex items-center gap-1">
                                  {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
                                    <button
                                      key={p}
                                      onClick={() => handleChangePriority(task, p)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition border ${
                                        content.priority === p
                                          ? p === 'high' 
                                            ? 'bg-[#B94A48]/15 text-[#B94A48] border-[#B94A48]/35 shadow-xs'
                                            : p === 'medium'
                                              ? 'bg-[#C28A3D]/15 text-[#C28A3D] border-[#C28A3D]/35 shadow-xs'
                                              : 'bg-[#64866A]/15 text-[#64866A] border-[#64866A]/40 shadow-sm'
                                          : 'bg-[#F7F4EE] text-[#817A72] border-[#E8E1D8] hover:text-[#292522] hover:bg-[#FFFDF9]'
                                      }`}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Status Switcher */}
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-[11px] text-[#817A72] font-bold uppercase tracking-wider mr-1">Status:</span>
                                <div className="flex items-center gap-1">
                                  {(['pending', 'in_progress', 'done'] as const).map((st) => (
                                    <button
                                      key={st}
                                      onClick={() => handleChangeStatus(task, st)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition border ${
                                        content.taskStatus === st
                                          ? st === 'done'
                                            ? 'bg-[#64866A]/15 text-[#64866A] border-[#64866A]/35'
                                            : st === 'in_progress'
                                              ? 'bg-[#F0D8CA] text-[#B85C38] border-[#B85C38]/40'
                                              : 'bg-[#FFFDF9] text-[#292522] border-[#E8E1D8]'
                                          : 'bg-[#F7F4EE] text-[#817A72] border-[#E8E1D8] hover:text-[#292522] hover:bg-[#FFFDF9]'
                                      }`}
                                    >
                                      {st === 'in_progress' ? 'In Progress' : st}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* 1. Full Description Card */}
                            <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-lg p-4 relative shadow-inner space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-[#817A72] uppercase tracking-wider flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-[#B85C38]" />
                                  <span>Detailed Description</span>
                                </span>

                                <button
                                  onClick={(e) => handleCopyDescription(e, content.details, task.id)}
                                  className="flex items-center gap-1.5 text-[11px] text-[#817A72] hover:text-[#292522] bg-[#F7F4EE] hover:bg-[#FFFDF9] px-2.5 py-1 rounded-md transition border border-[#E8E1D8]"
                                  title="Copy detailed task description"
                                >
                                  {copiedTaskId === task.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-[#64866A]" />
                                      <span className="text-[#64866A] font-semibold">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy Details</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              <p className="text-sm text-[#292522] font-normal leading-relaxed whitespace-pre-wrap select-text">
                                {content.details}
                              </p>
                            </div>

                            {/* 2. Key Context (Dynamic Extracted Information) */}
                            {Object.keys(content.keyContext).length > 0 && (
                              <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-lg p-3.5 space-y-2.5">
                                <div className="flex items-center gap-1.5">
                                  <Info className="w-3.5 h-3.5 text-[#B85C38]" />
                                  <span className="text-[10px] font-bold text-[#817A72] uppercase tracking-wider">
                                    Key Context & Specifications
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {Object.entries(content.keyContext).map(([key, val]) => (
                                    <div 
                                      key={key} 
                                      className="p-2.5 bg-[#F7F4EE] border border-[#E8E1D8] rounded-lg space-y-1"
                                    >
                                      <p className="text-[10px] font-bold text-[#817A72] uppercase tracking-wider truncate">
                                        {key}
                                      </p>
                                      <p className="text-xs font-medium text-[#292522] break-words">
                                        {val}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 3. Next Actions / Subtasks Checklist */}
                            <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-lg p-3.5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <ListTodo className="w-3.5 h-3.5 text-[#B85C38]" />
                                  <span className="text-[10px] font-bold text-[#817A72] uppercase tracking-wider">
                                    Next Actions & Checklist
                                  </span>
                                  {content.subtasks.length > 0 && (
                                    <span className="text-[10px] font-semibold text-[#817A72] ml-1">
                                      ({completedSubtasksCount} of {content.subtasks.length} done)
                                    </span>
                                  )}
                                </div>
                              </div>

                              {content.subtasks.length > 0 ? (
                                <div className="space-y-1.5">
                                  {content.subtasks.map((st) => (
                                    <div 
                                      key={st.id}
                                      className={`flex items-center justify-between p-2 rounded-lg border transition group/st ${
                                        st.completed 
                                          ? 'bg-[#F7F4EE] border-[#E8E1D8] text-[#817A72]' 
                                          : 'bg-[#FFFDF9] border-[#E8E1D8] text-[#292522] hover:border-[#E8E1D8]'
                                      }`}
                                    >
                                      <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={st.completed}
                                          onChange={() => handleToggleSubtask(task, st.id)}
                                          className="rounded border-[#E8E1D8] text-[#B85C38] focus:ring-0 focus:ring-offset-0 bg-[#FFFDF9] cursor-pointer"
                                        />
                                        <span className={`text-xs ${st.completed ? 'line-through text-[#817A72]' : 'text-[#292522]'}`}>
                                          {st.title}
                                        </span>
                                      </label>

                                      <button
                                        onClick={() => handleDeleteSubtask(task, st.id)}
                                        className="p-1 text-[#817A72] hover:text-[#B94A48] rounded transition opacity-0 group-hover/st:opacity-100"
                                        title="Remove subtask"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-[#817A72] italic">No specific subtasks defined.</p>
                              )}

                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  placeholder="Add an actionable next step..."
                                  value={newSubtaskInputs[task.id] || ''}
                                  onChange={(e) => setNewSubtaskInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddSubtask(task)
                                    }
                                  }}
                                  className="flex-1 px-3 py-1.5 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:outline-none rounded-lg text-[#292522] text-xs transition placeholder:text-[#817A72]"
                                />
                                <button
                                  onClick={() => handleAddSubtask(task)}
                                  disabled={!(newSubtaskInputs[task.id] || '').trim()}
                                  className="px-3 py-1.5 bg-[#FFFDF9] hover:bg-[#F0D8CA] text-[#292522] border border-[#E8E1D8] rounded-lg text-xs font-semibold transition disabled:opacity-40"
                                >
                                  Add Action
                                </button>
                              </div>
                            </div>

                            {/* 4. AI Recommendation */}
                            {content.recommendation && (
                              <div className="p-3 bg-[#F0D8CA]/30 border border-[#B85C38]/20 rounded-lg flex items-start gap-2.5 text-xs">
                                <Sparkles className="w-4 h-4 text-[#B85C38] shrink-0 mt-0.5" />
                                <div className="space-y-0.5 min-w-0">
                                  <p className="text-[10px] font-bold text-[#B85C38] uppercase tracking-wider">
                                    AI Recommendation
                                  </p>
                                  <p className="text-xs text-[#292522] leading-relaxed">
                                    {content.recommendation}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* 5. Detailed Metadata Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                              {/* Customer */}
                              <div className="flex items-center gap-2.5 p-2.5 bg-[#FFFDF9]/50 border border-[#E8E1D8] rounded-lg">
                                <Building2 className="w-4 h-4 text-[#B85C38] shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] text-[#817A72] font-bold uppercase tracking-wider">Account / Client</p>
                                  <p className="text-xs font-semibold text-[#292522] truncate">
                                    {task.customer?.name || 'Customer Account'}
                                  </p>
                                </div>
                              </div>

                              {/* Due Date */}
                              <div className="flex items-center gap-2.5 p-2.5 bg-[#FFFDF9]/50 border border-[#E8E1D8] rounded-lg">
                                <Calendar className={`w-4 h-4 shrink-0 ${overdue ? 'text-[#B94A48]' : 'text-[#B85C38]'}`} />
                                <div className="min-w-0">
                                  <p className="text-[10px] text-[#817A72] font-bold uppercase tracking-wider">Scheduled Deadline</p>
                                  <p className={`text-xs font-semibold ${overdue ? 'text-[#B94A48] font-bold' : 'text-[#292522]'}`}>
                                    {formatDetailedDate(task.due_date)}
                                    {relativeDue && (
                                      <span className="ml-1 text-[10px] text-[#817A72] font-normal">({relativeDue})</span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Created At */}
                              <div className="flex items-center gap-2.5 p-2.5 bg-[#FFFDF9]/50 border border-[#E8E1D8] rounded-lg">
                                <Clock className="w-4 h-4 text-[#817A72] shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] text-[#817A72] font-bold uppercase tracking-wider">Created</p>
                                  <p className="text-xs text-[#292522]">
                                    {formatDateTime(task.created_at) || 'Recently'}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* 6. Quick Contact Actions */}
                            {task.customer && (task.customer.phone || task.customer.email) && (
                              <div className="flex items-center justify-between p-2.5 bg-[#F7F4EE]/40 border border-[#E8E1D8] rounded-lg text-xs">
                                <span className="text-[11px] text-[#817A72]">Direct Outreach:</span>
                                <div className="flex items-center gap-1.5">
                                  {task.customer.phone && (
                                    <>
                                      <a
                                        href={`https://wa.me/${task.customer.phone.replace(/[^0-9]/g, '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 text-[10px] font-semibold text-[#64866A] bg-[#64866A]/10 hover:bg-[#64866A]/20 px-2 py-1 rounded border border-[#64866A]/20 transition"
                                      >
                                        <MessageSquare className="w-3 h-3" />
                                        <span>WhatsApp</span>
                                      </a>
                                      <a
                                        href={`tel:${task.customer.phone}`}
                                        className="flex items-center gap-1 text-[10px] font-semibold text-[#C28A3D] bg-[#C28A3D]/10 hover:bg-[#C28A3D]/20 px-2 py-1 rounded border border-[#C28A3D]/20 transition"
                                      >
                                        <Phone className="w-3 h-3" />
                                        <span>Call</span>
                                      </a>
                                    </>
                                  )}
                                  {task.customer.email && (
                                    <a
                                      href={`mailto:${task.customer.email}`}
                                      className="flex items-center gap-1 text-[10px] font-semibold text-[#292522] bg-[#FFFDF9] hover:bg-[#F7F4EE] px-2 py-1 rounded border border-[#E8E1D8] transition"
                                    >
                                      <Mail className="w-3 h-3" />
                                      <span>Email</span>
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 7. Activity History */}
                            {content.activity.length > 0 && (
                              <div className="bg-[#FFFDF9]/30 border border-[#E8E1D8] rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-[#817A72]">
                                  <History className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Activity History</span>
                                </div>
                                <div className="space-y-1.5 pl-2 border-l border-[#E8E1D8]">
                                  {content.activity.slice(-4).map((act) => (
                                    <div key={act.id} className="text-[11px] text-[#817A72] flex items-baseline justify-between gap-2">
                                      <span>{act.description}</span>
                                      <span className="text-[10px] text-[#817A72] shrink-0">
                                        {formatDateTime(act.timestamp)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 8. Bottom Action Buttons */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleToggleComplete(task)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#64866A]/10 border border-[#64866A]/25 text-[#64866A] hover:bg-[#64866A]/20 rounded-lg text-xs font-semibold transition"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Mark Completed</span>
                                </button>

                                <button
                                  onClick={() => handleCreateFollowUp(task)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F0D8CA]/60 hover:bg-[#F0D8CA] border border-[#B85C38]/30 text-[#B85C38] rounded-lg text-xs font-semibold transition"
                                >
                                  <ArrowRightCircle className="w-3.5 h-3.5" />
                                  <span>Create Follow-up</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditClick(task)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#FFFDF9] text-[#292522] hover:text-[#B85C38] rounded-lg text-xs font-medium transition"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(task)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#B94A48]/10 border border-[#B94A48]/20 hover:bg-[#B94A48]/20 text-[#B94A48] rounded-lg text-xs font-medium transition"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Section B: Completed Tasks */}
            {completedTasks.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-[#817A72] uppercase tracking-wider pl-1 font-display">
                  Completed Tasks ({completedTasks.length})
                </h3>
                <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl divide-y divide-[#E8E1D8] overflow-hidden shadow-xs">
                  {completedTasks.map(task => {
                    const isExpanded = expandedTaskId === task.id
                    const content = parseTaskContent(task)

                    return (
                      <div 
                        key={task.id} 
                        className={`transition-colors duration-150 bg-[#F7F4EE]/20 ${
                          isExpanded ? 'bg-[#F7F4EE]/40' : 'hover:bg-[#F7F4EE]/60'
                        }`}
                      >
                        <div
                          onClick={() => toggleExpand(task.id)}
                          className="flex items-start justify-between p-4 cursor-pointer group gap-4"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleExpand(task.id)
                            }
                          }}
                          title="Click to view details"
                        >
                          <div className="flex items-start gap-3.5 min-w-0 flex-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleComplete(task)
                              }}
                              className="mt-0.5 text-[#B85C38] shrink-0"
                              title="Mark Pending"
                            >
                              <CheckCircle2 className="w-4.5 h-4.5 text-[#64866A]" />
                            </button>
                            <div className="min-w-0 space-y-1.5 flex-1">
                              <p className="text-sm font-normal text-[#817A72] line-through leading-snug break-words">
                                {content.title}
                              </p>
                              <div className="flex items-center gap-3">
                                {task.customer?.name && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#817A72] uppercase tracking-wider">
                                    <Building2 className="w-3.5 h-3.5 text-[#817A72]" />
                                    <span>{task.customer.name}</span>
                                  </span>
                                )}
                                {renderPriorityPill(content.priority)}
                                {task.due_date && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#817A72] tracking-wide">
                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                    <span>Completed</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 pt-0.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteClick(task)
                              }}
                              className="p-1.5 text-[#817A72] hover:text-[#B94A48] hover:bg-[#B94A48]/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                              title="Delete Task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div 
                              className={`p-1 text-[#817A72] group-hover:text-[#817A72] rounded transition-transform duration-200 ${
                                isExpanded ? 'rotate-180 text-[#B85C38]' : ''
                              }`}
                              title={isExpanded ? 'Collapse' : 'Expand Details'}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </div>

                        {/* Completed Task Expanded Detail Panel */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-2 border-t border-[#E8E1D8] bg-[#F7F4EE] space-y-3.5 animate-fadeIn">
                            <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-lg p-4 relative shadow-inner">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-[#64866A] uppercase tracking-wider flex items-center gap-1.5">
                                  <span>Task Completed</span>
                                </span>
                                <button
                                  onClick={(e) => handleCopyDescription(e, content.details, task.id)}
                                  className="flex items-center gap-1 text-[10px] text-[#817A72] hover:text-[#292522] bg-[#F7F4EE] hover:bg-[#FFFDF9] px-2 py-1 rounded transition border border-[#E8E1D8]"
                                >
                                  {copiedTaskId === task.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-[#64866A]" />
                                      <span className="text-[#64866A] font-semibold">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy Details</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="text-sm text-[#292522] font-normal leading-relaxed whitespace-pre-wrap select-text">
                                {content.details}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleToggleComplete(task)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFDF9] border border-[#E8E1D8] text-[#292522] hover:bg-[#F7F4EE] rounded-lg text-xs font-semibold transition"
                                >
                                  <Circle className="w-3.5 h-3.5" />
                                  <span>Re-open Task</span>
                                </button>
                                <button
                                  onClick={() => handleCreateFollowUp(task)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F0D8CA]/60 hover:bg-[#F0D8CA] border border-[#B85C38]/30 text-[#B85C38] rounded-lg text-xs font-semibold transition"
                                >
                                  <ArrowRightCircle className="w-3.5 h-3.5" />
                                  <span>Create Follow-up</span>
                                </button>
                              </div>

                              <button
                                onClick={() => handleDeleteClick(task)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#B94A48]/10 border border-[#B94A48]/20 hover:bg-[#B94A48]/20 text-[#B94A48] rounded-lg text-xs font-medium transition"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* Edit / Follow-up Form Modal */}
      <TaskFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          setSelectedTask(null)
          setFollowUpTitle('')
        }}
        onSubmit={handleFormSubmit}
        task={selectedTask}
        initialTitle={followUpTitle}
      />

      {/* Delete Confirmation */}
      {selectedTask && (
        <DeleteTaskDialog
          isOpen={isDeleteOpen}
          onClose={() => {
            setIsDeleteOpen(false)
            setSelectedTask(null)
          }}
          onConfirm={handleDeleteConfirm}
          task={selectedTask}
        />
      )}

    </div>
  )
}
