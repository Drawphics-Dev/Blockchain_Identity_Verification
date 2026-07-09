/** Minimal structured logger. Swap for pino/winston later without touching callers. */
type Level = 'info' | 'warn' | 'error' | 'debug'

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`
  const args = meta ? [line, meta] : [line]
  if (level === 'error') console.error(...args)
  else if (level === 'warn') console.warn(...args)
  else console.log(...args)
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
}
