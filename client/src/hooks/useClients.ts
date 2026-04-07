import { useQuery, useMutation, type UseQueryResult } from "@tanstack/react-query";
import type { Client } from "@shared/schema";
import type { PaginatedResponse, ClientWithInvoiceCount } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiError";
import { PaginatedClientListResponse, ClientListResponse } from "@shared/schemas/responses/clients";

export interface ClientsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  sort?: 'createdAt' | 'firstName' | 'lastName' | 'companyName';
  order?: 'asc' | 'desc';
  workspaceId?: string;
}

export function useClientsTable(params: ClientsQueryParams = {}): UseQueryResult<PaginatedResponse<ClientWithInvoiceCount>> {
  // Provide stable defaults to prevent unnecessary refetches
  const queryParams = {
    page: params.page || 1,
    limit: params.limit || 10,
    ...(params.search && { search: params.search }),
    ...(params.status && params.status !== 'all' && { status: params.status }),
    ...(params.sort && { sort: params.sort }),
    ...(params.order && { order: params.order }),
    ...(params.workspaceId && { workspaceId: params.workspaceId }),
  };
  
  return useQuery({
    queryKey: ["/api/clients", queryParams],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined) params.append(k, String(v));
      });
      return apiFetch(`/api/clients?${params.toString()}`, PaginatedClientListResponse) as Promise<PaginatedResponse<ClientWithInvoiceCount>>;
    },
  });
}

export function useClientLookup(): UseQueryResult<Client[]> {
  return useQuery({
    queryKey: ["/api/clients/lookup"],
    queryFn: () => apiFetch('/api/clients/lookup', ClientListResponse) as Promise<Client[]>,
  });
}

export function useCreateClient() {
  return useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients/lookup"] });
    },
  });
}

export function useUpdateClient() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest("PATCH", `/api/clients/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients/lookup"] });
    },
  });
}

export function useDeleteClient() {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients/lookup"] });
    },
  });
}
