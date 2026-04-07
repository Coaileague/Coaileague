/**
 * useRoleLabels — Workspace Role Display Names
 * =============================================
 * Returns the display name for any workspace role in the current org.
 * Falls back to platform defaults if no custom label is set.
 *
 * Usage:
 *   const { getRoleLabel, labels, isLoading } = useRoleLabels();
 *   getRoleLabel('employee') // → "Security Officer" (or custom label)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';

export const PLATFORM_DEFAULT_LABELS: Record<string, string> = {
  org_owner:          'Owner',
  co_owner:           'Deputy Chief',
  org_admin:          'Office Administrator',
  org_manager:        'Operations Manager',
  manager:            'Shift Supervisor',
  department_manager: 'Department Manager',
  supervisor:         'Supervisor',
  staff:              'Staff',
  employee:           'Security Officer',
  auditor:            'Regulatory Auditor',
  contractor:         'Contract Officer',
};

export interface RoleLabelEntry {
  role: string;
  displayName: string;
  defaultLabel: string;
  isCustom: boolean;
}

export function useRoleLabels() {
  const { workspaceId } = useWorkspaceAccess();

  const query = useQuery<{ labels: RoleLabelEntry[] }>({
    queryKey: ['/api/role-labels'],
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  function buildDefaults(): RoleLabelEntry[] {
    return Object.entries(PLATFORM_DEFAULT_LABELS).map(([role, defaultLabel]) => ({
      role,
      displayName: defaultLabel,
      defaultLabel,
      isCustom: false,
    }));
  }

  function getRoleLabel(role: string): string {
    if (!query.data?.labels) return PLATFORM_DEFAULT_LABELS[role] ?? role;
    const entry = query.data.labels.find((e) => e.role === role);
    return entry?.displayName ?? PLATFORM_DEFAULT_LABELS[role] ?? role;
  }

  return {
    labels: query.data?.labels ?? buildDefaults(),
    isLoading: query.isLoading,
    getRoleLabel,
  };
}

export function useRoleLabelMutations() {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspaceAccess();

  const save = useMutation({
    mutationFn: ({ role, displayName }: { role: string; displayName: string }) =>
      apiRequest('PUT', `/api/role-labels/${role}`, { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/role-labels', workspaceId] });
    },
  });

  const reset = useMutation({
    mutationFn: ({ role }: { role: string }) =>
      apiRequest('DELETE', `/api/role-labels/${role}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/role-labels', workspaceId] });
    },
  });

  return { save, reset };
}
