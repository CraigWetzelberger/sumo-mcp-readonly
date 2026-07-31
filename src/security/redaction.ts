export interface RedactionConfig {
  sumoAccessId: string;
  sumoAccessKey: string;
}

export function redactSecrets(text: string, config: RedactionConfig): string {
  let result = text;

  if (config.sumoAccessId) {
    result = result.replaceAll(config.sumoAccessId, '[REDACTED_ACCESS_ID]');
  }
  if (config.sumoAccessKey) {
    result = result.replaceAll(config.sumoAccessKey, '[REDACTED_ACCESS_KEY]');
  }

  // Redact Basic auth header values (Base64-encoded credentials)
  result = result.replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [REDACTED]');

  // Redact Bearer tokens if present
  result = result.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');

  // Redact Authorization header in JSON-like contexts
  result = result.replace(
    /("?[Aa]uthorization"?\s*[:=]\s*"?)(.*?)("|\s|$)/g,
    '$1[REDACTED]$3',
  );

  return result;
}
