// Custom session-based authentication
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Extended user type including platform role
interface AuthUser extends Omit<User, 'passwordHash' | 'resetToken' | 'resetTokenExpiry' | 'verificationToken' | 'verificationTokenExpiry'> {
  platformRole?: 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'none' | null;
}

interface AuthResponse {
  user: AuthUser;
  // Payment status fields (present when 402 is returned)
  paymentRequired?: boolean;
  isOwner?: boolean;
  reason?: 'suspended' | 'cancelled';
  workspaceName?: string;
  redirectTo?: string;
}

export function useAuth() {
  const { data, isLoading, error } = useQuery<AuthResponse | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      
      // Not authenticated
      if (res.status === 401) {
        return null;
      }
      
      // Handle 304 Not Modified - use cached data
      if (res.status === 304) {
        return undefined;
      }
      
      // CRITICAL: Handle 402 Payment Required for OWNERS
      // Owner is still authenticated, just needs to pay
      if (res.status === 402) {
        const paymentData = await res.json();
        console.log('[useAuth] 402 Payment Required:', paymentData);
        
        // If owner, keep them "authenticated" so they can see the modal
        if (paymentData.isOwner === true) {
          return {
            user: {
              id: 'payment-pending',
              email: '',
              firstName: 'Payment',
              lastName: 'Required',
            } as AuthUser,
            paymentRequired: true,
            isOwner: true,
            reason: paymentData.reason,
            workspaceName: paymentData.workspaceName,
            redirectTo: paymentData.redirectTo,
          };
        }
        
        // Non-owner with 402 - treat as unauthenticated
        // The payment enforcement hook will handle the logout
        return null;
      }
      
      // Handle 404 Organization Inactive (for non-owners)
      if (res.status === 404) {
        const data = await res.json();
        if (data.code === 'ORGANIZATION_INACTIVE') {
          console.log('[useAuth] 404 Organization Inactive:', data);
          // Let payment enforcement handle this
          return null;
        }
      }
      
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      
      return await res.json();
    },
  });

  return {
    user: data?.user,
    isLoading,
    isAuthenticated: !!data?.user,
    // Expose payment state for components that need it
    paymentRequired: data?.paymentRequired ?? false,
    isOwner: data?.isOwner,
  };
}
