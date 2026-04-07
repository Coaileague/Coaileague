import { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '@/lib/apiError';

export interface AsyncDataState<T> {
  data: T | undefined;
  isLoading: boolean;
  isEmpty: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAsyncData<T>(
  queryResult: UseQueryResult<T>,
  isEmpty?: (data: T) => boolean
): AsyncDataState<T> {
  const { data, isLoading, isError, error, refetch } = queryResult;

  if (isError && error instanceof ApiError && error.status === 401) {
    window.location.href = '/login';
  }

  const emptyCheck = isEmpty
    ? (data !== undefined && isEmpty(data))
    : (Array.isArray(data) && data.length === 0);

  return {
    data,
    isLoading,
    isEmpty: !isLoading && !isError && emptyCheck,
    isError,
    error: isError ? (error as Error) : null,
    refetch
  };
}
