// Custom session-based authentication
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Extended user type including platform role
interface AuthUser extends Omit<User, 'passwordHash' | 'resetToken' | 'resetTokenExpiry' | 'verificationToken' | 'verificationTokenExpiry'> {
  platformRole?: 'root' | 'deputy_admin' | 'deputy_assistant' | 'sysop' | 'support' | 'none' | null;
}

interface AuthResponse {
  user: AuthUser;
}

export function useAuth() {
  const { data, isLoading } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
    retry: false,
    retryOnMount: false,
    staleTime: Infinity, // Never auto-refetch
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  return {
    user: data?.user,
    isLoading,
    isAuthenticated: !!data?.user,
  };
}
