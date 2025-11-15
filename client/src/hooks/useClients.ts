import { useQuery, useMutation, type UseQueryResult } from "@tanstack/react-query";
import type { Client } from "@shared/schema";
import type { PaginatedResponse, ClientWithInvoiceCount } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface ClientsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  sort?: 'createdAt' | 'firstName' | 'lastName' | 'companyName';
  order?: 'asc' | 'desc';
}

export function useClientsTable(params: ClientsQueryParams = {}): UseQueryResult<PaginatedResponse<ClientWithInvoiceCount>> {
  return useQuery({
    queryKey: ["/api/clients", params],
  });
}

export function useClientLookup(): UseQueryResult<Client[]> {
  return useQuery({
    queryKey: ["/api/clients/lookup"],
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
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients/lookup"] });
    },
  });
}
