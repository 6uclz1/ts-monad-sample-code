import pino, { Logger, LoggerOptions } from "pino";

export type AppLogger = Logger;

const loggerOptions = (level: string): LoggerOptions => ({
  level,
  messageKey: "message",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime
});

export const createLogger = (level: string): AppLogger => pino(loggerOptions(level));

export const childLogger = (logger: AppLogger, bindings: Record<string, unknown>): AppLogger =>
  logger.child(bindings);
