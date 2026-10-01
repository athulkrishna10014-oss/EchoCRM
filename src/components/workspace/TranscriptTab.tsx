import React, { useState } from 'react'
import { Call, AIPipelineResponse } from '../../types'
import {
  FileText,
  Copy,
  CheckCircle2,
  Clock,
  Cpu,
  Sparkles,
  Bot,
  Mic,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Zap,
} from 'lucide-react'

interface TranscriptTabProps {
  calls: Call[]
  lastResult: AIPipelineResponse | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(totalSeconds?: number) {
  if (totalSeconds === undefined || totalSeconds === null) return '--:--'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getTranscriptText(raw: any): string | null {
  if (!raw) return null
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (typeof raw === 'object' && raw.error) return null
  if (typeof raw === 'object' && raw.text) return String(raw.text)
  return null
}

interface CallTranscriptCardProps {
  call: Call
  isLatest: boolean
}

const CallTranscriptCard: React.FC<CallTranscriptCardProps> = ({ call, isLatest }) => {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(isLatest)

  const rawText = getTranscriptText(call.raw_transcript)
  const cleanText =
    call.clean_transcript && typeof call.clean_transcript === 'string'
      ? call.clean_transcript.trim()
      : typeof call.clean_transcript === 'object' && call.clean_transcript !== null
      ? JSON.stringify(call.clean_transcript, null, 2)
      : null

  const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0
  const hasTranscript = !!rawText

  const handleCopy = () => {
    const text = rawText || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        isLatest
          ? 'border-[#B85C38]/40 bg-[#FFFDF9] shadow-xs'
          : 'border-[#E8E1D8] bg-[#FFFDF9]'
      }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F7F4EE]/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2.5 rounded-xl border shrink-0 ${
              isLatest
                ? 'bg-[#F0D8CA]/60 border-[#B85C38]/20 text-[#B85C38]'
                : 'bg-[#F7F4EE] border-[#E8E1D8] text-[#817A72]'
            }`}
          >
            <Mic className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#292522] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#817A72] shrink-0" />
                {formatDate(call.started_at)}
              </span>
              {isLatest && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 bg-[#F0D8CA] text-[#B85C38] border border-[#B85C38]/20 rounded-md uppercase tracking-wider">
                  <Zap className="w-2.5 h-2.5" />
                  Latest
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-[#817A72] font-mono">
                ID: {call.id.slice(0, 8)}...
              </span>
              {call.duration_seconds !== undefined && (
                <span className="text-[11px] text-[#817A72] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#817A72]" />
                  {formatDuration(call.duration_seconds)}
                </span>
              )}
              {hasTranscript ? (
                <span className="text-[11px] text-[#817A72] font-mono">{wordCount} words</span>
              ) : (
                <span className="text-[11px] text-[#B94A48] font-semibold">No transcript</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {hasTranscript && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFDF9] hover:bg-[#F7F4EE] border border-[#E8E1D8] text-[#817A72] hover:text-[#292522] rounded-xl text-xs font-semibold transition shadow-xs"
              title="Copy transcript"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#64866A]" />
                  <span className="text-[#64866A]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#817A72]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#817A72]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-[#E8E1D8] pt-4">
          {hasTranscript ? (
            <>
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-[#817A72] uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#B85C38]" />
                  Speech-to-Text Transcript
                </h5>
                <div className="p-4 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-xs text-[#292522] leading-[1.85] max-h-72 overflow-y-auto whitespace-pre-wrap font-mono selection:bg-[#F0D8CA]">
                  {rawText}
                </div>
              </div>
              {cleanText && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-[#817A72] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#B85C38]" />
                    Cleaned / Formatted Transcript
                  </h5>
                  <div className="p-4 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-xs text-[#292522] leading-[1.85] max-h-60 overflow-y-auto whitespace-pre-wrap selection:bg-[#F0D8CA]">
                    {cleanText}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-3.5 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-xs text-[#817A72] italic">
              No transcript was saved for this call. The call may still be processing or the AI
              pipeline may have encountered an error.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface LiveResultBannerProps {
  lastResult: AIPipelineResponse
}

const LiveResultBanner: React.FC<LiveResultBannerProps> = ({ lastResult }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(lastResult.transcript || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const wordCount = lastResult.transcript
    ? lastResult.transcript.trim().split(/\s+/).filter(Boolean).length
    : 0

  if (lastResult.status !== 'SUCCESS') {
    return (
      <div className="flex items-start gap-3 p-4 bg-[#B94A48]/10 border border-[#B94A48]/20 rounded-2xl text-[#B94A48] text-xs">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold mb-0.5">Last pipeline run did not succeed</div>
          <div className="opacity-90">
            Status: <span className="font-mono">{lastResult.status}</span>
            {lastResult.metadata?.errors?.length > 0 && (
              <> - {lastResult.metadata.errors.join(', ')}</>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-[#FFFDF9] border border-[#B85C38]/30 rounded-2xl space-y-4 shadow-xs animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs font-bold text-[#B85C38] uppercase tracking-wider flex items-center gap-2 font-display">
          <Zap className="w-4 h-4" />
          Live Pipeline Result
        </h4>
        <div className="grid grid-cols-4 gap-2">
          {[
            { Icon: Clock, label: 'Duration', value: lastResult.metadata?.audio_duration_seconds != null ? `${lastResult.metadata.audio_duration_seconds}s` : 'n/a' },
            { Icon: Cpu, label: 'Processed', value: lastResult.metadata?.processing_time_seconds != null ? `${lastResult.metadata.processing_time_seconds}s` : 'n/a' },
            { Icon: Sparkles, label: 'Whisper', value: lastResult.metadata?.transcription_model || 'n/a' },
            { Icon: Bot, label: 'LLM', value: lastResult.metadata?.llm_model || 'n/a' },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="p-2.5 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-center">
              <div className="flex items-center justify-center gap-1 text-[#817A72] text-[10px] font-semibold mb-0.5">
                <Icon className="w-3 h-3 text-[#B85C38]" />
                <span>{label}</span>
              </div>
              <div className="text-xs font-bold text-[#292522] font-mono truncate">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-[#817A72] uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#B85C38]" />
            Speech-to-Text Transcript
          </h5>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-[#817A72] px-2 py-0.5 bg-[#F7F4EE] border border-[#E8E1D8] rounded-md">
              {wordCount} words
            </span>
            <button
              onClick={handleCopy}
              disabled={!lastResult.transcript}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#FFFDF9] hover:bg-[#F7F4EE] border border-[#E8E1D8] text-[#817A72] hover:text-[#292522] rounded-xl text-xs font-semibold transition disabled:opacity-40 shadow-xs"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#64866A]" />
                  <span className="text-[#64866A]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
        {lastResult.transcript ? (
          <div className="p-4 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-xs text-[#292522] leading-[1.85] max-h-64 overflow-y-auto whitespace-pre-wrap font-mono selection:bg-[#F0D8CA]">
            {lastResult.transcript}
          </div>
        ) : (
          <div className="p-3.5 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-xs text-[#817A72] italic">
            No transcript text was returned by the AI pipeline.
          </div>
        )}
      </div>

      {lastResult.clean_transcript && (
        <div className="space-y-2">
          <h5 className="text-xs font-bold text-[#817A72] uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#B85C38]" />
            Cleaned / Formatted Transcript
          </h5>
          <div className="p-4 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-xs text-[#292522] leading-[1.85] max-h-60 overflow-y-auto whitespace-pre-wrap selection:bg-[#F0D8CA]">
            {typeof lastResult.clean_transcript === 'string'
              ? lastResult.clean_transcript
              : JSON.stringify(lastResult.clean_transcript, null, 2)}
          </div>
        </div>
      )}
    </div>
  )
}

export const TranscriptTab: React.FC<TranscriptTabProps> = ({ calls, lastResult }) => {
  const sortedCalls = [...calls].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )

  const hasAnyCalls = sortedCalls.length > 0

  return (
    <div className="space-y-5 animate-fadeIn">
      {lastResult && <LiveResultBanner lastResult={lastResult} />}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[#817A72] uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#B85C38]" />
            Saved Call Transcripts
            {hasAnyCalls && (
              <span className="text-[10px] font-mono bg-[#FFFDF9] border border-[#E8E1D8] text-[#817A72] px-2.5 py-0.5 rounded-full shadow-xs">
                {sortedCalls.length}
              </span>
            )}
          </h4>
        </div>

        {!hasAnyCalls ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#E8E1D8] rounded-2xl bg-[#FFFDF9] select-none">
            <div className="p-4 bg-[#F0D8CA]/60 text-[#B85C38] border border-[#B85C38]/20 rounded-2xl mb-4 shadow-xs">
              <Mic className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-[#292522] font-display">No transcripts yet</h4>
            <p className="text-xs text-[#817A72] mt-1.5 max-w-xs text-center leading-relaxed">
              Go to the <span className="text-[#B85C38] font-semibold">Calls</span> tab and process
              an audio file or recording to generate and save a transcript.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCalls.map((call, idx) => (
              <CallTranscriptCard key={call.id} call={call} isLatest={idx === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
