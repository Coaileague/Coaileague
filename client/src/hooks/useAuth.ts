// Custom session-based authentication
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Extended user type including platform role
interface AuthUser extends Omit<User, 'passwordHash' | 'resetToken' | 'resetTokenExpiry' | 'verificationToken' | 'verificationTokenExpiry'> {
  platformRole?: 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'none' | null;
}

interface AuthResponse {
  user: AuthUser;
}

export function useAuth() {
  const { data, isLoading, error } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
    retry: false,
    retryOnMount: false,
    staleTime: Infinity, // Never auto-refetch
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    // Return null on 401 instead of throwing error
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      
      if (res.status === 401) {
        return null;
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
  };
}
