import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import { MeetingRecording, Customer } from '../types'
import { fetchMeetingRecordings, assignRecordingToCustomer, getRecordingPublicUrl } from '../services/db'
import { processRecording } from '../services/aiPipelineService'
import { useRealtimeSync } from '../contexts/RealtimeSyncContext'
import { Mic, Link as LinkIcon, Calendar, Clock, RefreshCw, Play, Loader2, AlertCircle, CheckCircle2, RotateCw, UserX } from 'lucide-react'

const getProcessingBadge = (status: string) => {
  const mappings: Record<string, { label: string; classes: string }> = {
    processing:          { label: 'Processing',        classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    transcribing:        { label: 'Transcribing',      classes: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
    analyzing:           { label: 'Analyzing',         classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    customer_resolving:  { label: 'Resolving Customer',classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    needs_customer:      { label: 'Needs Customer',    classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    processed:           { label: 'Processed',         classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    failed:              { label: 'Failed',             classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    uploaded:            { label: 'Queued',             classes: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  }
  return mappings[status] || null
}

const IN_PROGRESS_STATUSES = new Set(['uploading', 'processing', 'transcribing', 'analyzing', 'customer_resolving'])

export const RecordingsPage: React.FC = () => {
  const [recordings, setRecordings] = useState<MeetingRecording[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processError, setProcessError] = useState<{ id: string; message: string } | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const recs = await fetchMeetingRecordings()
      setRecordings(recs || [])

      const { data: custs } = await supabase.from('customers').select('*').order('name')
      setCustomers(custs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const { subscribe } = useRealtimeSync()

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.table === 'meeting_recordings') {
        if (event.eventType === 'INSERT') {
          setRecordings(prev => [event.newRecord, ...prev].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()))
        } else if (event.eventType === 'UPDATE') {
          setRecordings(prev => prev.map(r => r.id === event.newRecord.id ? { ...r, ...event.newRecord } : r).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()))
        } else if (event.eventType === 'DELETE') {
          setRecordings(prev => prev.filter(r => r.id !== event.oldRecord.id))
        }
      }
    })
    return () => unsubscribe()
  }, [subscribe])

  const handleAssign = async (recordingId: string, customerId: string) => {
    setAssigningId(recordingId)
    try {
      const updated = await assignRecordingToCustomer(recordingId, customerId || null)
      setRecordings(prev => prev.map(r => r.id === recordingId ? { ...r, ...updated } : r))
    } catch (e) {
      console.error('Failed to assign:', e)
    } finally {
      setAssigningId(null)
    }
  }

  const handleProcess = async (rec: MeetingRecording) => {
    setProcessError(null)
    setProcessingId(rec.id)
    setRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, status: 'processing', last_error: null } : r))
    try {
      await processRecording(rec)
      setRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, status: 'processed', last_error: null } : r))
    } catch (e: any) {
      const message = e?.message || 'Processing failed'
      setProcessError({ id: rec.id, message })
      setRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, status: r.status === 'needs_customer' ? 'needs_customer' : 'failed', last_error: message } : r))
    } finally {
      setProcessingId(null)
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  if (loading) {
    return <div className="text-slate-400 p-8">Loading recordings...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Recordings</h1>
          <p className="text-sm text-slate-400 mt-1">Manage and assign synced meeting recordings</p>
        </div>
        <button onClick={loadData} className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {recordings.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500">
            No recordings found.
          </div>
        ) : (
          recordings.map(rec => (
            <div key={rec.id} className="glass-card p-5 rounded-xl border border-slate-800/60 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center hover:border-slate-700/60 transition">

              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-500/10 text-brand-400 rounded-lg">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-200">
                      {rec.platform === 'google_meet' ? 'Google Meet' : rec.platform === 'ms_teams' ? 'Microsoft Teams' : rec.platform === 'zoom' ? 'Zoom' : rec.platform === 'audio_upload' ? 'Audio Upload' : 'Meeting'}
                    </h3>
                    <p className="text-xs text-slate-400 truncate max-w-sm">{rec.meeting_url || 'No URL'}</p>
                  </div>
                </div>

                <div className="flex gap-4 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(rec.started_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDuration(rec.duration_seconds)}</span>
                  </div>
                </div>

                {/* Needs-customer resolution panel */}
                {rec.status === 'needs_customer' && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold">
                      <UserX className="w-4 h-4" />
                      <span>Customer Assignment Required</span>
                    </div>
                    {rec.ai_customer_name && (
                      <p className="text-xs text-slate-400">
                        Transcript mentions: <span className="text-slate-200 font-medium">"{rec.ai_customer_name}"</span>
                        {rec.candidate_customer_ids && rec.candidate_customer_ids.length > 1 && (
                          <span className="ml-1 text-rose-300">({rec.candidate_customer_ids.length} customers match — ambiguous)</span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">Select a customer below and click Process to complete.</p>
                  </div>
                )}

                <div className="w-full max-w-md pt-2">
                  <audio controls className="w-full h-8" src={getRecordingPublicUrl(rec.storage_path)} />
                </div>
              </div>

              <div className="w-full sm:w-64 shrink-0 flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" /> Assign to Customer
                </label>
                <select
                  value={rec.customer_id || ''}
                  onChange={(e) => handleAssign(rec.id, e.target.value)}
                  disabled={assigningId === rec.id || IN_PROGRESS_STATUSES.has(rec.status)}
                  className="w-full bg-slate-900 border border-slate-800 text-sm text-slate-200 rounded-lg p-2.5 focus:border-brand-500 outline-none transition"
                >
                  <option value="">-- Unassigned --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {assigningId === rec.id && <span className="text-[10px] text-brand-400 animate-pulse">Assigning...</span>}

                <div className="flex items-center gap-2">
                  {(() => {
                    const badge = getProcessingBadge(rec.status)
                    return badge ? (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border rounded uppercase tracking-wider ${badge.classes}`}>
                        {IN_PROGRESS_STATUSES.has(rec.status) && <Loader2 className="w-3 h-3 animate-spin" />}
                        {rec.status === 'processed' && <CheckCircle2 className="w-3 h-3" />}
                        {(rec.status === 'failed' || rec.status === 'needs_customer') && <AlertCircle className="w-3 h-3" />}
                        {badge.label}
                      </span>
                    ) : null
                  })()}
                  <button
                    onClick={() => handleProcess(rec)}
                    disabled={
                      processingId === rec.id ||
                      IN_PROGRESS_STATUSES.has(rec.status) ||
                      // needs_customer requires a customer to be assigned first
                      (rec.status === 'needs_customer' && !rec.customer_id)
                    }
                    title={
                      rec.status === 'needs_customer' && !rec.customer_id
                        ? 'Assign a customer first'
                        : IN_PROGRESS_STATUSES.has(rec.status)
                        ? 'Processing in progress...'
                        : 'Run local AI pipeline'
                    }
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg transition shadow-md"
                  >
                    {processingId === rec.id || IN_PROGRESS_STATUSES.has(rec.status) ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : rec.status === 'failed' || rec.status === 'needs_customer' ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>{rec.status === 'needs_customer' ? 'Process Now' : 'Retry'}</span>
                      </>
                    ) : rec.status === 'processed' ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Reprocess</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Process</span>
                      </>
                    )}
                  </button>
                </div>

                {processError?.id === rec.id && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] leading-snug">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{processError.message}</span>
                  </div>
                )}
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  )
}
