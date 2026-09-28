import { useState, useEffect, useCallback } from 'react'
import { Call, Task, Deal, DealStage, CallSummary, TaskStatus } from '../types'
import { 
  getCustomerCalls, 
  getCustomerTasks, 
  getCustomerDeals, 
  getCustomerCallSummaries,
  createTask, 
  updateTask, 
  deleteTask, 
  updateDealStage,
  updateCallSummary,
  getCustomerRecordings
} from '../services/workspaceService'
import { useRealtimeSync } from '../contexts/RealtimeSyncContext'

// Helper for task sorting
const taskSortFn = (a: Task, b: Task) => {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
};

export type WorkspaceTab = 'overview' | 'calls' | 'transcript' | 'tasks' | 'deals';

export function useWorkspace(customerId: string) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview')
  
  // Data lists
  const [calls, setCalls] = useState<Call[]>([])
  const [recordings, setRecordings] = useState<any[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [summaries, setSummaries] = useState<(CallSummary & { call?: { started_at?: string; customer_id?: string } })[]>([])
  
  // Loading indicators
  const [loading, setLoading] = useState(true)
  
  // Custom error states
  const [error, setError] = useState<string | null>(null)
  const { subscribe } = useRealtimeSync()

  const loadAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fetchedCalls, fetchedTasks, fetchedDeals, fetchedRecordings, fetchedSummaries] = await Promise.all([
        getCustomerCalls(customerId),
        getCustomerTasks(customerId),
        getCustomerDeals(customerId),
        getCustomerRecordings(customerId),
        getCustomerCallSummaries(customerId)
      ]);
      setCalls(fetchedCalls)
      setRecordings(fetchedRecordings)
      setTasks(fetchedTasks)
      setDeals(fetchedDeals)
      setSummaries(fetchedSummaries)
    } catch (err: any) {
      setError(err?.message || 'Unable to load workspace data.')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  // Fetch all customer information in parallel on mount or customer id change
  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Realtime subscription listener
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      // 1. Calls Table
      if (event.table === 'calls') {
        const record = event.eventType === 'DELETE' ? event.oldRecord : event.newRecord;
        if (record.customer_id !== customerId) return;

        if (event.eventType === 'DELETE') {
          setCalls((prev) => prev.filter((c) => c.id !== event.oldRecord.id));
        } else if (event.eventType === 'UPDATE') {
          setCalls((prev) => 
            prev.map((c) => (c.id === event.newRecord.id ? event.newRecord : c))
                .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
          );
        } else if (event.eventType === 'INSERT') {
          setCalls((prev) => {
            const exists = prev.some((c) => c.id === event.newRecord.id);
            if (exists) return prev;
            return [event.newRecord, ...prev].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
          });
        }
      }

      // 2. Tasks Table
      else if (event.table === 'tasks') {
        const record = event.eventType === 'DELETE' ? event.oldRecord : event.newRecord;
        if (record.customer_id !== customerId) return;

        if (event.eventType === 'DELETE') {
          setTasks((prev) => prev.filter((t) => t.id !== event.oldRecord.id));
        } else if (event.eventType === 'UPDATE') {
          setTasks((prev) => {
            const exists = prev.some((t) => t.id === event.newRecord.id);
            if (exists) {
              return prev.map((t) => (t.id === event.newRecord.id ? event.newRecord : t)).sort(taskSortFn);
            }
            return prev;
          });
        } else if (event.eventType === 'INSERT') {
          setTasks((prev) => {
            const exists = prev.some((t) => t.id === event.newRecord.id);
            if (exists) return prev;
            return [...prev, event.newRecord].sort(taskSortFn);
          });
        }
      }

      // 3. Deals Table
      else if (event.table === 'deals') {
        const record = event.eventType === 'DELETE' ? event.oldRecord : event.newRecord;
        if (record.customer_id !== customerId) return;

        if (event.eventType === 'DELETE') {
          setDeals((prev) => prev.filter((d) => d.id !== event.oldRecord.id));
        } else if (event.eventType === 'UPDATE') {
          setDeals((prev) => {
            const exists = prev.some((d) => d.id === event.newRecord.id);
            if (exists) {
              return prev.map((d) => (d.id === event.newRecord.id ? event.newRecord : d))
                         .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            }
            return prev;
          });
        } else if (event.eventType === 'INSERT') {
          setDeals((prev) => {
            const exists = prev.some((d) => d.id === event.newRecord.id);
            if (exists) return prev;
            return [event.newRecord, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          });
        }
      }

      // 4. Call Summaries Table (refresh scoped list; payload has no customer_id)
      else if (event.table === 'call_summaries') {
        getCustomerCallSummaries(customerId)
          .then((fresh) => setSummaries(fresh))
          .catch(() => {});
      }

      // 5. Meeting Recordings Table
      else if (event.table === 'meeting_recordings') {
        const record = event.eventType === 'DELETE' ? event.oldRecord : event.newRecord;
        if (record.customer_id !== customerId) return;

        if (event.eventType === 'DELETE') {
          setRecordings((prev) => prev.filter((r) => r.id !== event.oldRecord.id));
        } else if (event.eventType === 'UPDATE') {
          setRecordings((prev) => {
            const exists = prev.some((r) => r.id === event.newRecord.id);
            if (exists) {
              return prev.map((r) => (r.id === event.newRecord.id ? event.newRecord : r))
                         .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
            }
            return prev;
          });
        } else if (event.eventType === 'INSERT') {
          setRecordings((prev) => {
            const exists = prev.some((r) => r.id === event.newRecord.id);
            if (exists) return prev;
            return [event.newRecord, ...prev].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
          });
        }
      }
    });

    return () => {
      unsubscribe()
    };
  }, [subscribe, customerId])

  // Tasks CRUD operations
  const addTask = async (description: string, dueDate?: string, status: TaskStatus = 'pending') => {
    try {
      setError(null)
      const newTask = await createTask({
        customer_id: customerId,
        description: description.trim(),
        due_date: dueDate || undefined,
        status: status || 'pending'
      });
      setTasks((prev) => [...prev, newTask].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }));
    } catch (err: any) {
      setError(err?.message || 'Task could not be created.');
      throw err;
    }
  }

  const editTask = async (taskId: string, description: string, dueDate?: string, status?: TaskStatus) => {
    try {
      setError(null)
      const updated = await updateTask(taskId, {
        description: description.trim(),
        due_date: dueDate || undefined,
        status: status
      });
      setTasks((prev) => 
        prev.map((t) => (t.id === taskId ? updated : t))
            .sort((a, b) => {
              if (!a.due_date && !b.due_date) return 0;
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            })
      );
    } catch (err: any) {
      setError(err?.message || 'Task details could not be saved.');
      throw err;
    }
  }

  const toggleTaskComplete = async (taskId: string, currentStatus: 'pending' | 'done') => {
    try {
      setError(null)
      const nextStatus = currentStatus === 'pending' ? 'done' : 'pending';
      
      // Optimistically update UI
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
      
      await updateTask(taskId, { status: nextStatus });
    } catch (err: any) {
      // Revert on failure
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t)));
      setError(err?.message || 'Unable to modify task completion state.');
    }
  }

  const removeTask = async (taskId: string) => {
    try {
      setError(null)
      await deleteTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      setError(err?.message || 'Task could not be deleted.');
      throw err;
    }
  }

  // Deals Stage operations
  const changeDealStage = async (dealId: string, stage: DealStage) => {
    const originalDeals = [...deals];
    try {
      setError(null)
      
      // Optimistically update stage tag
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
      
      await updateDealStage(dealId, stage);
    } catch (err: any) {
      // Revert on failure
      setDeals(originalDeals)
      setError(err?.message || 'Unable to update deal stage.');
    }
  }

  // Correct an AI-generated call summary
  const editSummary = async (summaryId: string, updates: { summary_text?: string; deal_stage?: DealStage }) => {
    try {
      setError(null)
      const updated = await updateCallSummary(summaryId, updates)
      setSummaries((prev) => prev.map((s) => (s.id === summaryId ? { ...s, ...updated } : s)))
    } catch (err: any) {
      setError(err?.message || 'Call summary could not be updated.')
      throw err
    }
  }

  return {
    activeTab,
    setActiveTab,
    calls,
    recordings,
    tasks,
    deals,
    summaries,
    loading,
    error,
    addTask,
    editTask,
    toggleTaskComplete,
    removeTask,
    changeDealStage,
    editSummary,
    refresh: loadAllData
  }
}
export type UseWorkspaceType = ReturnType<typeof useWorkspace>;
