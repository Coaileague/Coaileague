// Custom session-based authentication
import { secureFetch } from "@/lib/csrf";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Extended user type including platform role and workspace role for RBAC
interface AuthUser extends Omit<User, 'passwordHash' | 'resetToken' | 'resetTokenExpiry' | 'verificationToken' | 'verificationTokenExpiry'> {
  platformRole?: 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'none' | null;
  workspaceRole?: 'org_owner' | 'co_owner' | 'department_manager' | 'supervisor' | 'staff' | 'auditor' | 'contractor' | null;
  employeeId?: string | null;
  organizationalTitle?: 'staff' | 'supervisor' | 'manager' | 'director' | 'owner' | null;
}

interface AuthResponse {
  user: AuthUser | null;
  // Payment status fields (present when 402 is returned for owners)
  paymentRequired?: boolean;
  isOwner?: boolean;
  reason?: 'suspended' | 'cancelled' | 'no_workspace';
  workspaceName?: string;
  redirectTo?: string;
  // Org inactive fields (present when 404 ORGANIZATION_INACTIVE is returned)
  orgInactive?: boolean;
  // DB degraded: circuit open at startup — user is still authenticated but
  // data is served from session cache.  Frontend should show amber banner.
  _dbDegraded?: boolean;
}

export function useAuth() {
  const { data, isLoading, isFetching, error } = useQuery<AuthResponse | null>({
    queryKey: ["/api/auth/me"],
    // Retry up to 8 times for server errors (5xx / network) — DB may be briefly unavailable
    // on startup. 503 specifically means the circuit breaker or DB is not yet warmed up.
    // Never retry for client auth errors (4xx) — those are definitive answers.
    retry: (failureCount, err: any) => {
      const status = parseInt(err?.message?.split(":")[0]);
      if (status >= 400 && status < 500) return false; // auth decision is final
      return failureCount < 8; // retry aggressively for 5xx / network errors
    },
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 10_000),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    queryFn: async () => {
      const res = await secureFetch("/api/auth/me", {
        credentials: "include",
      });

      // Not authenticated — session is gone entirely
      if (res.status === 401) {
        return null;
      }

      // Handle 304 Not Modified — use cached data
      if (res.status === 304) {
        return undefined;
      }

      // 402 Payment Required — org subscription lapsed
      if (res.status === 402) {
        const paymentData = await res.json();

        if (paymentData.user) {
          // Owner or any user with data: keep them authenticated so they see the
          // payment restoration screen instead of the login page
          return {
            user: paymentData.user as AuthUser,
            paymentRequired: true,
            isOwner: paymentData.isOwner === true,
            reason: paymentData.reason,
            workspaceName: paymentData.workspaceName,
            redirectTo: paymentData.redirectTo || '/org-management',
          };
        }

        // No user data — treat as unauthenticated
        return null;
      }

      // 404 Organization Inactive — org is suspended/cancelled but user is authenticated
      if (res.status === 404) {
        const payload = await res.json();
        if (payload.code === 'ORGANIZATION_INACTIVE') {
          return {
            // Include whatever user data the server sent so we can personalise the screen
            user: payload.user ?? null,
            orgInactive: true,
            isOwner: payload.isOwner === true,
            reason: payload.reason,
            workspaceName: payload.workspaceName,
            redirectTo: payload.redirectTo,
          };
        }
      }

      if (!res.ok) {
        // 5xx: server error (DB down, startup lag). Throw so retry logic above kicks in.
        // After retries exhausted, data remains undefined — isLoading=false, isAuthenticated=false.
        throw new Error(`${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      // If the server returned _dbDegraded we still have a user object — honour it
      return json as AuthResponse;
    },
  });

  return {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    user: data?.user ?? null,
    isLoading,
    isFetching,
    // Only truly "authenticated" when we have a user AND the org is not suspended
    // @ts-expect-error — TS migration: fix in refactoring sprint
    isAuthenticated: !!data?.user && !data?.orgInactive && !data?.paymentRequired,
    // Payment required: owner needs to update billing to restore service
    // @ts-expect-error — TS migration: fix in refactoring sprint
    paymentRequired: data?.paymentRequired ?? false,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    isOwner: data?.isOwner ?? false,
    // Org inactive: shown to employees whose org is suspended/cancelled
    // @ts-expect-error — TS migration: fix in refactoring sprint
    orgInactive: data?.orgInactive ?? false,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    orgInactiveReason: data?.reason,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    orgInactiveName: data?.workspaceName,
    // DB degraded: circuit open at startup — amber banner should be shown
    // @ts-expect-error — TS migration: fix in refactoring sprint
    dbDegraded: data?._dbDegraded ?? false,
  };
}
