export type ErrorType =
  | 'timeout'
  | 'rate_limit'
  | 'network'
  | 'database'
  | 'validation'
  | 'permission'
  | 'not_found'
  | 'unknown';

export class ErrorClassifier {
  classify(error: Error | any): ErrorType {
    const msg = (error.message || '').toLowerCase();

    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('rate limit')) return 'rate_limit';
    if (msg.includes('network') || msg.includes('unavailable')) return 'network';
    if (msg.includes('database') || msg.includes('connection')) return 'database';
    if (msg.includes('validation') || msg.includes('invalid')) return 'validation';
    if (msg.includes('permission') || msg.includes('denied')) return 'permission';
    if (msg.includes('not found')) return 'not_found';

    return 'unknown';
  }

  isRetryable(errorType: ErrorType): boolean {
    const retryable: ErrorType[] = ['timeout', 'rate_limit', 'network', 'database'];
    return retryable.includes(errorType);
  }

  isUserError(errorType: ErrorType): boolean {
    const userErrors: ErrorType[] = ['validation', 'permission', 'not_found'];
    return userErrors.includes(errorType);
  }

  getHttpStatus(errorType: ErrorType): number {
    const statusMap: Record<ErrorType, number> = {
      validation: 400,
      permission: 403,
      not_found: 404,
      rate_limit: 429,
      timeout: 504,
      network: 503,
      database: 500,
      unknown: 500,
    };

    return statusMap[errorType];
  }
}
