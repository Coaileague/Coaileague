type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  verbose: -1,
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

function formatLog(level: LogLevel, context: string, message: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const base: Record<string, unknown> = { timestamp, level: level.toUpperCase(), context, message };
  // Support both single-meta and variadic styles:
  // log.info('msg', { key: val })  -- single object meta
  // log.info('msg', val1, val2)    -- variadic console.log style
  if (args.length === 1) {
    const meta = args[0];
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
  } else if (args.length > 1) {
    base.meta = args.map(a => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
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
  verbose: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  child: (childContext: string) => Logger;
}

export function createLogger(context: string): Logger {
  return {
    verbose: (message: string, ...args: unknown[]) => {
      if (shouldLog('verbose')) console.log(formatLog('verbose', context, message, ...args));
    },
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) console.log(formatLog('debug', context, message, ...args));
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) console.log(formatLog('info', context, message, ...args));
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(formatLog('warn', context, message, ...args));
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) console.error(formatLog('error', context, message, ...args));
    },
    child: (childContext: string) => createLogger(`${context}:${childContext}`),
  };
}

export const logger = createLogger('app');
