export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  [key: string]: unknown;
}

function shouldLogDebug(): boolean {
  return (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' || process.env.NODE_ENV === 'development';
}

function serializeError(err: unknown): LogMeta {
  if (!(err instanceof Error)) return { error: err };
  return {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  };
}

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify(payload));
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export const logger = {
  debug(message: string, meta?: LogMeta) {
    if (!shouldLogDebug()) return;
    emit('debug', message, meta);
  },
  info(message: string, meta?: LogMeta) {
    emit('info', message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    emit('warn', message, meta);
  },
  error(message: string, meta?: LogMeta) {
    emit('error', message, meta);
  },
  errorWithCause(message: string, err: unknown, meta?: LogMeta) {
    emit('error', message, { ...meta, ...serializeError(err) });
  },
};

