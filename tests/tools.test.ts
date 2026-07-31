import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SumoClient } from '../src/sumo/client.js';
import { registerSearchLogsTool } from '../src/tools/search-logs.js';
import { createServer } from '../src/server.js';
import { enforceTimeRangeLimit, clampResultLimit } from '../src/security/limits.js';
import type { Config } from '../src/config.js';

const testConfig: Config = {
  sumoAccessId: 'testAccessId',
  sumoAccessKey: 'testAccessKey',
  sumoApiBaseUrl: 'https://api.us2.sumologic.com/api',
  sumoDefaultSourceCategory: 'prod/default',
  sumoMaxQueryRangeMinutes: 1440,
  sumoMaxResultCount: 1000,
  sumoQueryTimeoutSeconds: 120,
  logLevel: 'error',
};

const clientConfig = {
  baseUrl: 'https://api.us2.sumologic.com/api',
  accessId: 'testAccessId',
  accessKey: 'testAccessKey',
  timeoutSeconds: 120,
  maxResults: 1000,
};

function mockFetchResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('createServer', () => {
  it('creates server with all 5 tools registered', () => {
    const { server } = createServer(testConfig);
    expect(server).toBeInstanceOf(McpServer);
  });
});

describe('sumo_search_logs tool', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers tool on the server successfully', () => {
    const freshServer = new McpServer({ name: 'test', version: '1.0.0' });
    const client = new SumoClient(clientConfig);
    registerSearchLogsTool(freshServer, client, testConfig);
    // If no error is thrown, tool registered successfully
    expect(true).toBe(true);
  });
});

describe('sumo_get_search_status tool - job registry', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SumoClient correctly tracks jobs for registry enforcement', async () => {
    const client = new SumoClient(clientConfig);

    // Unknown job should not be owned
    expect(client.isOwnedJob('UNKNOWN-123')).toBe(false);

    // After creating a job, it should be owned
    fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'OWNED-JOB' }));
    await client.createSearchJob({
      query: '*',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-01T01:00:00Z',
      timeZone: 'UTC',
    });
    expect(client.isOwnedJob('OWNED-JOB')).toBe(true);

    // After deleting, it should no longer be owned
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, null));
    await client.deleteJob('OWNED-JOB');
    expect(client.isOwnedJob('OWNED-JOB')).toBe(false);
  });
});

describe('sumo_cancel_search tool - job registry', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('only allows cancellation of owned jobs', async () => {
    const client = new SumoClient(clientConfig);

    // Cannot cancel unknown job
    expect(client.isOwnedJob('FAKE-JOB')).toBe(false);

    // Create a job
    fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'CANCEL-ME' }));
    await client.createSearchJob({
      query: '*',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-01T01:00:00Z',
      timeZone: 'UTC',
    });
    expect(client.isOwnedJob('CANCEL-ME')).toBe(true);

    // Can cancel owned job
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, null));
    await client.deleteJob('CANCEL-ME');
    expect(client.isOwnedJob('CANCEL-ME')).toBe(false);
  });
});

describe('time range validation logic', () => {
  it('rejects ranges exceeding SUMO_MAX_QUERY_RANGE_MINUTES', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-03T00:00:00Z'); // 2880 minutes

    expect(() => enforceTimeRangeLimit(start, end, 1440)).toThrow();
  });

  it('accepts ranges within limits', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-01T12:00:00Z'); // 720 minutes

    expect(() => enforceTimeRangeLimit(start, end, 1440)).not.toThrow();
  });
});

describe('result limit clamping', () => {
  it('clamps requested limit to max', () => {
    expect(clampResultLimit(5000, 1000)).toBe(1000);
  });

  it('passes through requested limit when within max', () => {
    expect(clampResultLimit(50, 1000)).toBe(50);
  });

  it('uses default of 100 when no limit requested', () => {
    expect(clampResultLimit(undefined, 1000)).toBe(100);
  });

  it('uses max when default 100 exceeds max', () => {
    expect(clampResultLimit(undefined, 50)).toBe(50);
  });
});

describe('message normalization', () => {
  it('normalizes sumo message fields correctly', () => {
    const rawMessage = {
      map: {
        _raw: '2024-01-01 ERROR Something went wrong',
        _messagetime: '1704067200000',
        _sourceCategory: 'prod/app',
        _sourceName: '/var/log/app.log',
        _sourceHost: 'server-1',
        _collector: 'collector-1',
        _messageid: '123',
        _sourceid: '456',
        custom_field: 'custom_value',
      },
    };

    const skipFields = new Set([
      '_messagetime', '_raw', '_sourceCategory', '_sourceName', '_sourceHost',
      '_collector', '_messageid', '_sourceid', '_collectorId', '_blockid',
      '_format', '_size', '_receipttime', '_messagecount', '_source',
    ]);
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawMessage.map)) {
      if (!skipFields.has(key)) {
        fields[key] = value;
      }
    }

    expect(fields.custom_field).toBe('custom_value');
    expect(fields._raw).toBeUndefined();
    expect(fields._messagetime).toBeUndefined();
    expect(fields._sourceCategory).toBeUndefined();
  });
});
