/**
 * useSites - Hook for fetching sites in the workspace
 * Used by PassDownComposer for site selection
 */

import { useQuery } from "@tanstack/react-query";

export interface Site {
  id: string;
  workspaceId: string;
  clientId: string | null;
  subClientId: string | null;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string | null;
}

export function useSites() {
  const { data, isLoading, error, refetch } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    sites: data || [],
    isLoading,
    error,
    refetch,
  };
}
