import { z } from 'zod';

export const AnyResponse = z.union([z.object({}).passthrough(), z.array(z.unknown())]);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiContractViolation extends Error {
  constructor(
    public endpoint: string,
    public validationError: string
  ) {
    super(`API response contract violation on ${endpoint}: ${validationError}`);
    this.name = 'ApiContractViolation';
  }
}

export async function apiFetch<T>(
  url: string,
  schema: { parse: (data: unknown) => T },
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });

  if (response.status === 401) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
  }

  if (response.status === 403) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      (body as any).code ?? 'API_ERROR',
      (body as any).error ?? `Request failed with status ${response.status}`
    );
  }

  const json = await response.json();

  try {
    return schema.parse(json);
  } catch (validationError) {
    throw new ApiContractViolation(
      url,
      validationError instanceof Error
        ? validationError.message
        : String(validationError)
    );
  }
}
