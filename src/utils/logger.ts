/**
 * SipWise Structured Telemetry & Observability Logger
 */
export interface LogPayload {
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  context?: Record<string, unknown>;
}

class Logger {
  private log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
    const payload: LogPayload = {
      message,
      level,
      timestamp: new Date().toISOString(),
      ...(context && { context })
    };

    if (level === 'error') {
      console.error(JSON.stringify(payload));
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

  public error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();
export default logger;
