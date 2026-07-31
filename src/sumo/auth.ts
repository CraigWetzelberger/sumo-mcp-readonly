/**
 * Creates an HTTP Basic Authentication header value from Sumo Logic credentials.
 */
export function createBasicAuthHeader(accessId: string, accessKey: string): string {
  const credentials = `${accessId}:${accessKey}`;
  const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
  return `Basic ${encoded}`;
}
