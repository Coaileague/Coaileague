type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const isProduction = process.env.NODE_ENV === 'production';

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_, value) => {
      if (value instanceof Error) {
        return { message: value.message, stack: value.stack, name: value.name };
      }
      return value;
    });
  } catch {
    return String(obj);
  }
}

function formatLog(level: LogLevel, context: string, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const base: Record<string, unknown> = { timestamp, level: level.toUpperCase(), context, message };
  if (meta !== undefined && meta !== null) {
    if (meta instanceof Error) {
      base.error = { message: meta.message, stack: meta.stack, name: meta.name };
    } else if (typeof meta === 'object' && !Array.isArray(meta)) {
      try {
        const keys = Object.keys(meta as object);
        if (keys.length > 0) Object.assign(base, meta);
      } catch { base.meta = safeStringify(meta); }
    } else {
      base.meta = String(meta);
    }
  }
  if (isProduction) {
    return safeStringify(base);
  }
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
  const extras = Object.entries(base)
    .filter(([k]) => !['timestamp', 'level', 'context', 'message'].includes(k))
    .map(([, v]) => (typeof v === 'string' ? v : safeStringify(v)))
    .join(' ');
  return extras ? `${prefix} ${message} ${extras}` : `${prefix} ${message}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export interface Logger {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  child: (childContext: string) => Logger;
}

export function createLogger(context: string): Logger {
  return {
    debug: (message: string, meta?: unknown) => {
      if (shouldLog('debug')) console.log(formatLog('debug', context, message, meta));
    },
    info: (message: string, meta?: unknown) => {
      if (shouldLog('info')) console.log(formatLog('info', context, message, meta));
    },
    warn: (message: string, meta?: unknown) => {
      if (shouldLog('warn')) console.warn(formatLog('warn', context, message, meta));
    },
    error: (message: string, meta?: unknown) => {
      if (shouldLog('error')) console.error(formatLog('error', context, message, meta));
    },
    child: (childContext: string) => createLogger(`${context}:${childContext}`),
  };
}

export const logger = createLogger('app');
