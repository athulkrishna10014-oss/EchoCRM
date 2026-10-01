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
      recording: { label: 'Recording', classes: 'bg-[#B94A48]/10 text-[#B94A48] border-[#B94A48]/20 animate-pulse' },
      processing: { label: 'Processing', classes: 'bg-[#F0D8CA] text-[#B85C38] border-[#B85C38]/20' },
      done: { label: 'Completed', classes: 'bg-[#64866A]/10 text-[#64866A] border-[#64866A]/20' }
    };
    return mappings[status] || { label: status, classes: 'bg-[#F7F4EE] text-[#817A72] border-[#E8E1D8]' };
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Upload and Process Real Audio */}
      <div className="p-6 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#292522] flex items-center gap-2 font-display">
              <UploadCloud className="w-5 h-5 text-[#B85C38]" />
              Upload Call Recording
            </h3>
            <p className="text-xs text-[#817A72] mt-1">
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
              className="flex items-center gap-2 px-4 py-2.5 bg-[#B85C38] hover:bg-[#a24f2f] active:scale-95 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition duration-150 shadow-xs disabled:cursor-not-allowed"
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
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs shrink-0 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
            <span>{processError}</span>
          </div>
        )}
      </div>

      {/* Local AI Pipeline Integration Tester */}
      <AIPipelineTester onResult={onTranscriptResult} />

      {calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[#E8E1D8] rounded-2xl bg-[#FFFDF9] select-none">
          <div className="p-3.5 bg-[#F0D8CA]/60 text-[#B85C38] border border-[#B85C38]/20 rounded-2xl mb-3 shadow-xs">
            <PhoneCall className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-[#292522] font-display">No CRM calls recorded yet</h4>
          <p className="text-xs text-[#817A72] mt-1 max-w-xs text-center leading-relaxed">
            There are no audio captures linked to this account. Use the AI Tester above to process a sample call locally.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-[#F0D8CA]/30 border border-[#B85C38]/20 rounded-xl text-[#817A72] text-xs leading-normal">
            <Info className="w-4 h-4 text-[#B85C38] shrink-0 mt-0.5" />
            <span>
              <strong className="text-[#292522]">Call Records:</strong> Below are customer call records from Supabase.
            </span>
          </div>

          {/* List */}
          <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl divide-y divide-[#E8E1D8] overflow-hidden shadow-xs">
            {calls.map((call) => {
              const badge = getStatusBadge(call.status)
              return (
                <div key={call.id} className="flex items-center justify-between p-4 hover:bg-[#F7F4EE]/60 transition duration-150">
                  
                  {/* Left Column: Icon + Started Time */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="p-2.5 bg-[#F0D8CA]/60 border border-[#B85C38]/20 rounded-xl text-[#B85C38] shrink-0">
                      <PhoneCall className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[#292522] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#817A72] shrink-0" />
                        <span>{formatDate(call.started_at)}</span>
                      </span>
                      <div className="text-[11px] text-[#817A72] mt-1 leading-none">
                        ID: <span className="font-mono">{call.id.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Duration + Status Badge */}
                  <div className="flex items-center gap-4 shrink-0">
                    {/* Duration */}
                    <div className="flex items-center gap-1.5 text-[#817A72] font-mono text-xs">
                      <Clock className="w-3.5 h-3.5 text-[#817A72]" />
                      <span>{formatDuration(call.duration_seconds)}</span>
                    </div>
                    {/* Status */}
                    <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 border rounded-md uppercase tracking-wider ${badge.classes}`}>
                      {badge.label}
                    </span>
                  </div>

                </div>
              )
            })}
          </div>

          {recordings.length > 0 && (
            <div className="mt-8">
              <div className="flex items-start gap-3 p-3.5 bg-[#F0D8CA]/30 border border-[#B85C38]/20 rounded-xl text-[#817A72] text-xs leading-normal mb-4">
                <Info className="w-4 h-4 text-[#B85C38] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#292522]">Meeting Recordings:</strong> Synced from Chrome Extension.
                </span>
              </div>
              <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl divide-y divide-[#E8E1D8] overflow-hidden shadow-xs">
                {recordings.map((rec) => (
                  <div key={rec.id} className="p-4 hover:bg-[#F7F4EE]/60 transition duration-150 space-y-3">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-2 text-xs text-[#292522] font-bold min-w-0">
                        <span className="capitalize">{rec.platform.replace('_', ' ')}</span>
                        <span className="text-[#817A72] font-normal truncate">| {new Date(rec.started_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rec.status === 'processed' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-md border uppercase tracking-wider bg-[#64866A]/10 text-[#64866A] border-[#64866A]/20">
                            <CheckCircle2 className="w-3 h-3" /> Processed
                          </span>
                        )}
                        {rec.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-md border uppercase tracking-wider bg-[#B94A48]/10 text-[#B94A48] border-[#B94A48]/20">
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        )}
                        <div className="text-[10px] bg-[#F7F4EE] border border-[#E8E1D8] px-2.5 py-1 rounded-md text-[#817A72] font-mono">
                          {formatDuration(rec.duration_seconds)}
                        </div>
                        <button
                          onClick={() => handleProcessRecording(rec)}
                          disabled={processingRecordingId === rec.id || rec.status === 'processing'}
                          title="Run the local AI pipeline on this recording"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B85C38] hover:bg-[#a24f2f] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-[11px] rounded-xl transition shadow-xs"
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
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs">
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

