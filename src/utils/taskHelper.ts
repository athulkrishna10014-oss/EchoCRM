import { Task, TaskPriority, Subtask, TaskActivityItem, TaskMetadata } from '../types';

export interface ParsedTaskContent {
  title: string;
  details: string;
  priority: TaskPriority;
  taskStatus: 'pending' | 'in_progress' | 'done';
  subtasks: Subtask[];
  keyContext: Record<string, string>;
  recommendation?: string;
  activity: TaskActivityItem[];
}

export function parseTaskContent(task: Task): ParsedTaskContent {
  const rawDesc = task.description || '';
  
  let title = task.title || '';
  let details = task.detailed_description || '';
  let priority: TaskPriority = task.priority || 'medium';
  let taskStatus: 'pending' | 'in_progress' | 'done' = task.status === 'done' ? 'done' : 'pending';
  let subtasks: Subtask[] = task.subtasks || [];
  let keyContext: Record<string, string> = task.key_context || {};
  let recommendation: string | undefined = task.recommendation;
  let activity: TaskActivityItem[] = task.activity || [];

  // Check for --- METADATA --- block in description
  const metaIndex = rawDesc.indexOf('--- METADATA ---');
  let mainBody = rawDesc;

  if (metaIndex !== -1) {
    mainBody = rawDesc.substring(0, metaIndex).trim();
    const metaString = rawDesc.substring(metaIndex + '--- METADATA ---'.length).trim();
    try {
      const parsedMeta: TaskMetadata = JSON.parse(metaString);
      if (parsedMeta.priority) priority = parsedMeta.priority;
      if (parsedMeta.status) {
        taskStatus = task.status === 'done' ? 'done' : parsedMeta.status;
      }
      if (Array.isArray(parsedMeta.subtasks)) subtasks = parsedMeta.subtasks;
      if (parsedMeta.key_context && typeof parsedMeta.key_context === 'object') keyContext = parsedMeta.key_context;
      if (parsedMeta.recommendation) recommendation = parsedMeta.recommendation;
      if (Array.isArray(parsedMeta.activity)) activity = parsedMeta.activity;
    } catch (e) {
      console.warn('Failed to parse task metadata JSON:', e);
    }
  }

  // Parse Title & Details from mainBody if not already present
  if (!title || !details) {
    const doubleBreak = mainBody.indexOf('\n\n');
    if (doubleBreak !== -1) {
      title = title || mainBody.substring(0, doubleBreak).trim();
      details = details || mainBody.substring(doubleBreak + 2).trim();
    } else {
      const singleBreak = mainBody.indexOf('\n');
      if (singleBreak !== -1) {
        title = title || mainBody.substring(0, singleBreak).trim();
        details = details || mainBody.substring(singleBreak + 1).trim();
      } else {
        title = title || mainBody;
        details = details || mainBody;
      }
    }
  }

  // Ensure initial activity exists
  if (activity.length === 0) {
    activity.push({
      id: 'act-init',
      type: 'created',
      description: task.call_id ? 'AI created task from call' : 'Task created',
      timestamp: task.created_at || new Date().toISOString()
    });
  }

  return {
    title,
    details,
    priority,
    taskStatus,
    subtasks,
    keyContext,
    recommendation,
    activity
  };
}

export function serializeTaskDescription(data: {
  title: string;
  details: string;
  priority: TaskPriority;
  taskStatus: 'pending' | 'in_progress' | 'done';
  subtasks: Subtask[];
  keyContext: Record<string, string>;
  recommendation?: string;
  activity: TaskActivityItem[];
}): string {
  const metadata: TaskMetadata = {
    priority: data.priority,
    status: data.taskStatus,
    subtasks: data.subtasks,
    key_context: data.keyContext,
    recommendation: data.recommendation,
    activity: data.activity
  };

  const metaString = JSON.stringify(metadata);
  return `${data.title.trim()}\n\n${data.details.trim()}\n\n--- METADATA ---\n${metaString}`;
}
