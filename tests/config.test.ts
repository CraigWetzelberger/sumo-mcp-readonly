import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../src/config.js';

const validEnv = {
  SUMO_ACCESS_ID: 'suABCDEF12345',
  SUMO_ACCESS_KEY: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
  SUMO_API_BASE_URL: 'https://api.us2.sumologic.com/api',
};

describe('loadConfig', () => {
  it('loads valid complete config', () => {
    const config = loadConfig({
      ...validEnv,
      SUMO_DEFAULT_SOURCE_CATEGORY: 'prod/app',
      SUMO_MAX_QUERY_RANGE_MINUTES: '60',
      SUMO_MAX_RESULT_COUNT: '500',
      SUMO_QUERY_TIMEOUT_SECONDS: '60',
      LOG_LEVEL: 'debug',
    });

    expect(config.sumoAccessId).toBe('suABCDEF12345');
    expect(config.sumoAccessKey).toBe('abcdefghijklmnopqrstuvwxyz1234567890ABCDEF');
    expect(config.sumoApiBaseUrl).toBe('https://api.us2.sumologic.com/api');
    expect(config.sumoDefaultSourceCategory).toBe('prod/app');
    expect(config.sumoMaxQueryRangeMinutes).toBe(60);
    expect(config.sumoMaxResultCount).toBe(500);
    expect(config.sumoQueryTimeoutSeconds).toBe(60);
    expect(config.logLevel).toBe('debug');
  });

  it('applies defaults for optional fields', () => {
    const config = loadConfig(validEnv);

    expect(config.sumoDefaultSourceCategory).toBeUndefined();
    expect(config.sumoMaxQueryRangeMinutes).toBe(1440);
    expect(config.sumoMaxResultCount).toBe(1000);
    expect(config.sumoQueryTimeoutSeconds).toBe(120);
    expect(config.logLevel).toBe('info');
  });

  it('throws ConfigError when SUMO_ACCESS_ID is missing', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUMO_ACCESS_ID: '',
      }),
    ).toThrow(ConfigError);

    try {
      loadConfig({ ...validEnv, SUMO_ACCESS_ID: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).message).toContain('SUMO_ACCESS_ID');
    }
  });

  it('throws ConfigError when SUMO_ACCESS_KEY is missing', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUMO_ACCESS_KEY: undefined,
      }),
    ).toThrow(ConfigError);
  });

  it('throws ConfigError when SUMO_API_BASE_URL is missing', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUMO_API_BASE_URL: '',
      }),
    ).toThrow(ConfigError);
  });

  it('throws ConfigError when SUMO_API_BASE_URL is not a valid URL', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUMO_API_BASE_URL: 'not-a-url',
      }),
    ).toThrow(ConfigError);
  });

  it('throws ConfigError when SUMO_API_BASE_URL has trailing slash', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUMO_API_BASE_URL: 'https://api.sumologic.com/api/',
      }),
    ).toThrow(ConfigError);
  });

  it('throws ConfigError when numeric fields are not valid numbers', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SUMO_MAX_QUERY_RANGE_MINUTES: 'abc',
      }),
    ).toThrow(ConfigError);
  });

  it('throws ConfigError when LOG_LEVEL is invalid', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow(ConfigError);
  });

  it('provides clear error details array', () => {
    try {
      loadConfig({});
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.details.length).toBeGreaterThan(0);
      expect(err.details.some((d) => d.includes('SUMO_ACCESS_ID'))).toBe(true);
    }
  });
});
