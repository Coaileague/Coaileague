/**
 * @deprecated Use RBACRoute instead: <RBACRoute require="platform_admin">...</RBACRoute>
 * This file is maintained for backward compatibility.
 */
import React from 'react';
import { RBACRoute } from "./rbac-route";

export function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <RBACRoute require="platform_admin">
      {children}
    </RBACRoute>
  );
}
