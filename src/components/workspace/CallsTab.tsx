import React, { useRef, useState } from 'react'
import { Call, MeetingRecording, AIPipelineResponse } from '../../types'
import { PhoneCall, Calendar, Clock, Info, UploadCloud, Loader2, AlertCircle, Play, RotateCw, CheckCircle2 } from 'lucide-react'
import { processAndSaveCall, processRecording } from '../../services/aiPipelineService'
import { getRecordingPublicUrl } from '../../services/db'
import { AIPipelineTester } from './AIPipelineTester'

interface CallsTabProps {
  calls: Call[];
  recordings?: any[];
  loading: boolean;
  customerId: string;
  onTranscriptResult?: (result: AIPipelineResponse) => void;
}

export const CallsTab: React.FC<CallsTabProps> = ({ calls, recordings = [], loading, customerId, onTranscriptResult }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processingRecordingId, setProcessingRecordingId] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<{ id: string; message: string } | null>(null);

  const handleProcessRecording = async (rec: MeetingRecording) => {
    setRecordingError(null);
    setProcessingRecordingId(rec.id);
    try {
      await processRecording({ ...rec, customer_id: rec.customer_id || customerId });
    } catch (err: any) {
      setRecordingError({ id: rec.id, message: err?.message || 'Failed to process recording.' });
    } finally {
      setProcessingRecordingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // In Electron, File objects have a 'path' property containing the absolute local path
    const audioPath = (file as any).path;
    if (!audioPath) {
      setProcessError("Could not retrieve file path. Are you running in Electron desktop mode?");
      return;
    }

    setIsProcessing(true);
    setProcessError(null);
    try {
      await processAndSaveCall(audioPath, customerId);
      // Success! Realtime listener will automatically pick up the DB changes.
    } catch (err: any) {
      setProcessError(err?.message || "Failed to process audio call.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Format call duration helper (e.g. 300s -> "5:00")
  const formatDuration = (totalSeconds?: number) => {
    if (totalSeconds === undefined) return '--:--'
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Format date helper
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    const mappings: Record<string, { label: string; classes: string }> = {
      recording: { label: 'Recording', classes: 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' },
      processing: { label: 'Processing', classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
      done: { label: 'Completed', classes: 'bg-slate-800 text-slate-400 border-slate-700/50' }
    };
    return mappings[status] || { label: status, classes: 'bg-slate-850 text-slate-300' };
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-900/40 border border-slate-850 rounded-lg"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Upload and Process Real Audio */}
      <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-brand-400" />
              Upload Call Recording
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Select an audio file to process locally via AI. Transcripts, summaries, and action items will be automatically linked to this customer.
            </p>
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition duration-150 shadow-md disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Call...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Select Audio File</span>
                </>
              )}
            </button>
          </div>
        </div>
        {processError && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs shrink-0 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{processError}</span>
          </div>
        )}
      </div>

      {/* Local AI Pipeline Integration Tester */}
      <AIPipelineTester onResult={onTranscriptResult} />

      {calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-900/10 select-none">
          <div className="p-3.5 bg-slate-800/40 text-slate-500 border border-slate-750 rounded-xl mb-3">
            <PhoneCall className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-350">No CRM calls recorded yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-xs text-center leading-relaxed">
            There are no audio captures linked to this account. Use the AI Tester above to process a sample call locally.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-brand-500/5 border border-brand-500/10 rounded-lg text-slate-400 text-xs leading-normal">
            <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            <span>
              <strong>Call Records:</strong> Below are customer call records from Supabase.
            </span>
          </div>


      {/* List */}
      <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl divide-y divide-slate-800/60 overflow-hidden">
        {calls.map((call) => {
          const badge = getStatusBadge(call.status)
          return (
            <div key={call.id} className="flex items-center justify-between p-4 hover:bg-slate-900/25 transition duration-150">
              
              {/* Left Column: Icon + Started Time */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 shrink-0">
                  <PhoneCall className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-550 shrink-0" />
                    <span>{formatDate(call.started_at)}</span>
                  </span>
                  <div className="text-[10px] text-slate-500 mt-1 leading-none">
                    ID: <span className="font-mono">{call.id.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Duration + Status Badge */}
              <div className="flex items-center gap-4 shrink-0">
                {/* Duration */}
                <div className="flex items-center gap-1.5 text-slate-300 font-mono text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatDuration(call.duration_seconds)}</span>
                </div>
                {/* Status */}
                <span className={`inline-block text-[9px] font-bold px-2 py-0.5 border rounded uppercase tracking-wider ${badge.classes}`}>
                  {badge.label}
                </span>
              </div>

              </div>
            )
          })}
        </div>

      {recordings.length > 0 && (
        <div className="mt-8">
          <div className="flex items-start gap-3 p-3.5 bg-blue-500/5 border border-blue-500/10 rounded-lg text-slate-400 text-xs leading-normal mb-4">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              <strong>Meeting Recordings:</strong> Synced from Chrome Extension.
            </span>
          </div>
          <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl divide-y divide-slate-800/60 overflow-hidden">
            {recordings.map((rec) => (
              <div key={rec.id} className="p-4 hover:bg-slate-900/25 transition duration-150 space-y-3">
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300 font-bold min-w-0">
                    <span className="capitalize">{rec.platform.replace('_', ' ')}</span>
                    <span className="text-slate-500 font-normal truncate">| {new Date(rec.started_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {rec.status === 'processed' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Processed
                      </span>
                    )}
                    {rec.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-rose-500/10 text-rose-400 border-rose-500/20">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                    <div className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 font-mono">
                      {formatDuration(rec.duration_seconds)}
                    </div>
                    <button
                      onClick={() => handleProcessRecording(rec)}
                      disabled={processingRecordingId === rec.id || rec.status === 'processing'}
                      title="Run the local AI pipeline on this recording"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-[11px] rounded-lg transition shadow-md"
                    >
                      {processingRecordingId === rec.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : rec.status === 'processed' ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Reprocess</span>
                        </>
                      ) : rec.status === 'failed' ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Process</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <audio controls className="w-full h-8" src={getRecordingPublicUrl(rec.storage_path)} />
                {recordingError && recordingError.id === rec.id && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{recordingError.message}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      </div>
      )}
    </div>
  )
}

