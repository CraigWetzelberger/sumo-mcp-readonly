import { z } from 'zod';

const LogLevel = z.enum(['debug', 'info', 'warn', 'error']).default('info');

const configSchema = z.object({
  sumoAccessId: z.string().min(1, 'SUMO_ACCESS_ID is required'),
  sumoAccessKey: z.string().min(1, 'SUMO_ACCESS_KEY is required'),
  sumoApiBaseUrl: z
    .string()
    .min(1, 'SUMO_API_BASE_URL is required')
    .url('SUMO_API_BASE_URL must be a valid URL')
    .refine((url) => !url.endsWith('/'), {
      message: 'SUMO_API_BASE_URL must not end with a trailing slash',
    }),
  sumoDefaultSourceCategory: z.string().optional(),
  sumoMaxQueryRangeMinutes: z.number().int().positive().default(1440),
  sumoMaxResultCount: z.number().int().positive().max(100000).default(1000),
  sumoQueryTimeoutSeconds: z.number().int().positive().default(120),
  logLevel: LogLevel,
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly details: string[],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return NaN; // Let Zod handle the error
  return parsed;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const raw = {
    sumoAccessId: env.SUMO_ACCESS_ID ?? '',
    sumoAccessKey: env.SUMO_ACCESS_KEY ?? '',
    sumoApiBaseUrl: env.SUMO_API_BASE_URL ?? '',
    sumoDefaultSourceCategory: env.SUMO_DEFAULT_SOURCE_CATEGORY || undefined,
    sumoMaxQueryRangeMinutes: parseIntOrUndefined(env.SUMO_MAX_QUERY_RANGE_MINUTES),
    sumoMaxResultCount: parseIntOrUndefined(env.SUMO_MAX_RESULT_COUNT),
    sumoQueryTimeoutSeconds: parseIntOrUndefined(env.SUMO_QUERY_TIMEOUT_SECONDS),
    logLevel: env.LOG_LEVEL ?? undefined,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(
      `Configuration validation failed:\n${details.join('\n')}`,
      details,
    );
  }

  return result.data;
}
