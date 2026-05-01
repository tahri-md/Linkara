export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

export interface JobLog {
  id: number;
  job_id: string;
  line_number: number | null;
  timestamp: Date;
  level: LogLevel;
  message: string;
  created_at: Date;
}

export interface LogLineInput {
  message: string;
  level?: LogLevel;
  lineNumber?: number | null;
  timestamp?: Date;
}