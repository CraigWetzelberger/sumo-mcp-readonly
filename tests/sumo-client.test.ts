import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SumoClient } from '../src/sumo/client.js';
import { executeSearch } from '../src/sumo/search-jobs.js';
import { createBasicAuthHeader } from '../src/sumo/auth.js';
import {
  SumoAuthError,
  SumoAuthorizationError,
  SumoRateLimitError,
  SumoQuerySyntaxError,
  SumoServiceError,
  SumoTimeoutError,
  SumoJobNotFoundError,
} from '../src/sumo/errors.js';

const clientConfig = {
  baseUrl: 'https://api.us2.sumologic.com/api',
  accessId: 'suTestId123',
  accessKey: 'testSecretKey456',
  timeoutSeconds: 120,
  maxResults: 1000,
};

function mockFetchResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('createBasicAuthHeader', () => {
  it('creates correct base64-encoded Basic auth header', () => {
    const header = createBasicAuthHeader('myId', 'myKey');
    expect(header).toBe(`Basic ${Buffer.from('myId:myKey').toString('base64')}`);
  });
});

describe('SumoClient', () => {
  let client: SumoClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new SumoClient(clientConfig);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSearchJob', () => {
    it('creates a job and returns the ID', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          202,
          { id: 'JOB-123', link: { rel: 'self', href: '...' } },
          { 'set-cookie': 'AWSALB=abc123; Path=/' },
        ),
      );

      const jobId = await client.createSearchJob({
        query: '* | count',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-01T01:00:00Z',
        timeZone: 'UTC',
      });

      expect(jobId).toBe('JOB-123');
      expect(client.isOwnedJob('JOB-123')).toBe(true);
    });

    it('sends correct auth header', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-1' }));

      await client.createSearchJob({
        query: '*',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-01T01:00:00Z',
        timeZone: 'UTC',
      });

      const calledWith = fetchMock.mock.calls[0]!;
      expect(calledWith[1].headers['Authorization']).toBe(
        createBasicAuthHeader(clientConfig.accessId, clientConfig.accessKey),
      );
    });

    it('registers job in the job registry', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-REG' }));

      await client.createSearchJob({
        query: 'error',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-01T01:00:00Z',
        timeZone: 'UTC',
      });

      expect(client.isOwnedJob('JOB-REG')).toBe(true);
      expect(client.getOwnedJobs()).toContain('JOB-REG');
    });
  });

  describe('getJobStatus', () => {
    it('returns job status', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-S' }));
      await client.createSearchJob({
        query: '*',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-01T01:00:00Z',
        timeZone: 'UTC',
      });

      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(200, {
          state: 'DONE GATHERING RESULTS',
          messageCount: 42,
          recordCount: 5,
          pendingErrors: [],
          pendingWarnings: [],
          histogramBuckets: [],
        }),
      );

      const status = await client.getJobStatus('JOB-S');
      expect(status.state).toBe('DONE GATHERING RESULTS');
      expect(status.messageCount).toBe(42);
      expect(status.recordCount).toBe(5);
    });
  });

  describe('getMessages', () => {
    it('returns messages with proper pagination params', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(200, {
          fields: [{ name: '_raw', fieldType: 'string', keyField: false }],
          messages: [{ map: { _raw: 'test message', _messagetime: '1234567890' } }],
        }),
      );

      const result = await client.getMessages('JOB-M', 0, 10);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.map._raw).toBe('test message');

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain('offset=0');
      expect(url).toContain('limit=10');
    });
  });

  describe('getRecords', () => {
    it('returns records', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(200, {
          fields: [{ name: '_count', fieldType: 'int', keyField: false }],
          records: [{ map: { _count: '100' } }],
        }),
      );

      const result = await client.getRecords('JOB-R', 0, 10);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.map._count).toBe('100');
    });
  });

  describe('deleteJob', () => {
    it('removes job from registry after deletion', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-DEL' }));
      await client.createSearchJob({
        query: '*',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-01T01:00:00Z',
        timeZone: 'UTC',
      });
      expect(client.isOwnedJob('JOB-DEL')).toBe(true);

      fetchMock.mockResolvedValueOnce(mockFetchResponse(200, null));
      await client.deleteJob('JOB-DEL');
      expect(client.isOwnedJob('JOB-DEL')).toBe(false);
    });
  });

  describe('cookie forwarding', () => {
    it('sends cookie from create on subsequent requests', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(
          202,
          { id: 'JOB-COOKIE' },
          { 'set-cookie': 'AWSALB=sessiondata; Path=/' },
        ),
      );
      await client.createSearchJob({
        query: '*',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-01T01:00:00Z',
        timeZone: 'UTC',
      });

      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(200, {
          state: 'DONE GATHERING RESULTS',
          messageCount: 0,
          recordCount: 0,
          pendingErrors: [],
          pendingWarnings: [],
          histogramBuckets: [],
        }),
      );
      await client.getJobStatus('JOB-COOKIE');

      const statusCall = fetchMock.mock.calls[1]!;
      expect(statusCall[1].headers['Cookie']).toBe('AWSALB=sessiondata; Path=/');
    });
  });

  describe('error mapping', () => {
    it('maps 401 to SumoAuthError', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(401, { error: 'unauthorized' }));
      await expect(
        client.createSearchJob({
          query: '*',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T01:00:00Z',
          timeZone: 'UTC',
        }),
      ).rejects.toThrow(SumoAuthError);
    });

    it('maps 403 to SumoAuthorizationError', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(403, { error: 'forbidden' }));
      await expect(
        client.createSearchJob({
          query: '*',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T01:00:00Z',
          timeZone: 'UTC',
        }),
      ).rejects.toThrow(SumoAuthorizationError);
    });

    it('maps 429 to SumoRateLimitError', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(429, { error: 'rate.limit.exceeded' }));
      await expect(
        client.createSearchJob({
          query: '*',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T01:00:00Z',
          timeZone: 'UTC',
        }),
      ).rejects.toThrow(SumoRateLimitError);
    });

    it('maps 400 with parse.error to SumoQuerySyntaxError', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(400, { code: 'parse.error', message: 'Unable to parse query' }),
      );
      await expect(
        client.createSearchJob({
          query: 'bad ||| query',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T01:00:00Z',
          timeZone: 'UTC',
        }),
      ).rejects.toThrow(SumoQuerySyntaxError);
    });

    it('maps 500 to SumoServiceError', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(500, { error: 'internal.error' }));
      await expect(
        client.createSearchJob({
          query: '*',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T01:00:00Z',
          timeZone: 'UTC',
        }),
      ).rejects.toThrow(SumoServiceError);
    });

    it('maps 404 to SumoJobNotFoundError', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(404, { code: 'jobid.invalid' }));
      await expect(client.getJobStatus('NONEXISTENT')).rejects.toThrow(SumoJobNotFoundError);
    });

    it('does not include credentials in error messages', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(500, {
          error: `Error for ${clientConfig.accessId} with key ${clientConfig.accessKey}`,
        }),
      );
      try {
        await client.createSearchJob({
          query: '*',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T01:00:00Z',
          timeZone: 'UTC',
        });
      } catch (e) {
        expect((e as Error).message).not.toContain(clientConfig.accessId);
        expect((e as Error).message).not.toContain(clientConfig.accessKey);
      }
    });
  });

  describe('isOwnedJob', () => {
    it('returns false for unknown job IDs', () => {
      expect(client.isOwnedJob('UNKNOWN-JOB')).toBe(false);
    });
  });
});

