import { useQuery } from "@tanstack/react-query";

interface PremiumFeatureInfo {
  id: string;
  name: string;
  description: string;
  minimumTier: string;
  creditCost: number;
  unit?: string;
  monthlyLimits?: Record<string, number>;
  availableAsAddon?: boolean;
}

interface PremiumAccessResult {
  allowed: boolean;
  reason?: string;
  creditCost?: number;
  remainingCredits?: number;
  suggestedTier?: string;
}

interface PremiumFeaturesResponse {
  success: boolean;
  features: PremiumFeatureInfo[];
  creditPackages: Array<{
    id: string;
    name: string;
    credits: number;
    price: number;
  }>;
}

/**
 * Hook to fetch all premium features and credit packages
 * Uses GET /api/premium-features
 */
export function usePremiumFeatures() {
  const { data, isLoading, error, refetch } = useQuery<PremiumFeaturesResponse>({
    queryKey: ["/api/premium-features"],
    staleTime: 60000,
  });

  return {
    features: data?.features || [],
    creditPackages: data?.creditPackages || [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to check access for a specific premium feature
 * Uses GET /api/premium-features/:featureId/check?units=...
 * Server resolves workspace from authenticated user's employee record
 */
export function usePremiumAccess(
  featureId: string,
  units?: number
) {
  const queryParams = new URLSearchParams();
  if (units) queryParams.set("units", units.toString());
  const queryString = queryParams.toString();
  const endpoint = `/api/premium-features/${featureId}/check${queryString ? `?${queryString}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery<PremiumAccessResult>({
    queryKey: [endpoint],
    enabled: !!featureId,
    staleTime: 10000,
  });

  return {
    allowed: data?.allowed || false,
    reason: data?.reason,
    creditCost: data?.creditCost,
    remainingCredits: data?.remainingCredits,
    suggestedTier: data?.suggestedTier,
    isLoading,
    error,
    refetch,
  };
}

interface ChatroomPremiumStatus {
  success: boolean;
  trinityRecording: {
    enabled: boolean;
    available: boolean;
    creditCost: number;
  };
  aiDar: {
    enabled: boolean;
    available: boolean;
    creditCost: number;
  };
}

/**
 * Hook to get premium feature status for a specific chatroom
 * Uses GET /api/shift-chatrooms/:chatroomId/premium-status
 */
export function usePremiumFeatureStatus(chatroomId?: string) {
  const endpoint = chatroomId ? `/api/shift-chatrooms/${chatroomId}/premium-status` : null;
  
  const { data, isLoading, error, refetch } = useQuery<ChatroomPremiumStatus>({
    queryKey: [endpoint],
    enabled: !!chatroomId && !!endpoint,
    staleTime: 30000,
  });

  return {
    trinityRecording: data?.trinityRecording || { enabled: false, available: false, creditCost: 5 },
    aiDar: data?.aiDar || { enabled: false, available: false, creditCost: 2 },
    isLoading,
    error,
    refetch,
  };
}
