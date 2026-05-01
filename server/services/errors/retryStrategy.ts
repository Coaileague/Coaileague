export class RetryStrategy {
  private maxRetries = 3;
  private baseDelayMs = 100;
  private maxDelayMs = 5000;

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          const delayMs = this.calculateDelay(attempt);
          await this.sleep(delayMs);
        }
      }
    }

    throw {
      original: lastError,
      attempts: this.maxRetries + 1,
      message: `Failed after ${this.maxRetries + 1} attempts: ${lastError.message}`,
    };
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * exponentialDelay * 0.1;
    return Math.min(exponentialDelay + jitter, this.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
