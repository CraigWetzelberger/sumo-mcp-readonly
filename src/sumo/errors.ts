export class SumoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'SumoApiError';
  }
}

export class SumoAuthError extends SumoApiError {
  constructor(message = 'Authentication failed: invalid access ID or access key') {
    super(message, 401, 'unauthorized');
    this.name = 'SumoAuthError';
  }
}

export class SumoAuthorizationError extends SumoApiError {
  constructor(message = 'Authorization failed: insufficient permissions for this operation') {
    super(message, 403, 'forbidden');
    this.name = 'SumoAuthorizationError';
  }
}

export class SumoRateLimitError extends SumoApiError {
  constructor(
    message = 'Rate limit exceeded: too many API requests or too many active search jobs',
  ) {
    super(message, 429, 'rate.limit.exceeded');
    this.name = 'SumoRateLimitError';
  }
}

export class SumoTimeoutError extends SumoApiError {
  constructor(message = 'Search job timed out') {
    super(message, 0, 'timeout');
    this.name = 'SumoTimeoutError';
  }
}

export class SumoQuerySyntaxError extends SumoApiError {
  constructor(message = 'Query syntax error') {
    super(message, 400, 'parse.error');
    this.name = 'SumoQuerySyntaxError';
  }
}

export class SumoServiceError extends SumoApiError {
  constructor(message = 'Sumo Logic service error', statusCode = 500) {
    super(message, statusCode, 'service.error');
    this.name = 'SumoServiceError';
  }
}

export class SumoJobNotFoundError extends SumoApiError {
  constructor(jobId: string) {
    super(`Job ID not found or expired: ${jobId}`, 404, 'jobid.invalid');
    this.name = 'SumoJobNotFoundError';
  }
}
