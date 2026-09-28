export type CallStatus = 'recording' | 'processing' | 'done';
export type TaskStatus = 'pending' | 'done';
export type DealStage = 'prospecting' | 'negotiation' | 'closing' | 'won' | 'lost';
export type SentimentType = 'positive' | 'neutral' | 'negative';

/** All valid status values for meeting_recordings.status */
export type MeetingRecordingStatus =
  | 'local_saved'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'transcribing'
  | 'analyzing'
  | 'customer_resolving'
  | 'needs_customer'
  | 'processed'
  | 'failed';

export interface User {
  id: string;
  email: string;
  name?: string;
  created_at?: string;
}

export interface Customer {
  id: string;
  owner_id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  tags: string[];
  created_at: string;
}

export interface MeetingRecording {
  id: string;
  owner_id?: string;
  platform: string;
  meeting_url: string;
  started_at: string;
  stopped_at?: string;
  duration_seconds: number;
  mime_type: string;
  storage_path: string;
  /** See MeetingRecordingStatus for valid values */
  status: MeetingRecordingStatus | string;
  customer_id?: string | null;
  customer?: { name: string };
  last_error?: string | null;
  /** Name extracted by AI from transcript (only when no manual customer was supplied) */
  ai_customer_name?: string | null;
  /** Candidate customer UUIDs when AI name is ambiguous */
  candidate_customer_ids?: string[] | null;
}

export interface Call {
  id: string;
  customer_id: string;
  owner_id: string;
  audio_url?: string;
  recording_id?: string | null;
  duration_seconds?: number;
  started_at: string;
  raw_transcript: any;
  clean_transcript?: any;
  status: CallStatus;
  created_at: string;
  customer?: { name: string };
}

export interface CallSummary {
  id: string;
  call_id: string;
  summary_text?: string;
  product?: string;
  deal_stage?: DealStage;
  sentiment?: SentimentType;
  created_at: string;
}

export type TaskPriority = 'high' | 'medium' | 'low';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskActivityItem {
  id: string;
  type: 'created' | 'status_changed' | 'subtask_completed' | 'edited' | 'completed';
  description: string;
  timestamp: string;
}

export interface TaskMetadata {
  priority?: TaskPriority;
  status?: 'pending' | 'in_progress' | 'done';
  subtasks?: Subtask[];
  key_context?: Record<string, string>;
  recommendation?: string;
  activity?: TaskActivityItem[];
}

export interface Task {
  id: string;
  customer_id: string;
  call_id?: string;
  owner_id: string;
  description: string;
  title?: string;
  detailed_description?: string;
  priority?: TaskPriority;
  task_status?: 'pending' | 'in_progress' | 'done';
  subtasks?: Subtask[];
  key_context?: Record<string, string>;
  recommendation?: string;
  activity?: TaskActivityItem[];
  due_date?: string;
  status: TaskStatus;
  created_at: string;
  customer?: { name: string; phone?: string; email?: string; company?: string };
}

export interface Deal {
  id: string;
  customer_id: string;
  owner_id: string;
  product: string;
  stage: DealStage;
  expected_close_date?: string;
  value: number;
  created_at: string;
  customer?: { name: string };
}

export interface AIAnalysisResult {
  summary: string;
  sentiment: SentimentType;
  deal_stage: DealStage;
  deal_value?: number;
  customer_intent: string;
  products_discussed: string[];
  action_items: Array<{
    title?: string;
    detailed_description?: string;
    description: string;
    priority?: TaskPriority;
    subtasks?: string[];
    key_context?: Record<string, string>;
    recommendation?: string;
    due_date: string | null;
  }>;
  follow_up: {
    required: boolean;
    date: string | null;
    reason: string;
  };
}

export interface AIPipelineResponse {
  status: 'SUCCESS' | 'AUDIO_ERROR' | 'TRANSCRIPTION_ERROR' | 'LLM_ERROR' | 'INVALID_LLM_OUTPUT' | 'PIPELINE_ERROR';
  audio_path: string;
  transcript: string;
  clean_transcript?: string;
  analysis: AIAnalysisResult;
  /** Extracted customer name from transcript (only present when no customer_id was supplied) */
  extracted_customer_name?: string | null;
  /** Full extracted customer details from transcript (name, phone, email, company) */
  extracted_customer_info?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
  } | null;
  metadata: {
    processing_time_seconds: number;
    audio_duration_seconds: number;
    transcription_model: string;
    llm_provider: string;
    llm_model: string;
    errors: string[];
    /** true if customer_id was pre-supplied (manual), false if AI identification was attempted */
    customer_pre_supplied?: boolean;
  };
}

export interface AIHealthResponse {
  status: string;
  service?: string;
  whisper_model?: string;
  llm_provider?: string;
  llm_model?: string;
  error?: string;
}

declare global {
  interface Window {
    ai?: {
      checkHealth: () => Promise<AIHealthResponse>;
      /** Pass customerId to skip AI customer extraction (manual customer wins). */
      processCall: (audioPath: string, customerId?: string) => Promise<AIPipelineResponse>;
      processSampleCall: () => Promise<AIPipelineResponse>;
    };
    electronAPI?: {
      platform: string;
      downloadToTemp: (url: string, filename: string) => Promise<string>;
      exportPdf: (html: string, filename: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
      notify: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}


