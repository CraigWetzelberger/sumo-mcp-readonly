import { SumoClient } from './client.js';
import { SumoTimeoutError } from './errors.js';
import type {
  SumoSearchJobRequest,
  SumoJobStatus,
  SumoMessage,
  SumoRecord,
  SearchJobState,
} from './types.js';
import { logger } from '../logging.js';

export interface ExecuteSearchOptions {
  includeMessages?: boolean;
  includeRecords?: boolean;
  maxResults: number;
  timeoutMs: number;
  pollIntervalMs?: number;
}

export interface ExecuteSearchResult {
  jobId: string;
  status: SearchJobState;
  messages: SumoMessage[];
  records: SumoRecord[];
  messageCount: number;
  recordCount: number;
  warnings: string[];
  truncated: boolean;
}

const TERMINAL_STATES: SearchJobState[] = [
  'DONE GATHERING RESULTS',
  'DONE GATHERING HISTOGRAM',
  'FORCE PAUSED',
  'CANCELLED',
];

function isTerminalState(state: SearchJobState): boolean {
  return TERMINAL_STATES.includes(state);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeSearch(
  client: SumoClient,
  request: SumoSearchJobRequest,
  options: ExecuteSearchOptions,
): Promise<ExecuteSearchResult> {
  const {
    includeMessages = true,
    includeRecords = true,
    maxResults,
    timeoutMs,
    pollIntervalMs = 2000,
  } = options;

  // Step 1: Create the search job
  const jobId = await client.createSearchJob(request);
  const warnings: string[] = [];

  try {
    // Step 2: Poll until completion or timeout
    const deadline = Date.now() + timeoutMs;
    let status: SumoJobStatus;

    do {
      if (Date.now() > deadline) {
        // Timeout — cancel the job
        try {
          await client.deleteJob(jobId);
        } catch {
          // Best-effort cancellation
        }
        throw new SumoTimeoutError(
          `Search job ${jobId} timed out after ${timeoutMs}ms`,
        );
      }

      await sleep(pollIntervalMs);
      status = await client.getJobStatus(jobId);

      // Collect any pending warnings
      if (status.pendingWarnings.length > 0) {
        warnings.push(...status.pendingWarnings);
      }
      if (status.pendingErrors.length > 0) {
        warnings.push(...status.pendingErrors.map((e) => `ERROR: ${e}`));
      }

      logger.debug('Poll status', {
        jobId,
        state: status.state,
        messageCount: status.messageCount,
        recordCount: status.recordCount,
      });
    } while (!isTerminalState(status.state));

    // Step 3: Retrieve results with pagination
    const messages: SumoMessage[] = [];
    const records: SumoRecord[] = [];
    let truncated = false;

    if (includeMessages && status.messageCount > 0) {
      const limit = Math.min(maxResults, status.messageCount);
      const pageSize = Math.min(10000, limit);
      let offset = 0;

      while (offset < limit) {
        const currentPageSize = Math.min(pageSize, limit - offset);
        const page = await client.getMessages(jobId, offset, currentPageSize);
        messages.push(...page.messages);
        if (page.warning) warnings.push(page.warning);
        offset += page.messages.length;
        if (page.messages.length < currentPageSize) break;
      }

      if (status.messageCount > limit) {
        truncated = true;
      }
    }

    if (includeRecords && status.recordCount > 0) {
      const limit = Math.min(maxResults, status.recordCount);
      const pageSize = Math.min(10000, limit);
      let offset = 0;

      while (offset < limit) {
        const currentPageSize = Math.min(pageSize, limit - offset);
        const page = await client.getRecords(jobId, offset, currentPageSize);
        records.push(...page.records);
        if (page.warning) warnings.push(page.warning);
        offset += page.records.length;
        if (page.records.length < currentPageSize) break;
      }

      if (status.recordCount > limit) {
        truncated = true;
      }
    }

    return {
      jobId,
      status: status.state,
      messages,
      records,
      messageCount: status.messageCount,
      recordCount: status.recordCount,
      warnings,
      truncated,
    };
  } catch (err) {
    // If we get a non-timeout error, still try to cancel
    if (!(err instanceof SumoTimeoutError)) {
      try {
        await client.deleteJob(jobId);
      } catch {
        // Best-effort cleanup
      }
    }
    throw err;
  }
}
