import { useQuery } from "@tanstack/react-query";
import { getFeatureFlags, hasFeature, getUpgradeMessage, getTierDisplayName, TIER_FEATURES } from "@/lib/featureFlags";
import type { FeatureFlags } from "@/lib/featureFlags";

interface Workspace {
  id: string;
  name: string;
  subscriptionTier?: string | null;
  maxEmployees?: number;
  maxClients?: number;
}

interface User {
  id: string;
  email: string;
  platformRole?: string | null;
}

/**
 * Hook to access feature flags based on current workspace subscription tier
 * Platform staff (root, deputy_admin, deputy_assistant, sysop, support) get full Elite-tier access
 */
export function useFeatureFlags() {
  const { data: workspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  // Check if user has platform staff role - grant Elite access
  const isPlatformStaff = user?.platformRole && 
    ['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(user.platformRole);

  // Platform staff always get Elite tier access regardless of workspace tier
  const tier = isPlatformStaff ? 'elite' : (workspace?.subscriptionTier || 'free');
  const flags = isPlatformStaff ? TIER_FEATURES.elite : getFeatureFlags(tier);

  return {
    tier,
    tierName: getTierDisplayName(tier),
    flags,
    isPlatformStaff,
    hasFeature: (feature: keyof FeatureFlags) => {
      // Platform staff always have access to all features
      if (isPlatformStaff) return true;
      return hasFeature(tier, feature);
    },
    getUpgradeMessage: (feature: keyof FeatureFlags) => getUpgradeMessage(tier, feature),
    workspace,
  };
}
