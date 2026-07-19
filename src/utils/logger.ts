/**
 * SipWise Structured Telemetry & Observability Logger
 */
export interface LogPayload {
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  context?: Record<string, unknown>;
}

import { supabase } from './supabase';

class Logger {
  private log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>, stackTrace?: string) {
    const payload: LogPayload = {
      message,
      level,
      timestamp: new Date().toISOString(),
      ...(context && { context })
    };

    if (level === 'error') {
      console.error(JSON.stringify(payload));
      // Asynchronously log error stack trace to Supabase database APM table
      try {
        supabase.from('error_logs').insert({
          error_message: message,
          stack_trace: stackTrace || (context?.stack as string) || null,
          source: 'frontend',
          context: context || null
        }).then();
      } catch {
        // Ignore logging failures to prevent cascading errors
      }
    } else if (level === 'warn') {
      console.warn(JSON.stringify(payload));
    } else {
      console.log(JSON.stringify(payload));
    }
  }

  public info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>, stackTrace?: string) {
    this.log('error', message, context, stackTrace);
  }
}

export const logger = new Logger();
export default logger;
