export type SearchJobState =
  | 'NOT STARTED'
  | 'GATHERING RESULTS'
  | 'GATHERING RESULTS FROM SUBQUERIES'
  | 'FORCE PAUSED'
  | 'DONE GATHERING RESULTS'
  | 'DONE GATHERING HISTOGRAM'
  | 'CANCELLED';

export interface SumoSearchJobRequest {
  query: string;
  from: string; // ISO-8601 or epoch ms
  to: string; // ISO-8601 or epoch ms
  timeZone: string;
  byReceiptTime?: boolean;
  autoParsingMode?: string;
}

export interface SumoSearchJobResponse {
  id: string;
  link?: { rel: string; href: string };
  warning?: string;
}

export interface SumoHistogramBucket {
  length: number;
  count: number;
  startTimestamp: number;
}

export interface SumoJobStatus {
  state: SearchJobState;
  messageCount: number;
  recordCount: number;
  pendingErrors: string[];
  pendingWarnings: string[];
  histogramBuckets: SumoHistogramBucket[];
}

export interface SumoField {
  name: string;
  fieldType: string;
  keyField: boolean;
}

export interface SumoMessage {
  map: Record<string, string>;
}

export interface SumoMessagesResponse {
  fields: SumoField[];
  messages: SumoMessage[];
  warning?: string;
}

export interface SumoRecord {
  map: Record<string, string>;
}

export interface SumoRecordsResponse {
  fields: SumoField[];
  records: SumoRecord[];
  warning?: string;
}

export interface JobRegistryEntry {
  createdAt: Date;
  query: string;
  from: string;
  to: string;
}
