export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (meta) {
    entry.meta = meta;
  }
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};

export function auditLog(entry: {
  tool: string;
  query?: string;
  timeRange?: { start: string; end: string };
  resultCount?: number;
  elapsedMs: number;
  outcome: 'success' | 'error';
  error?: string;
}): void {
  const sanitizedQuery = entry.query ? entry.query.slice(0, 200) : undefined;
  const auditEntry = {
    timestamp: new Date().toISOString(),
    type: 'audit',
    tool: entry.tool,
    query: sanitizedQuery,
    timeRange: entry.timeRange,
    resultCount: entry.resultCount,
    elapsedMs: entry.elapsedMs,
    outcome: entry.outcome,
    error: entry.error,
  };
  process.stderr.write(JSON.stringify(auditEntry) + '\n');
}
