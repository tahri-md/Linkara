import { query } from '../db/connection.js';
import type { JobLog, LogLevel, LogLineInput } from '../models/JobLog.js';

export interface StreamLogsOptions {
  startingLineNumber?: number;
  onLogEntry?: (entry: JobLog) => void | Promise<void>;
}

type LogSource = 'stdout' | 'stderr';

interface PendingLogState {
  nextLineNumber: number;
  stdoutBuffer: string;
  stderrBuffer: string;
}

export class LogStreamService {
  private pendingLogs = new Map<string, PendingLogState>();
  private writeChains = new Map<string, Promise<void>>();

  private detectLogLevel(message: string): LogLevel {
    const upperMessage = message.toUpperCase();

    if (upperMessage.includes('ERROR') || upperMessage.includes('FATAL')) {
      return 'error';
    }

    if (upperMessage.includes('WARN')) {
      return 'warning';
    }

    if (upperMessage.includes('DEBUG')) {
      return 'debug';
    }

    return 'info';
  }

  private getState(jobId: string, startingLineNumber: number = 0): PendingLogState {
    const existingState = this.pendingLogs.get(jobId);

    if (existingState) {
      return existingState;
    }

    const newState: PendingLogState = {
      nextLineNumber: startingLineNumber,
      stdoutBuffer: '',
      stderrBuffer: '',
    };

    this.pendingLogs.set(jobId, newState);
    return newState;
  }

  private getBuffer(state: PendingLogState, source: LogSource): string {
    return source === 'stderr' ? state.stderrBuffer : state.stdoutBuffer;
  }

  private setBuffer(state: PendingLogState, source: LogSource, buffer: string): void {
    if (source === 'stderr') {
      state.stderrBuffer = buffer;
      return;
    }

    state.stdoutBuffer = buffer;
  }

  private normalizeChunk(chunk: string): string {
    return chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  private async insertLog(
    jobId: string,
    message: string,
    lineNumber: number,
    level?: LogLevel
  ): Promise<JobLog> {
    const timestamp = new Date();

    const result = await query(
      `INSERT INTO job_logs (job_id, line_number, level, message, timestamp, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, job_id, line_number, timestamp, level, message, created_at`,
      [jobId, lineNumber, level ?? this.detectLogLevel(message), message, timestamp]
    );

    return result.rows[0] as JobLog;
  }

  private async enqueueWrite<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
    const previousWrite = this.writeChains.get(jobId) ?? Promise.resolve();
    const currentWrite = previousWrite.then(operation, operation);

    this.writeChains.set(jobId, currentWrite.then(() => undefined, () => undefined));

    return currentWrite;
  }

  async appendLog(jobId: string, line: LogLineInput): Promise<JobLog> {
    return this.enqueueWrite(jobId, async () => {
      return this.insertLog(jobId, line.message, line.lineNumber ?? 0, line.level);
    });
  }

  async appendChunk(
    jobId: string,
    chunk: string,
    source: LogSource = 'stdout',
    options: StreamLogsOptions = {}
  ): Promise<JobLog[]> {
    return this.enqueueWrite(jobId, async () => {
      const state = this.getState(jobId, options.startingLineNumber);
      const normalizedChunk = this.normalizeChunk(chunk);
      const currentBuffer = this.getBuffer(state, source) + normalizedChunk;
      const storedLogs: JobLog[] = [];
      const lines = currentBuffer.split('\n');
      const remainder = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim().length === 0) {
          continue;
        }

        const logEntry = await this.insertLog(
          jobId,
          line,
          state.nextLineNumber,
          source === 'stderr' ? 'error' : undefined
        );

        state.nextLineNumber += 1;
        storedLogs.push(logEntry);

        if (options.onLogEntry) {
          await options.onLogEntry(logEntry);
        }
      }

      this.setBuffer(state, source, remainder);

      return storedLogs;
    });
  }

  async flush(jobId: string, options: StreamLogsOptions = {}): Promise<JobLog[]> {
    return this.enqueueWrite(jobId, async () => {
      const state = this.pendingLogs.get(jobId);

      if (!state) {
        return [];
      }

      const remainingLogs: JobLog[] = [];
      const sources: LogSource[] = ['stdout', 'stderr'];

      for (const source of sources) {
        const buffer = this.getBuffer(state, source).trim();

        if (buffer.length === 0) {
          continue;
        }

        const logEntry = await this.insertLog(
          jobId,
          buffer,
          state.nextLineNumber,
          source === 'stderr' ? 'error' : undefined
        );

        state.nextLineNumber += 1;
        remainingLogs.push(logEntry);
        this.setBuffer(state, source, '');

        if (options.onLogEntry) {
          await options.onLogEntry(logEntry);
        }
      }

      return remainingLogs;
    });
  }

  clear(jobId: string): void {
    this.pendingLogs.delete(jobId);
    this.writeChains.delete(jobId);
  }

  async getJobLogs(jobId: string): Promise<JobLog[]> {
    const result = await query(
      `SELECT id, job_id, line_number, timestamp, level, message, created_at
       FROM job_logs
       WHERE job_id = $1
       ORDER BY line_number ASC NULLS LAST, created_at ASC, id ASC`,
      [jobId]
    );

    return result.rows as JobLog[];
  }

  async getJobLogText(jobId: string): Promise<string> {
    const logs = await this.getJobLogs(jobId);
    return logs.map((log) => log.message).join('\n');
  }
}

export const logStreamService = new LogStreamService();