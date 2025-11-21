/**
 * Logger Interface
 */

export interface ILogger {
  error(message: string, traceOrMetadata?: string | Record<string, any>, context?: string): Promise<void>;
  warn(message: string, contextOrMetadata?: string | Record<string, any>): Promise<void>;
  log(message: string, contextOrMetadata?: string | Record<string, any>): Promise<void>;
  info(message: string, metadata?: Record<string, any>): Promise<void>;
  debug(message: string, metadata?: Record<string, any>): Promise<void>;
  verbose(message: string, context?: string): Promise<void>;
}

