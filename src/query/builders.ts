import { escapeQueryLiteral, escapeSourceCategory } from './escaping.js';

export interface ErrorQueryOptions {
  sourceCategory?: string;
  service?: string;
  text?: string;
}

export interface CorrelationIdQueryOptions {
  correlationId: string;
  sourceCategory?: string;
}

/**
 * Builds a Sumo Logic query to find common error patterns.
 *
 * Searches for: ERROR, exception, failure, fatal, stacktrace, "stack trace"
 * Optionally filtered by source category, service name, and free-text.
 */
export function buildErrorQuery(options: ErrorQueryOptions): string {
  const parts: string[] = [];

  if (options.sourceCategory) {
    parts.push(`_sourceCategory=${escapeSourceCategory(options.sourceCategory)}`);
  }

  // Error pattern matching
  const errorPatterns = [
    '"ERROR"',
    '"Exception"',
    '"exception"',
    '"FATAL"',
    '"fatal"',
    '"failure"',
    '"Failure"',
    '"stacktrace"',
    '"stack trace"',
  ];
  parts.push(`(${errorPatterns.join(' OR ')})`);

  if (options.service) {
    parts.push(escapeQueryLiteral(options.service));
  }

  if (options.text) {
    parts.push(escapeQueryLiteral(options.text));
  }

  return parts.join(' ');
}

/**
 * Builds a Sumo Logic query to search for a correlation/trace/request ID.
 *
 * Searches the raw log message for the literal ID value. The ID is safely
 * escaped to prevent query injection.
 *
 * Optionally scoped to a source category.
 */
export function buildCorrelationIdQuery(options: CorrelationIdQueryOptions): string {
  const parts: string[] = [];

  if (options.sourceCategory) {
    parts.push(`_sourceCategory=${escapeSourceCategory(options.sourceCategory)}`);
  }

  // Search for the literal correlation ID in the raw message
  parts.push(escapeQueryLiteral(options.correlationId));

  return parts.join(' ');
}
