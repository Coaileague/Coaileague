/**
 * useEmployees - Hook for fetching all employees in the workspace
 * Used by BroadcastComposer and other components that need employee lists
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/config/queryKeys";
import { apiGet } from "@/lib/apiClient";

export interface Employee {
  id: string;
  workspaceId: string;
  userId: string | null;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  workspaceRole: string | null;
  status: string | null;
}

export function useEmployees() {
  const { data, isLoading, error, refetch } = useQuery<{ data: Employee[]; pagination: any }>({
    queryKey: queryKeys.employees.all,
    queryFn: () => apiGet('employees.list'),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    employees: data?.data || [],
    isLoading,
    error,
    refetch,
  };
}
