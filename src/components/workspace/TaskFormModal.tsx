import React, { useState, useEffect } from 'react'
import { Task, TaskPriority } from '../../types'
import { parseTaskContent, serializeTaskDescription } from '../../utils/taskHelper'
import { X, Calendar, AlertCircle, Clock, Flag, CheckCircle2 } from 'lucide-react'

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (description: string, dueDate?: string, status?: 'pending' | 'in_progress' | 'done') => Promise<void>;
  task?: Task | null; // If provided, we are in Edit Mode
  initialTitle?: string; // If creating a follow-up task
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  task,
  initialTitle
}) => {
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'done'>('pending')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Populate fields on open
  useEffect(() => {
    if (isOpen) {
      setValidationError(null)
      if (task) {
        const parsed = parseTaskContent(task)
        setTitle(parsed.title)
        setDetails(parsed.details !== parsed.title ? parsed.details : '')
        setPriority(parsed.priority || 'medium')
        setStatus(parsed.taskStatus || 'pending')

        if (task.due_date) {
          const d = new Date(task.due_date)
          setDueDate(d.toISOString().split('T')[0])
          const hours = String(d.getHours()).padStart(2, '0')
          const mins = String(d.getMinutes()).padStart(2, '0')
          if (hours !== '00' || mins !== '00') {
            setDueTime(`${hours}:${mins}`)
          } else {
            setDueTime('')
          }
        } else {
          setDueDate('')
          setDueTime('')
        }
      } else {
        setTitle(initialTitle || '')
        setDetails('')
        setPriority('medium')
        setStatus('pending')
        setDueDate('')
        setDueTime('')
      }
    }
  }, [task, isOpen, initialTitle])

  if (!isOpen) return null

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!title.trim()) {
      setValidationError('Please enter a title for the task.')
      return
    }

    setLoading(true)

    try {
      // Retain existing subtasks, key_context, and activity if editing
      const existingParsed = task ? parseTaskContent(task) : null
      
      let newActivity = existingParsed?.activity || []
      if (task) {
        newActivity = [
          ...newActivity,
          {
            id: `act-${Date.now()}`,
            type: 'edited',
            description: 'Task edited manually',
            timestamp: new Date().toISOString()
          }
        ]
      } else {
        newActivity = [
          {
            id: `act-${Date.now()}`,
            type: 'created',
            description: 'Task created manually',
            timestamp: new Date().toISOString()
          }
        ]
      }

      const finalDescription = serializeTaskDescription({
        title: title.trim(),
        details: (details.trim() || title.trim()),
        priority,
        taskStatus: status,
        subtasks: existingParsed?.subtasks || [],
        keyContext: existingParsed?.keyContext || {},
        recommendation: existingParsed?.recommendation,
        activity: newActivity
      })

      let finalDueDate: string | undefined = undefined
      if (dueDate) {
        if (dueTime) {
          finalDueDate = new Date(`${dueDate}T${dueTime}:00`).toISOString()
        } else {
          finalDueDate = new Date(`${dueDate}T12:00:00`).toISOString()
        }
      }

      await onSubmit(finalDescription, finalDueDate, status)
      onClose()
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save task details.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center select-none animate-fadeIn">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden animate-slideUp">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-850 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-400" />
            <span>{task ? 'Edit Task' : initialTitle ? 'Create Follow-up Task' : 'Add New Task'}</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-450 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleFormSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Error Message */}
          {validationError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Task Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Task Action / Title <span className="text-brand-400">*</span></span>
              <span className="text-[10px] text-slate-500 font-normal">Short concise action</span>
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Send Revised Quotation to Rahul"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2 bg-slate-950/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 focus:outline-none rounded-lg text-slate-100 text-sm transition"
            />
          </div>

          {/* Description & Details */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Detailed Notes / Context</span>
              <span className="text-[10px] text-slate-500 font-normal">Optional</span>
            </label>
            <div className="relative">
              <textarea
                rows={3}
                placeholder="Add any specific context, requirements, or next steps..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2 bg-slate-950/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 focus:outline-none rounded-lg text-slate-100 text-sm transition resize-none"
              />
            </div>
          </div>

          {/* Priority and Status Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Priority Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-slate-500" />
                <span>Priority</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={loading}
                className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 focus:border-brand-500 focus:outline-none rounded-lg text-slate-200 text-xs font-medium transition"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            {/* Status Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Status</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'pending' | 'in_progress' | 'done')}
                disabled={loading}
                className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 focus:border-brand-500 focus:outline-none rounded-lg text-slate-200 text-xs font-medium transition"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Completed</option>
              </select>
            </div>
          </div>

          {/* Due Date & Time Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Due Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Due Date</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 focus:border-brand-500 focus:outline-none rounded-lg text-slate-200 text-xs transition"
              />
            </div>

            {/* Due Time */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Due Time</span>
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 focus:border-brand-500 focus:outline-none rounded-lg text-slate-200 text-xs transition"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-850">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <span className="border-2 border-white border-t-transparent w-4 h-4 rounded-full animate-spin" />
              ) : (
                task ? 'Save Changes' : initialTitle ? 'Create Follow-up' : 'Add Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
