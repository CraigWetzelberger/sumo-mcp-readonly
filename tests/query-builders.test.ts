import { describe, it, expect } from 'vitest';
import { buildErrorQuery, buildCorrelationIdQuery } from '../src/query/builders.js';

describe('buildErrorQuery', () => {
  it('builds query with source category', () => {
    const query = buildErrorQuery({ sourceCategory: 'prod/app' });
    expect(query).toContain('_sourceCategory=prod/app');
    expect(query).toContain('"ERROR"');
    expect(query).toContain('"Exception"');
    expect(query).toContain('OR');
  });

  it('builds query without source category', () => {
    const query = buildErrorQuery({});
    expect(query).not.toContain('_sourceCategory');
    expect(query).toContain('"ERROR"');
  });

  it('includes service filter when provided', () => {
    const query = buildErrorQuery({ sourceCategory: 'prod/app', service: 'user-service' });
    expect(query).toContain('"user-service"');
  });

  it('includes text filter when provided', () => {
    const query = buildErrorQuery({ sourceCategory: 'prod/app', text: 'NullPointerException' });
    expect(query).toContain('"NullPointerException"');
  });

  it('escapes special characters in service name', () => {
    const query = buildErrorQuery({ service: 'my "service"' });
    expect(query).toContain('"my \\"service\\""');
  });

  it('escapes special characters in text filter', () => {
    const query = buildErrorQuery({ text: 'error with "quotes"' });
    expect(query).toContain('"error with \\"quotes\\""');
  });

  it('includes all error patterns', () => {
    const query = buildErrorQuery({});
    expect(query).toContain('"ERROR"');
    expect(query).toContain('"Exception"');
    expect(query).toContain('"exception"');
    expect(query).toContain('"FATAL"');
    expect(query).toContain('"fatal"');
    expect(query).toContain('"failure"');
    expect(query).toContain('"stacktrace"');
    expect(query).toContain('"stack trace"');
  });
});

describe('buildCorrelationIdQuery', () => {
  it('builds query with simple correlation ID', () => {
    const query = buildCorrelationIdQuery({
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(query).toBe('"550e8400-e29b-41d4-a716-446655440000"');
  });

  it('includes source category when provided', () => {
    const query = buildCorrelationIdQuery({
      correlationId: 'abc-123',
      sourceCategory: 'prod/api',
    });
    expect(query).toContain('_sourceCategory=prod/api');
    expect(query).toContain('"abc-123"');
  });

  it('escapes special characters in correlation ID', () => {
    const query = buildCorrelationIdQuery({
      correlationId: 'id"with"quotes',
    });
    expect(query).toBe('"id\\"with\\"quotes"');
  });

  it('escapes backslashes in correlation ID', () => {
    const query = buildCorrelationIdQuery({
      correlationId: 'path\\value',
    });
    expect(query).toBe('"path\\\\value"');
  });

  it('does not leave user input unescaped', () => {
    // Simulate injection attempt
    const query = buildCorrelationIdQuery({
      correlationId: '" OR _sourceCategory=*',
    });
    // The quote should be escaped, not terminating the literal
    expect(query).toContain('\\"');
    expect(query).not.toMatch(/^"" OR/);
  });
});
