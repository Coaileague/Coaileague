import { createLogger } from '../../lib/logger';
const log = createLogger('aiRetryWrapper');

export class AIServiceUnavailableError extends Error {
  declare cause: Error;
  constructor(label: string, attempts: number, cause: Error) {
    super(`AI service unavailable for "${label}" after ${attempts} attempts: ${cause.message}`);
    this.name = 'AIServiceUnavailableError';
    this.cause = cause;
  }
}

export interface AIRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
}

export async function withAIRetry<T>(
  fn: () => Promise<T>,
  opts: AIRetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? 'ai-call';

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        const jitter = Math.random() * 200;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        log.warn(
          `[AIRetry] Attempt ${attempt}/${maxAttempts} failed for "${label}": ${lastError.message}. Retrying in ${Math.round(delay)}ms…`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        log.error(
          `[AIRetry] All ${maxAttempts} attempts exhausted for "${label}": ${lastError.message}`
        );
      }
    }
  }

  throw new AIServiceUnavailableError(label, maxAttempts, lastError);
}
