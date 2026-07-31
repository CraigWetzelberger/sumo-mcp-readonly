import { describe, it, expect } from 'vitest';
import { escapeQueryLiteral, escapeSourceCategory } from '../src/query/escaping.js';

describe('escapeQueryLiteral', () => {
  it('wraps simple string in double quotes', () => {
    expect(escapeQueryLiteral('hello')).toBe('"hello"');
  });

  it('escapes double quotes', () => {
    expect(escapeQueryLiteral('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('escapes backslashes', () => {
    expect(escapeQueryLiteral('path\\to\\file')).toBe('"path\\\\to\\\\file"');
  });

  it('escapes both backslashes and quotes', () => {
    expect(escapeQueryLiteral('a\\"b')).toBe('"a\\\\\\"b"');
  });

  it('handles empty string', () => {
    expect(escapeQueryLiteral('')).toBe('""');
  });

  it('escapes newlines', () => {
    expect(escapeQueryLiteral('line1\nline2')).toBe('"line1\\nline2"');
  });

  it('escapes carriage returns', () => {
    expect(escapeQueryLiteral('line1\rline2')).toBe('"line1\\rline2"');
  });

  it('handles Sumo-special characters without additional escaping', () => {
    // Operators like | and * inside quotes are treated as literals
    expect(escapeQueryLiteral('* | count')).toBe('"* | count"');
  });

  it('handles UUID-style correlation IDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(escapeQueryLiteral(uuid)).toBe(`"${uuid}"`);
  });

  it('handles strings with parentheses and brackets', () => {
    expect(escapeQueryLiteral('(test)[0]')).toBe('"(test)[0]"');
  });
});

describe('escapeSourceCategory', () => {
  it('returns simple source category as-is', () => {
    expect(escapeSourceCategory('prod/app/service')).toBe('prod/app/service');
  });

  it('wraps source category with spaces in quotes', () => {
    expect(escapeSourceCategory('prod app')).toBe('"prod app"');
  });

  it('wraps source category with special chars in quotes', () => {
    expect(escapeSourceCategory('prod*')).toBe('"prod*"');
  });

  it('handles normal slash-separated categories', () => {
    expect(escapeSourceCategory('aws/lambda/my-function')).toBe('aws/lambda/my-function');
  });
});
