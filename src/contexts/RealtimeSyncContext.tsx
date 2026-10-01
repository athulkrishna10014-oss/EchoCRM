import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase/client'
import { autoProcessRecording, recoverStaleRecordings, isRecordingStale } from '../services/aiPipelineService'
import { MeetingRecording } from '../types'

export type SyncStatus = 'connected' | 'connecting' | 'disconnected';

export interface RealtimeEvent {
  table: 'customers' | 'tasks' | 'deals' | 'calls' | 'call_summaries' | 'meeting_recordings';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord: any;
  oldRecord: any;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

interface RealtimeSyncContextType {
  status: SyncStatus;
  subscribe: (listener: RealtimeListener) => () => void;
}

const RealtimeSyncContext = createContext<RealtimeSyncContextType | undefined>(undefined)

export const RealtimeSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const listenersRef = useRef<Set<RealtimeListener>>(new Set())

  // Register listener callbacks
  const subscribe = React.useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  // Broadcast event to all active hook listeners
  const broadcastEvent = (payload: any) => {
    const event: RealtimeEvent = {
      table: payload.table as any,
      eventType: payload.eventType,
      newRecord: payload.new,
      oldRecord: payload.old
    };
    listenersRef.current.forEach((listener) => {
      try {
        listener(event)
      } catch (err) {
        console.error('Error in realtime listener callback:', err)
      }
    })
  }

  /**
   * Automatic processing and stale lock recovery trigger.
   * When a meeting_recordings row arrives (INSERT or UPDATE):
   * - If status is 'uploaded': triggers the AI pipeline automatically.
   * - If status is in-progress but stale: recovers the lock and allows retry.
   * The autoProcessRecording function enforces idempotency via an atomic status claim.
   */
  const handleAutoProcess = async (payload: any) => {
    const record = payload.new
    if (!record) return

    const isUploaded = record.status === 'uploaded'
    const isStale = isRecordingStale(record)

    if (!isUploaded && !isStale) return

    // Require Electron context (local AI pipeline)
    if (!window.electronAPI?.downloadToTemp || !window.ai?.processCall) {
      console.log('[AutoProcess] Electron not available — skipping automatic processing.')
      return
    }

    console.log(`[AutoProcess] Detected recording for action (${isUploaded ? 'uploaded' : 'stale recovery'}):`, record.id)
    try {
      await autoProcessRecording(record as MeetingRecording)
    } catch (err) {
      // Errors are already logged and status updated inside autoProcessRecording
    }
  }

  useEffect(() => {
    console.log('Establishing Realtime Sync channel...');
    setStatus('connecting')

    // On mount, recover any recordings left stuck in processing from previous sessions
    recoverStaleRecordings().catch(err => {
      console.error('[RealtimeSyncContext] Initial stale recovery sweep failed:', err);
    });

    // Periodic sweep every 5 minutes to prevent locks from remaining stuck permanently
    const staleInterval = setInterval(() => {
      recoverStaleRecordings().catch(err => {
        console.error('[RealtimeSyncContext] Periodic stale recovery sweep failed:', err);
      });
    }, 5 * 60 * 1000);

    const channel = supabase.channel('public-db-sync')

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          broadcastEvent(payload)

          // Auto-process uploaded recordings or recover stale recordings
          if (
            payload.table === 'meeting_recordings' &&
            (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')
          ) {
            handleAutoProcess(payload)
          }
        }
      )
      .subscribe((subscribeStatus) => {
        console.log(`Realtime channel status update: ${subscribeStatus}`)
        if (subscribeStatus === 'SUBSCRIBED') {
          setStatus('connected')
        } else if (subscribeStatus === 'CLOSED') {
          setStatus('disconnected')
        } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
          setStatus('disconnected')
        } else {
          setStatus('connecting')
        }
      })

    return () => {
      console.log('Cleaning up Realtime Sync channel...');
      clearInterval(staleInterval);
      supabase.removeChannel(channel);
    };
  }, [])

  return (
    <RealtimeSyncContext.Provider value={{ status, subscribe }}>
      {children}
    </RealtimeSyncContext.Provider>
  )
}

export const useRealtimeSync = () => {
  const context = useContext(RealtimeSyncContext)
  if (!context) {
    throw new Error('useRealtimeSync must be used within a RealtimeSyncProvider')
  }
  return context
}
