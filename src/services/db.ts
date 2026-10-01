import { supabase } from '../supabase/client'
import { Customer, Task } from '../types'

export interface DashboardStats {
  totalCustomers: number;
  pendingTasksCount: number;
  todayCallsCount: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentCustomers: Customer[];
  pendingTasks: Task[];
}

export interface CallsPerDay {
  date: string;
  count: number;
}

export interface TranscriptSearchResult {
  id: string;
  customer_id: string;
  customer_name: string;
  started_at: string;
  snippet: string;
}

/**
 * Handle database errors safely by translating them into user-friendly messages.
 */
function handleDbError(error: any, fallbackMessage: string): Error {
  console.error(error);
  const msg = error?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('TypeError')) {
    return new Error('Unable to connect to database. Please check your connection.');
  }
  if (msg.includes('JWT expired') || msg.includes('Invalid token')) {
    return new Error('Your session has expired. Please sign in again.');
  }
  return new Error(fallbackMessage);
}

/**
 * Fetch all required dashboard data in a single coordinated load.
 */
export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayISO = startOfToday.toISOString();

    // 1. Fetch Stats Counts
    // Customers count
    const { count: customerCount, error: customerCountErr } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    
    if (customerCountErr) throw handleDbError(customerCountErr, 'Unable to retrieve customer statistics.');

    // Pending tasks count
    const { count: pendingTasksCount, error: pendingTasksCountErr } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    if (pendingTasksCountErr) throw handleDbError(pendingTasksCountErr, 'Unable to retrieve task statistics.');


    // Today's calls count
    const { count: todayCallsCount, error: todayCallsCountErr } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', todayISO);
    
    if (todayCallsCountErr) throw handleDbError(todayCallsCountErr, 'Unable to retrieve call statistics.');

    // 2. Fetch Lists
    // Recent customers (limit 5)
    const { data: recentCustomers, error: recentCustErr } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentCustErr) throw handleDbError(recentCustErr, 'Unable to load recent customers.');

    // Pending tasks (limit 5, sorted by due date)
    const { data: pendingTasks, error: pendingTasksErr } = await supabase
      .from('tasks')
      .select('*, customer:customers(name)')
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(5);

    if (pendingTasksErr) throw handleDbError(pendingTasksErr, 'Unable to load pending tasks.');

    return {
      stats: {
        totalCustomers: customerCount || 0,
        pendingTasksCount: pendingTasksCount || 0,
        todayCallsCount: todayCallsCount || 0,
      },
      recentCustomers: recentCustomers || [],
      pendingTasks: pendingTasks || [],
    };
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while loading dashboard.');
  }
}

/**
 * Resolve the public playback URL for a meeting recording in Supabase Storage.
 */
export function getRecordingPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from('meeting-recordings').getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function fetchMeetingRecordings() {
  const { data, error } = await supabase
    .from('meeting_recordings')
    .select('*, customer:customers(name)')
    .order('started_at', { ascending: false });
  
  if (error) throw handleDbError(error, 'Failed to fetch recordings');
  return data;
}

export async function assignRecordingToCustomer(recordingId: string, customerId: string | null) {
  const { data, error } = await supabase
    .from('meeting_recordings')
    .update({ customer_id: customerId })
    .eq('id', recordingId)
    .select('*, customer:customers(name)')
    .single();

  if (error) throw handleDbError(error, 'Failed to assign recording');
  return data;
}

/**
 * Keyword search across the user's call transcripts (raw, user-facing version).
 */
export async function searchCallTranscripts(term: string): Promise<TranscriptSearchResult[]> {
  const { data, error } = await supabase.rpc('search_call_transcripts', { search_term: term.trim() });
  if (error) throw handleDbError(error, 'Transcript search failed.');
  return (data || []) as TranscriptSearchResult[];
}


/**
 * Count calls logged per day over the last `days` days (oldest first).
 */
export async function fetchCallsPerDay(days = 14): Promise<CallsPerDay[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const { data, error } = await supabase
    .from('calls')
    .select('started_at')
    .gte('started_at', since.toISOString());

  if (error) throw handleDbError(error, 'Unable to load call activity.');

  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }

  (data || []).forEach((call: any) => {
    const key = new Date(call.started_at).toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}
