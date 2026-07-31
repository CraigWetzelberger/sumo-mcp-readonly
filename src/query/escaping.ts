/**
 * Escapes a user-provided string for safe use as a literal value in a Sumo Logic query.
 *
 * Sumo Logic uses double-quoted strings for literal matching. Within quotes:
 * - Backslashes must be escaped as \\
 * - Double quotes must be escaped as \"
 * - Newlines and carriage returns are escaped
 *
 * The result is wrapped in double quotes.
 */
export function escapeQueryLiteral(value: string): string {
  if (value === '') return '""';

  const escaped = value
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r'); // Escape carriage returns

  return `"${escaped}"`;
}

/**
 * Escapes a value for use in a _sourceCategory filter.
 * Source categories can contain slashes and other special characters.
 * If the value contains spaces or special characters, wrap it in quotes.
 */
export function escapeSourceCategory(value: string): string {
  // If value contains spaces, quotes, or parens, wrap in quotes
  if (/[\s"()[\]{}|!*]/.test(value)) {
    return escapeQueryLiteral(value);
  }
  return value;
}
