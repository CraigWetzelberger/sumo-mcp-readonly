import { createBasicAuthHeader } from './auth.js';
import {
  SumoAuthError,
  SumoAuthorizationError,
  SumoRateLimitError,
  SumoQuerySyntaxError,
  SumoServiceError,
  SumoJobNotFoundError,
} from './errors.js';
import type {
  SumoSearchJobRequest,
  SumoSearchJobResponse,
  SumoJobStatus,
  SumoMessagesResponse,
  SumoRecordsResponse,
  JobRegistryEntry,
} from './types.js';
import { redactSecrets } from '../security/redaction.js';
import { logger } from '../logging.js';

export interface SumoClientConfig {
  baseUrl: string;
  accessId: string;
  accessKey: string;
  timeoutSeconds: number;
  maxResults: number;
}

export class SumoClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;
  private readonly config: SumoClientConfig;
  private readonly jobRegistry: Map<string, JobRegistryEntry> = new Map();
  private readonly jobCookies: Map<string, string> = new Map();

  constructor(config: SumoClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.authHeader = createBasicAuthHeader(config.accessId, config.accessKey);
  }

  async createSearchJob(request: SumoSearchJobRequest): Promise<string> {
    const response = await this.request<SumoSearchJobResponse>(
      'POST',
      '/v1/search/jobs',
      request,
    );

    const jobId = response.body.id;

    // Store cookies for this job session
    if (response.cookies) {
      this.jobCookies.set(jobId, response.cookies);
    }

    // Register in our job tracker
    this.jobRegistry.set(jobId, {
      createdAt: new Date(),
      query: request.query,
      from: request.from,
      to: request.to,
    });

    logger.debug('Search job created', { jobId });
    return jobId;
  }

  async getJobStatus(jobId: string): Promise<SumoJobStatus> {
    const response = await this.request<SumoJobStatus>(
      'GET',
      `/v1/search/jobs/${encodeURIComponent(jobId)}`,
      undefined,
      jobId,
    );
    return response.body;
  }

  async getMessages(
    jobId: string,
    offset: number,
    limit: number,
  ): Promise<SumoMessagesResponse> {
    const response = await this.request<SumoMessagesResponse>(
      'GET',
      `/v1/search/jobs/${encodeURIComponent(jobId)}/messages?offset=${offset}&limit=${limit}`,
      undefined,
      jobId,
    );
    return response.body;
  }

  async getRecords(
    jobId: string,
    offset: number,
    limit: number,
  ): Promise<SumoRecordsResponse> {
    const response = await this.request<SumoRecordsResponse>(
      'GET',
      `/v1/search/jobs/${encodeURIComponent(jobId)}/records?offset=${offset}&limit=${limit}`,
      undefined,
      jobId,
    );
    return response.body;
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/search/jobs/${encodeURIComponent(jobId)}`,
      undefined,
      jobId,
    );
    this.jobRegistry.delete(jobId);
    this.jobCookies.delete(jobId);
    logger.debug('Search job deleted', { jobId });
  }

  isOwnedJob(jobId: string): boolean {
    return this.jobRegistry.has(jobId);
  }

  getOwnedJobs(): string[] {
    return Array.from(this.jobRegistry.keys());
  }

  getJobRegistryEntry(jobId: string): JobRegistryEntry | undefined {
    return this.jobRegistry.get(jobId);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    jobId?: string,
  ): Promise<{ body: T; cookies?: string }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    // Send cookies for job-specific requests
    if (jobId && this.jobCookies.has(jobId)) {
      headers['Cookie'] = this.jobCookies.get(jobId)!;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new SumoServiceError(
        `Network error connecting to Sumo Logic: ${this.sanitize(message)}`,
        0,
      );
    }

    // Extract and store cookies
    const setCookie = response.headers.get('set-cookie');
    const cookies = setCookie ?? undefined;
    if (jobId && cookies) {
      this.jobCookies.set(jobId, cookies);
    }

    // Handle error responses
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    // For DELETE responses which may have no body
    if (response.status === 204 || method === 'DELETE') {
      return { body: undefined as unknown as T, cookies };
    }

    const responseBody = (await response.json()) as T;
    return { body: responseBody, cookies };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '';
    }

    const sanitizedBody = this.sanitize(errorBody);

    switch (response.status) {
      case 301:
        throw new SumoServiceError(
          `Received 301 redirect. The SUMO_API_BASE_URL may be incorrect for your deployment region. ${sanitizedBody}`,
          301,
        );
      case 401:
        throw new SumoAuthError();
      case 403:
        throw new SumoAuthorizationError();
      case 404:
        throw new SumoJobNotFoundError(sanitizedBody || 'unknown');
      case 429:
        throw new SumoRateLimitError();
      case 400: {
        // Check for parse/query errors
        if (sanitizedBody.includes('parse.error') || sanitizedBody.includes('no.query')) {
          throw new SumoQuerySyntaxError(
            `Query syntax error: ${sanitizedBody}`,
          );
        }
        throw new SumoQuerySyntaxError(
          `Bad request: ${sanitizedBody}`,
        );
      }
      case 500:
      case 503:
        throw new SumoServiceError(
          `Sumo Logic service error (${response.status}): ${sanitizedBody}`,
          response.status,
        );
      default:
        throw new SumoServiceError(
          `Unexpected response from Sumo Logic (${response.status}): ${sanitizedBody}`,
          response.status,
        );
    }
  }

  private sanitize(text: string): string {
    return redactSecrets(text, {
      sumoAccessId: this.config.accessId,
      sumoAccessKey: this.config.accessKey,
    });
  }
}
