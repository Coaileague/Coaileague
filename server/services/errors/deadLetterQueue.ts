export interface DeadLetterEntry {
  id: string;
  operation: any;
  enqueuedAt: Date;
  retryCount: number;
  lastError?: string;
}

export class DeadLetterQueue {
  private queue: DeadLetterEntry[] = [];

  enqueue(operation: any, error?: any): DeadLetterEntry {
    const entry: DeadLetterEntry = {
      id: `dlq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      operation,
      enqueuedAt: new Date(),
      retryCount: 0,
      lastError: error?.message,
    };

    this.queue.push(entry);
    return entry;
  }

  dequeue(): DeadLetterEntry | undefined {
    return this.queue.shift();
  }

  peek(): DeadLetterEntry | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  getAll(): DeadLetterEntry[] {
    return this.queue;
  }

  incrementRetry(id: string): void {
    const entry = this.queue.find(e => e.id === id);
    if (entry) entry.retryCount++;
  }

  clear(): void {
    this.queue = [];
  }
}
