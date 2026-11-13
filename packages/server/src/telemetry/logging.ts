/**
 * Structured Logging Module
 * Provides JSON-formatted structured logging with redaction support
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
  service?: string;
  version?: string;
}

interface ChildLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void;
  audit(message: string, context: Record<string, unknown>): void;
}

// Configuration
const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const LOG_FORMAT = process.env.LOG_FORMAT ?? 'json';
const REDACT_FIELDS = (
  process.env.LOG_REDACT_FIELDS ??
  'apiKey,password,token,secret,authorization,bearer'
)
  .split(',')
  .map((s) => s.trim());

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'context-router';
const SERVICE_VERSION = '0.5.0';

// Log level hierarchy
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

/**
 * Redact sensitive fields from an object
 */
function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...obj };
  for (const field of REDACT_FIELDS) {
    // Check for field with various casing patterns
    const keysToCheck = Object.keys(redacted);
    for (const key of keysToCheck) {
      if (key.toLowerCase() === field.toLowerCase()) {
        redacted[key] = '[REDACTED]';
      }
    }
  }
  return redacted;
}

/**
 * Format a log entry as JSON or text
 */
function formatLog(entry: LogEntry): string {
  const redacted = entry.context ? redact(entry.context) : undefined;

  if (LOG_FORMAT === 'json') {
    const logObj: Record<string, unknown> = {
      timestamp: entry.timestamp,
      level: entry.level.toUpperCase(),
      message: entry.message,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
    };

    if (redacted && Object.keys(redacted).length > 0) {
      logObj.context = redacted;
    }

    if (entry.error) {
      logObj.error = {
        message: entry.error.message,
        name: entry.error.name,
        stack: entry.error.stack,
      };
    }

    return JSON.stringify(logObj);
  }

  // Text format
  const parts = [
    `[${entry.timestamp}]`,
    entry.level.toUpperCase(),
    `[${SERVICE_NAME}]`,
    entry.message,
  ];

  if (redacted && Object.keys(redacted).length > 0) {
    parts.push(JSON.stringify(redacted));
  }

  if (entry.error) {
    parts.push(`Error: ${entry.error.message}`);
    if (entry.error.stack) {
      parts.push(entry.error.stack);
    }
  }

  return parts.join(' ');
}

/**
 * Create a log entry and output it
 */
function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error,
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  if (error) {
    entry.error = {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  const formatted = formatLog(entry);

  // MCP stdio uses stdout exclusively for JSON-RPC. All logs must go to stderr.
  console.error(formatted);
}

/**
 * Main logger instance
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    log('debug', message, context);
  },

  info(message: string, context?: Record<string, unknown>): void {
    log('info', message, context);
  },

  warn(message: string, context?: Record<string, unknown>): void {
    log('warn', message, context);
  },

  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    log('error', message, context, error);
  },

  /**
   * Audit logging for compliance and security events
   */
  audit(message: string, context: Record<string, unknown>): void {
    if (!shouldLog('info')) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[AUDIT] ${message}`,
      context: {
        ...context,
        audit: true,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
      },
    };

    const formatted = formatLog(entry);
    // MCP stdio uses stdout exclusively for JSON-RPC. All logs must go to stderr.
    console.error(formatted);
  },
};

/**
 * Create a child logger with default context
 */
export function createChildLogger(
  defaultContext: Record<string, unknown>,
): ChildLogger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      logger.debug(message, { ...defaultContext, ...context });
    },

    info(message: string, context?: Record<string, unknown>): void {
      logger.info(message, { ...defaultContext, ...context });
    },

    warn(message: string, context?: Record<string, unknown>): void {
      logger.warn(message, { ...defaultContext, ...context });
    },

    error(
      message: string,
      error?: Error,
      context?: Record<string, unknown>,
    ): void {
      logger.error(message, error, { ...defaultContext, ...context });
    },

    audit(message: string, context: Record<string, unknown>): void {
      logger.audit(message, { ...defaultContext, ...context });
    },
  };
}

/**
 * Create a workspace-scoped logger
 */
export function createWorkspaceLogger(workspaceId: string): ChildLogger {
  return createChildLogger({ workspaceId });
}

/**
 * Create a workflow-scoped logger
 */
export function createWorkflowLogger(
  workspaceId: string,
  workflowId: string,
): ChildLogger {
  return createChildLogger({ workspaceId, workflowId });
}
