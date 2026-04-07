// Employee data hook for RBAC tracking
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

interface Employee {
  id: string;
  workspaceId: string;
  userId: string | null;
  employeeNumber: string | null; // EMP-XXXX-00001 format for RBAC tracking
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  role: string | null; // Job title
  workspaceRole: 'org_owner' | 'co_owner' | 'manager' | 'staff' | null;
  platformRole: string | null; // Platform role for support staff (root_admin, support_manager, support_agent, etc.)
  hourlyRate: string | null;
  color: string | null;
  onboardingStatus: string | null;
  status: 'active' | 'inactive' | null;
  hireDate: string | null;
  terminationDate: string | null;
  certifications: string[] | null;
  licenses: string[] | null;
  w9OnFile: boolean | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeeResponse {
  id: string;
  workspaceId: string;
  userId: string | null;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  role: string | null;
  workspaceRole: string | null;
  platformRole: string | null; // Platform role for support staff
  hourlyRate: string | null;
  color: string | null;
  onboardingStatus: string | null;
  status: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  certifications: string[] | null;
  licenses: string[] | null;
  w9OnFile: boolean | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to fetch current user's employee record
 * CRITICAL for RBAC: Provides employee ID for tracking and audit trails
 */
export function useEmployee() {
  const { user, isAuthenticated } = useAuth();

  const { data, isLoading, error } = useQuery<EmployeeResponse>({
    queryKey: ["/api/employees/me"],
    retry: false,
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    employee: data,
    isLoading,
    hasEmployeeRecord: !!data,
    employeeId: data?.employeeNumber, // Human-readable employee ID (EMP-XXXX-00001)
    workspaceRole: data?.workspaceRole,
  };
}
