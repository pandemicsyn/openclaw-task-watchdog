export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitterMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayForAttempt(options: RetryOptions, attempt: number): number {
  const raw = Math.min(
    options.baseDelayMs * options.factor ** Math.max(0, attempt - 1),
    options.maxDelayMs,
  );
  const jitter = options.jitterMs > 0 ? Math.floor(Math.random() * options.jitterMs) : 0;
  return raw + jitter;
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const shouldRetry = options.shouldRetry ? options.shouldRetry(error, attempt) : true;
      if (!shouldRetry || attempt >= options.attempts) {
        throw error;
      }
      await sleep(delayForAttempt(options, attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