describe('executeSearch', () => {
  let client: SumoClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new SumoClient(clientConfig);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes full search lifecycle: create → poll → get results', async () => {
    // Create job
    fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-FULL' }));
    // First poll - still gathering
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        state: 'GATHERING RESULTS',
        messageCount: 5,
        recordCount: 0,
        pendingErrors: [],
        pendingWarnings: [],
        histogramBuckets: [],
      }),
    );
    // Second poll - done
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        state: 'DONE GATHERING RESULTS',
        messageCount: 10,
        recordCount: 1,
        pendingErrors: [],
        pendingWarnings: [],
        histogramBuckets: [],
      }),
    );
    // Get messages
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        fields: [{ name: '_raw', fieldType: 'string', keyField: false }],
        messages: Array.from({ length: 10 }, (_, i) => ({
          map: { _raw: `message ${i}`, _messagetime: `${1700000000000 + i * 1000}` },
        })),
      }),
    );
    // Get records
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        fields: [{ name: '_count', fieldType: 'int', keyField: false }],
        records: [{ map: { _count: '10' } }],
      }),
    );

    const result = await executeSearch(
      client,
      { query: '*', from: '2024-01-01T00:00:00Z', to: '2024-01-01T01:00:00Z', timeZone: 'UTC' },
      { maxResults: 100, timeoutMs: 30000, pollIntervalMs: 10 },
    );

    expect(result.jobId).toBe('JOB-FULL');
    expect(result.status).toBe('DONE GATHERING RESULTS');
    expect(result.messages).toHaveLength(10);
    expect(result.records).toHaveLength(1);
    expect(result.messageCount).toBe(10);
    expect(result.recordCount).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('marks results as truncated when limit is lower than total', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-TRUNC' }));
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        state: 'DONE GATHERING RESULTS',
        messageCount: 500,
        recordCount: 0,
        pendingErrors: [],
        pendingWarnings: [],
        histogramBuckets: [],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        fields: [],
        messages: Array.from({ length: 10 }, () => ({ map: { _raw: 'x' } })),
      }),
    );

    const result = await executeSearch(
      client,
      { query: '*', from: '2024-01-01T00:00:00Z', to: '2024-01-01T01:00:00Z', timeZone: 'UTC' },
      { maxResults: 10, timeoutMs: 30000, pollIntervalMs: 10 },
    );

    expect(result.truncated).toBe(true);
    expect(result.messageCount).toBe(500);
    expect(result.messages).toHaveLength(10);
  });

  it('throws SumoTimeoutError when polling exceeds timeout', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-TIMEOUT' }));
    // Always return gathering state
    fetchMock.mockResolvedValue(
      mockFetchResponse(200, {
        state: 'GATHERING RESULTS',
        messageCount: 0,
        recordCount: 0,
        pendingErrors: [],
        pendingWarnings: [],
        histogramBuckets: [],
      }),
    );

    await expect(
      executeSearch(
        client,
        { query: '*', from: '2024-01-01T00:00:00Z', to: '2024-01-01T01:00:00Z', timeZone: 'UTC' },
        { maxResults: 100, timeoutMs: 50, pollIntervalMs: 10 },
      ),
    ).rejects.toThrow(SumoTimeoutError);
  });

  it('collects warnings from status polling', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(202, { id: 'JOB-WARN' }));
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        state: 'DONE GATHERING RESULTS',
        messageCount: 0,
        recordCount: 0,
        pendingErrors: [],
        pendingWarnings: ['Results may be incomplete'],
        histogramBuckets: [],
      }),
    );

    const result = await executeSearch(
      client,
      { query: '*', from: '2024-01-01T00:00:00Z', to: '2024-01-01T01:00:00Z', timeZone: 'UTC' },
      { maxResults: 100, timeoutMs: 30000, pollIntervalMs: 10 },
    );

    expect(result.warnings).toContain('Results may be incomplete');
  });
});
