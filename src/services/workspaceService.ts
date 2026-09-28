import { supabase } from '../supabase/client'
import { Call, Task, Deal, DealStage, CallSummary } from '../types'

/**
 * Handle database errors safely by translating them into user-friendly messages.
 */
function handleWorkspaceError(error: any, fallbackMessage: string): Error {
  console.error(error);
  const msg = error?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('TypeError')) {
    return new Error('Unable to connect to database. Please check your connection.');
  }
  return new Error(fallbackMessage);
}

/**
 * Retrieve calls history associated with a specific customer.
 */
export async function getCustomerCalls(customerId: string): Promise<Call[]> {
  try {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('customer_id', customerId)
      .order('started_at', { ascending: false });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load call history.');
    }

    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading calls.');
  }
}

/**
 * Retrieve meeting recordings associated with a specific customer.
 */
export async function getCustomerRecordings(customerId: string) {
  try {
    const { data, error } = await supabase
      .from('meeting_recordings')
      .select('*')
      .eq('customer_id', customerId)
      .order('started_at', { ascending: false });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load recordings.');
    }

    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading recordings.');
  }
}

/**
 * Helper to sanitize dates on retrieved tasks.
 * If a task has an invalid date or a date before 2025 (e.g. LLM training-set hallucination like 2023),
 * it is cleaned in-memory and repaired in Supabase.
 */
function sanitizeTaskDates<T extends Task>(taskList: T[]): T[] {
  return taskList.map(task => {
    if (!task.due_date) return task;
    const dueDate = new Date(task.due_date);
    if (isNaN(dueDate.getTime()) || dueDate.getFullYear() < 2025) {
      // Clean up in background so DB row is fixed permanently
      supabase.from('tasks').update({ due_date: null }).eq('id', task.id).then();
      return { ...task, due_date: undefined };
    }
    return task;
  });
}

/**
 * Retrieve tasks list associated with a specific customer.
 */
export async function getCustomerTasks(customerId: string): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('customer_id', customerId)
      .order('due_date', { ascending: true });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load tasks list.');
    }

    return sanitizeTaskDates(data || []);
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading tasks.');
  }
}

/**
 * Retrieve deals associated with a specific customer.
 */
export async function getCustomerDeals(customerId: string): Promise<Deal[]> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load customer deals.');
    }

    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading deals.');
  }
}

/**
 * Retrieve all deals across all customers for the authenticated user.
 */
export async function getAllDeals(): Promise<Deal[]> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('You must be signed in to view deals.');
    }

    const { data, error } = await supabase
      .from('deals')
      .select('*, customer:customers(name)')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load deals.');
    }

    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading deals.');
  }
}

/**
 * Retrieve call summaries for all calls belonging to a customer.
 */
export async function getCustomerCallSummaries(
  customerId: string
): Promise<(CallSummary & { call?: { started_at?: string; customer_id?: string } })[]> {
  try {
    const { data: customerCalls, error: callsError } = await supabase
      .from('calls')
      .select('id, started_at, customer_id')
      .eq('customer_id', customerId);

    if (callsError) {
      throw handleWorkspaceError(callsError, 'Unable to load call summaries.');
    }

    const callIds = (customerCalls || []).map((c: any) => c.id);
    if (callIds.length === 0) return [];

    const { data, error } = await supabase
      .from('call_summaries')
      .select('*')
      .in('call_id', callIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load call summaries.');
    }

    const callMap = new Map((customerCalls || []).map((c: any) => [c.id, c]));
    return (data || []).map((summary: any) => ({ ...summary, call: callMap.get(summary.call_id) }));
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading call summaries.');
  }
}

/**
 * Persist manual corrections to an AI-generated call summary.
 */
export async function updateCallSummary(
  id: string,
  updates: { summary_text?: string; deal_stage?: DealStage }
): Promise<CallSummary> {
  try {
    const updateData: any = {};
    if (updates.summary_text !== undefined) updateData.summary_text = updates.summary_text.trim();
    if (updates.deal_stage !== undefined) updateData.deal_stage = updates.deal_stage;

    const { data, error } = await supabase
      .from('call_summaries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw handleWorkspaceError(error, 'Call summary could not be updated.');
    }

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while updating call summary.');
  }
}

/**
 * Create a new task for a customer.
 */
export async function createTask(
  task: Omit<Task, 'id' | 'created_at' | 'owner_id'>
): Promise<Task> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('You must be signed in to create a task.');
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        owner_id: user.id,
        customer_id: task.customer_id,
        call_id: task.call_id || null,
        description: task.description.trim(),
        due_date: task.due_date || null,
        status: task.status || 'pending',
      })
      .select()
      .single();

    if (error) {
      throw handleWorkspaceError(error, 'Task could not be created. Please verify inputs.');
    }

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while creating task.');
  }
}

/**
 * Update an existing task's description, due date, or status.
 */
export async function updateTask(
  id: string,
  task: Partial<Omit<Task, 'id' | 'created_at' | 'owner_id' | 'customer_id'>>
): Promise<Task> {
  try {
    const updateData: any = {};
    if (task.description !== undefined) updateData.description = task.description.trim();
    if (task.due_date !== undefined) updateData.due_date = task.due_date || null;
    if (task.status !== undefined) updateData.status = task.status;

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw handleWorkspaceError(error, 'Task could not be updated.');
    }

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while updating task.');
  }
}

/**
 * Delete a task.
 */
export async function deleteTask(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      throw handleWorkspaceError(error, 'Task could not be deleted.');
    }
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while deleting task.');
  }
}

/**
 * Update a deal's stage.
 */
export async function updateDealStage(id: string, stage: DealStage): Promise<Deal> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .update({ stage })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw handleWorkspaceError(error, 'Deal stage could not be updated.');
    }

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while updating deal.');
  }
}

/**
 * Fetch all tasks across all customers for the authenticated user.
 */
export async function getGlobalTasks(): Promise<(Task & { customer?: { name: string } })[]> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('You must be signed in to view tasks.');
    }

    const { data, error } = await supabase
      .from('tasks')
      .select('*, customer:customers(name)')
      .eq('owner_id', user.id)
      .order('due_date', { ascending: true });

    if (error) {
      throw handleWorkspaceError(error, 'Unable to load global tasks.');
    }

    return sanitizeTaskDates(data || []);
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading global tasks.');
  }
}

